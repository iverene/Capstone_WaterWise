# CONTENT.md — Data Pipeline Architecture & Integration

## 1. Overview

The main WaterWise application integrates with an external ELT batch analytics pipeline (`waterwise-pipeline-prototype`) orchestrated via Apache Airflow and powered by dbt Core. 

The pipeline automates:
1. **Extraction** of transactional records (OLTP) from the application's PostgreSQL/Supabase database.
2. **Transformation & Modeling** via dbt to calculate consumption trends, delinquent balances, and billing metrics.
3. **Delivery** of ready-to-query analytical data marts back into dedicated tables/views for UI reporting, decision support, and forecasting.

---

## 2. End-to-End Architecture


```

┌─────────────────────────┐
│ WaterWise Main App      │
│ (PostgreSQL / Supabase) │
└────────────┬────────────┘
│
│ 1. Batch Extraction (scripts/extract.py)
▼
┌─────────────────────────┐
│ Staging / Parquet Store │
└────────────┬────────────┘
│
│ 2. Staging Load (scripts/load.py)
▼
┌─────────────────────────┐
│ dbt Analytics Engine    │
│ • stg_*                 │
│ • int_*                 │
│ • marts_*               │
└────────────┬────────────┘
│
│ 3. Push Mart Results (scripts/supabase_marts_ddl.sql)
▼
┌─────────────────────────┐
│ Analytical Data Marts   │
│ (Consumed by Dashboard) │
└─────────────────────────┘

```

---

## 3. Upstream Data Contract (What the Pipeline Reads)

The pipeline extracts records from the main system schema across four primary operational entities. Ensure the following tables and fields remain backward-compatible:

| Source Entity | Expected Fields | Purpose |
| :--- | :--- | :--- |
| **`consumers`** | `consumer_id`, `purok_id` / `purok_name`, `meter_serial_number`, `status`, `created_at` | Consumer demographics, purok groupings, and meter metadata |
| **`consumption`** | `reading_id`, `consumer_id`, `reading_date`, `previous_reading`, `present_reading`, `consumption_m3` | Monthly volumetric meter logs and consumption deltas |
| **`billing`** | `bill_id`, `consumer_id`, `billing_period_start`, `billing_period_end`, `amount_due`, `due_date`, `status` | Billing cycles, amounts due, and payment deadlines |
| **`payments`** | `payment_id`, `bill_id`, `consumer_id`, `payment_date`, `amount_paid`, `payment_method` | Collections, cash-flow reconciliation, and receipt logging |

---

## 4. Downstream Data Marts (What the App Consumes)

The pipeline transforms staging and intermediate tables (`int_billing_payments`, `int_consumption_enriched`) into five high-performance analytical marts. The main application dashboard queries these marts directly:

### 1. `marts.system_consumption_summary`
* **Purpose:** System-wide monthly overview of total volume pumped/consumed, active meter counts, and aggregate peak consumption.
* **Usage in App:** High-level executive dashboards and water utility operational KPI cards.

### 2. `marts.purok_monthly_reports`
* **Purpose:** Granular breakdown of consumption, billings, collections, and active accounts aggregated by Purok.
* **Usage in App:** Purok-level comparison maps, distribution efficiency monitoring, and zone anomaly checks.

### 3. `marts.delinquent_accounts_summary`
* **Purpose:** Real-time ledger of overdue bills, delinquent balances, unpaid duration brackets, and consumer account flags.
* **Usage in App:** Disconnection notices, cashier flag alerts, and collector assignment lists.

### 4. `marts.consumer_monthly_benchmarks`
* **Purpose:** Per-consumer monthly usage compared against purok averages, percentiles, and historical rolling averages.
* **Usage in App:** Consumer-facing bill breakdowns, high-usage warnings, and leak anomaly detection.

### 5. `marts.monthly_financial_summary`
* **Purpose:** Billed amounts, actual collections, outstanding receivables, collection efficiency percentage, and delinquency ratios.
* **Usage in App:** Financial audit views, cashier reconciliation, and monthly treasury reports.

---

## 5. Data Integrity & Automated Testing

The pipeline runs automated dbt test suites before pushing data into production-ready marts:
* **`assert_no_orphan_consumption`**: Ensures every meter reading maps to a valid consumer.
* **`assert_billing_payment_consistency`**: Verifies total payments recorded do not exceed allowable thresholds for matching billing line items.
* **`assert_collection_efficiency_sane`**: Flags erroneous financial entries resulting in negative or mathematically impossible collection efficiency percentages.
* **`assert_delinquency_rate_range`**: Validates delinquency ratios remain between 0% and 100%.

---

## 6. Development & Operations Runbook

* **Orchestration:** Airflow runs batch DAG `waterwise_batch_pipeline` on a defined schedule (e.g., daily/monthly cutoff).
* **Database Migrations:** If modifying upstream schema names or types (`consumers`, `consumption`, `billing`, `payments`), notify the data engineering pipeline repository to update the corresponding `stg_*.sql` models.
* **Mart Schema Provisioning:** Mart destination tables can be verified or re-initialized using `scripts/supabase_marts_ddl.sql` from the pipeline repository.
