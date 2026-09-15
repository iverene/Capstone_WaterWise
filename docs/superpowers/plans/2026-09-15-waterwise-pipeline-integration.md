# WaterWise Pipeline Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the verified `waterwise-pipeline-prototype` into the main repo as a pinned `pipeline/` submodule with versioned marts DDL, hardened DAG paths, verified `stg_*` outputs, and a validated same-DB marts-only end-to-end run.

**Architecture:** Submodule owns all Python/dbt/Airflow code and its own venv; main repo owns the submodule pointer, a versioned `backend/db/marts_analytics_migration.sql`, a read-only `backend/models/martsModels.js`, root `.gitignore`, and the contract note. Least-privilege Postgres roles enforce the OLTP-read-only / mart-write-only boundary.

**Tech Stack:** Git submodules, Supabase Postgres (psql / SQL editor), Node 20+ ESM backend (`@supabase/supabase-js` service_role client in `backend/config/supabase.js`), Python venv + Polars/ConnectorX + psycopg2-binary, dbt Core (DuckDB), Apache Airflow (`ExternalPythonOperator`, `BashOperator`).

## Global Constraints

- Work ONLY on branch `feature/pipeline-analytics-demo`. Do NOT merge to `main` when finished.
- PowerShell 5.1 shell: chain dependent commands with `cmd1; if ($?) { cmd2 }`. Never use `&&`.
- Never commit secrets: `pipeline/.env`, `backend/.env` are gitignored. Commit only `pipeline/.env.example`.
- Pipeline is read-only on `consumers`, `consumption`, `billing`, `payments`; writes ONLY to `mart_*` tables (incl. `mart_pipeline_execution_logs`).
- `PIPELINE_ROOT = Path(__file__).resolve().parents[2]` for `pipeline/airflow/dags/*.py`. No hardcoded home dirs.
- Python binary resolution order: `PIPELINE_PYTHON_BIN` env var, then `<VENV>/Scripts/python.exe` (Windows), then `<VENV>/bin/python` (Linux).
- `log_run` task uses `trigger_rule="all_done"`. `retries=2` on extract/load, `retries=0` on dbt run/test.
- Every migration SQL statement must be idempotent (`IF NOT EXISTS` / `DO $$` existence checks).
- Spec location: `docs/superpowers/specs/2026-09-15-waterwise-pipeline-integration-design.md`.

---

## File map

- Modify (new file): `.gitignore` (repo root) — root hygiene; covers `pipeline/.env`, OS cruft.
- Create (in submodule `pipeline/`): `.env.example` — documents `PIPELINE_PYTHON_BIN`, `PIPELINE_VENV`, `SUPABASE_DB_URL_RO`, `SUPABASE_DB_URL_MART`, `DBT_PROFILES_DIR`.
- Create: `backend/db/marts_analytics_migration.sql` — 5× `mart_*` + `mart_pipeline_execution_logs`, RLS, `USAGE` + table grants, idempotent roles.
- Modify (in submodule): `pipeline/airflow/dags/waterwise_batch_pipeline.py` — path/env hardening.
- Modify (in submodule): `pipeline/dbt_waterwise/models/staging/stg_consumers.sql`, `stg_consumption.sql`, `stg_billing.sql`, `stg_payments.sql` — verify-only (amended; see Task 5).
- Create: `backend/models/martsModels.js` — read-only mart queries via existing `backend/config/supabase.js` service_role client.
- Reference only (never edit in this plan): `backend/db/migration.sql`, `backend/config/supabase.js`, `CONTEXT.md`.

---

### Task 1: Pin `pipeline/` submodule to verified SHA

**Files:**
- Modify: `.gitmodules` (created by command)
- Dependency: submodule pointer `pipeline` @ verified SHA

**Interfaces:**
- Consumes: prototype remote `https://github.com/iverene/waterwise-pipeline-prototype.git`
- Produces: `pipeline/` working copy other tasks edit; pinned SHA recorded in this task's commit message

- [ ] **Step 1: Resolve the verified commit SHA**

Run: `git ls-remote https://github.com/iverene/waterwise-pipeline-prototype.git HEAD`
Expected: one line `<SHA>\tHEAD`. Record the 40-char SHA as `$SHA` for the steps below. If the owner has designated a different verified commit than `HEAD`, use that SHA instead and note its source (tag, PR merge, owner message) in the commit message.

- [ ] **Step 2: Add the submodule pinned to that SHA**

Run: `git submodule add https://github.com/iverene/waterwise-pipeline-prototype.git pipeline; if ($?) { git -C pipeline checkout $SHA }`
Expected: `pipeline/` directory appears with prototype files; `git -C pipeline rev-parse HEAD` prints `$SHA`.

- [ ] **Step 3: Verify pointer and layout**

Run: `git status --short; if ($?) { Get-ChildItem pipeline }`
Expected: `.gitmodules` + `pipeline` gitlink shown as new; `pipeline/` contains `scripts/`, `dbt_waterwise/`, `airflow/`. If `airflow/dags/waterwise_batch_pipeline.py` is missing or named differently, record the actual DAG path — Task 4 depends on it.

- [ ] **Step 4: Commit**

Run: `git add .gitmodules pipeline; if ($?) { git commit -m "chore: add pipeline submodule pinned to <first-8-of-SHA>" }`
Expected: commit succeeds on `feature/pipeline-analytics-demo`; replace `<first-8-of-SHA>` with the real short SHA, no angle brackets left.

---

### Task 2: Root `.gitignore` + pipeline `.env.example`

**Files:**
- Create: `.gitignore` (repo root)
- Create: `pipeline/.env.example` (inside submodule working copy; pushed with Task 4/5's submodule push)

**Interfaces:**
- Consumes: none
- Produces: hygiene proof for Task 8; env contract consumed by Task 4 DAG code

- [ ] **Step 1: Write root `.gitignore`**

```gitignore
# Pipeline local secrets (belt-and-braces; pipeline/.gitignore also covers these)
pipeline/.env
.env

# Pipeline runtime artifacts (in case anyone runs outside the submodule)
*.duckdb
*.parquet
airflow/logs/
*.log

# OS cruft
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Write `pipeline/.env.example`**

```dotenv
# Explicit Python binary for the pipeline venv (preferred over PIPELINE_VENV fallback).
# Windows example: C:\path\to\waterwise-pipeline-prototype\venv\Scripts\python.exe
# Linux example:   /home/user/waterwise-pipeline-prototype/venv/bin/python
PIPELINE_PYTHON_BIN=

# Pipeline venv root (fallback when PIPELINE_PYTHON_BIN is unset)
PIPELINE_VENV=

# Least-privilege connections (never commit real values)
SUPABASE_DB_URL_RO=
SUPABASE_DB_URL_MART=

# dbt profiles directory containing profiles.yml
DBT_PROFILES_DIR=
```

- [ ] **Step 3: Prove hygiene with `git check-ignore`**

Run: `New-Item -ItemType File -Path pipeline/.env -Force; if ($?) { git check-ignore -v pipeline/.env }; if ($?) { Remove-Item pipeline/.env -Force }`
Expected: `git check-ignore` prints a matching ignore rule line for `pipeline/.env`. The dummy file is deleted afterwards; `git status --short` must not list it.

- [ ] **Step 4: Commit root `.gitignore` (keep `.env.example` uncommitted in superproject — it commits with the submodule push in Task 4)**

Run: `git add .gitignore; if ($?) { git commit -m "chore: root gitignore for pipeline artifacts and secrets" }`
Expected: commit succeeds; `git status --short` shows only the untracked `pipeline/.env.example` content inside the submodule (as modified submodule content), nothing else.

---

### Task 3: `backend/db/marts_analytics_migration.sql` (DDL + RLS + grants)

**Files:**
- Create: `backend/db/marts_analytics_migration.sql`
- Test: apply + verification queries in Steps 5–7 (psql with a superuser/service connection string, or Supabase SQL editor)

**Interfaces:**
- Consumes: column list from `scripts/supabase_marts_ddl.sql` in `pipeline/` (Task 1 output). Ground truth (verified 2026-09-15): six tables — `mart_purok_monthly_reports`, `mart_delinquent_accounts_summary`, `mart_system_consumption_summary`, `mart_monthly_financial_summary`, `mart_consumer_monthly_benchmarks`, `mart_pipeline_execution_logs` (run_id text PK, started_at, finished_at, rows_extracted, rows_transformed, rows_loaded, status, error_message). DuckDB-side model names are unprefixed (`load.py` strips `mart_`); Supabase targets are prefixed. If the checked-out SHA differs, use its exact definitions and record the deviation.
- Produces: six populated-by-pipeline tables with RLS + grants, consumed by Tasks 6–8

- [ ] **Step 1: Read the prototype DDL source of truth**

Read `pipeline/scripts/supabase_marts_ddl.sql` in full. If the file does not exist, list `pipeline/scripts/` and use whichever `*marts*ddl*.sql` / `*ddl*.sql` file exists; if none exists, STOP and report — do not invent mart column definitions.

- [ ] **Step 2: Write the migration with exact prototype columns plus the guardrail block**

Create `backend/db/marts_analytics_migration.sql`. Copy the `CREATE TABLE` statements verbatim from the prototype DDL (adapting only `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`), then append this guardrail block exactly (proposed role names `waterwise_extractor_ro` / `waterwise_mart_writer`):

```sql
-- Guardrail: least-privilege roles (idempotent).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'waterwise_extractor_ro') THEN
        CREATE ROLE waterwise_extractor_ro WITH LOGIN PASSWORD NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'waterwise_mart_writer') THEN
        CREATE ROLE waterwise_mart_writer WITH LOGIN PASSWORD NULL;
    END IF;
END;
$$;

-- Schema usage must accompany table grants, or the roles cannot reach the tables.
GRANT USAGE ON SCHEMA public TO waterwise_extractor_ro, waterwise_mart_writer;

-- Read-only OLTP access for extract.
GRANT SELECT ON public.consumers TO waterwise_extractor_ro;
GRANT SELECT ON public.consumption TO waterwise_extractor_ro;
GRANT SELECT ON public.billing TO waterwise_extractor_ro;
GRANT SELECT ON public.payments TO waterwise_extractor_ro;

-- Mart-write access for load/log_run (upsert only, no DELETE).
GRANT SELECT, INSERT, UPDATE ON public.mart_system_consumption_summary TO waterwise_mart_writer;
GRANT SELECT, INSERT, UPDATE ON public.mart_purok_monthly_reports TO waterwise_mart_writer;
GRANT SELECT, INSERT, UPDATE ON public.mart_delinquent_accounts_summary TO waterwise_mart_writer;
GRANT SELECT, INSERT, UPDATE ON public.mart_consumer_monthly_benchmarks TO waterwise_mart_writer;
GRANT SELECT, INSERT, UPDATE ON public.mart_monthly_financial_summary TO waterwise_mart_writer;
GRANT SELECT, INSERT ON public.mart_pipeline_execution_logs TO waterwise_mart_writer;

-- Harden new tables: RLS on, no anon/authenticated access (mirrors backend/db/migration.sql convention).
ALTER TABLE public.mart_system_consumption_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mart_purok_monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mart_delinquent_accounts_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mart_consumer_monthly_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mart_monthly_financial_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mart_pipeline_execution_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mart_system_consumption_summary FROM anon, authenticated;
REVOKE ALL ON public.mart_purok_monthly_reports FROM anon, authenticated;
REVOKE ALL ON public.mart_delinquent_accounts_summary FROM anon, authenticated;
REVOKE ALL ON public.mart_consumer_monthly_benchmarks FROM anon, authenticated;
REVOKE ALL ON public.mart_monthly_financial_summary FROM anon, authenticated;
REVOKE ALL ON public.mart_pipeline_execution_logs FROM anon, authenticated;
```

Table-name note: the six names above are the prototype DDL's exact names (verified). If a future prototype SHA renames them, use its exact names throughout and update Tasks 6–8 accordingly.

- [ ] **Step 3: Syntax-check the file without a database**

Run: `node --check backend/db/marts_analytics_migration.sql 2>&1 | Out-Null; Get-Content backend/db/marts_analytics_migration.sql | Select-String -Pattern 'CREATE TABLE IF NOT EXISTS', 'GRANT USAGE ON SCHEMA public', 'ENABLE ROW LEVEL SECURITY'`
Expected: all three patterns match at least once each (this is a SQL file, so `node --check` is expected to fail — the `Select-String` output is the real check). If psql is available, additionally run `psql "$ADMIN_URL" --dry-run` is NOT a thing — skip; real validation is Step 5.

- [ ] **Step 4: Commit the migration file (unapplied)**

Run: `git add backend/db/marts_analytics_migration.sql; if ($?) { git commit -m "feat(db): versioned marts + execution-log DDL with least-privilege grants" }`
Expected: commit succeeds; nothing applied to any database yet.

- [ ] **Step 5: Apply to the live Supabase project (creates EMPTY tables only — no OLTP writes)**

Run the file in the Supabase SQL editor (or `psql` with an admin connection string). Then verify:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
AND tablename IN ('mart_system_consumption_summary','mart_purok_monthly_reports','mart_delinquent_accounts_summary','mart_consumer_monthly_benchmarks','mart_monthly_financial_summary','mart_pipeline_execution_logs');
```

Expected: 6 rows. If mart names were adapted in Step 2, assert those names instead.

- [ ] **Step 6: Prove `anon`/`authenticated` are blocked**

```sql
-- Paste into SQL editor "Run as anon" if available; otherwise confirm via:
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name LIKE 'mart_%' AND grantee IN ('anon','authenticated');
```

Expected: zero rows (no grants). If the editor cannot impersonate `anon`, the empty grant query is sufficient proof combined with the `REVOKE` statements.

- [ ] **Step 7: Snapshot OLTP baseline counts (needed by Task 8)**

```sql
SELECT 'consumers' t, COUNT(*) FROM public.consumers
UNION ALL SELECT 'consumption', COUNT(*) FROM public.consumption
UNION ALL SELECT 'billing', COUNT(*) FROM public.billing
UNION ALL SELECT 'payments', COUNT(*) FROM public.payments;
```

Record the four numbers in the Task 8 validation result (commit message or a comment in the validation log). Do not proceed to Task 8 without them.

---

### Task 4: Harden the DAG (paths, binary, cwd, trigger rule, retries)

**Files:**
- Modify (in submodule): `pipeline/airflow/dags/waterwise_batch_pipeline.py` (actual path confirmed in Task 1 Step 3)
- Modify (in submodule): `pipeline/.env.example` already created in Task 2 — include it in this task's submodule commit
- Test: `python -m py_compile` on the DAG file; Airflow `dags test` dry-run in Step 5

**Interfaces:**
- Consumes: `pipeline/.env` values (`PIPELINE_PYTHON_BIN`, `PIPELINE_VENV`, `SUPABASE_DB_URL_RO`, `SUPABASE_DB_URL_MART`, `DBT_PROFILES_DIR`) — read from env, never hardcoded
- Produces: hardened DAG consumed by Task 8 validation run

- [ ] **Step 1: Read the current DAG and locate hardcoded anchors**

Read the DAG file in full. Confirm the presence of the hardcoded strings `~/airflow-venv`, `./venv` (or equivalents) and `sys.path` injection / `BashOperator` dbt calls. Record the exact task ids for extract, dbt run, dbt test, load, log_run — Steps 3–4 edit them by id.

- [ ] **Step 2: Insert the path-resolution helper at the top of the DAG (after imports)**

```python
import os
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[2]  # pipeline/airflow/dags/*.py -> pipeline/
PIPELINE_VENV = Path(os.environ.get("PIPELINE_VENV", PIPELINE_ROOT / "venv"))


def resolve_pipeline_python() -> str:
    explicit = os.environ.get("PIPELINE_PYTHON_BIN")
    if explicit:
        return explicit
    windows_bin = PIPELINE_VENV / "Scripts" / "python.exe"
    if windows_bin.exists():
        return str(windows_bin)
    return str(PIPELINE_VENV / "bin" / "python")


PIPELINE_PYTHON = resolve_pipeline_python()
DBT_PROJECT_DIR = PIPELINE_ROOT / "dbt_waterwise"
```

Add `PIPELINE_ROOT / "scripts"` to `sys.path` using `PIPELINE_ROOT` (replacing any hardcoded `sys.path.insert` with a home-dir or relative literal).

- [ ] **Step 3: Rewire operators**

Apply exactly: `ExternalPythonOperator` tasks (extract, load, log_run) get `python=PIPELINE_PYTHON`; dbt `BashOperator` tasks get `cwd=str(DBT_PROJECT_DIR)` plus `env={**os.environ, "DBT_PROFILES_DIR": os.environ.get("DBT_PROFILES_DIR", str(PIPELINE_ROOT))}` with no inline `cd`; `log_run` gets `trigger_rule="all_done"`; extract and load get `retries=2, retry_delay=timedelta(minutes=2)`; dbt run and dbt test get `retries=0`. Import `timedelta` from `datetime` if not already imported.

- [ ] **Step 4: Per-task credential split without touching scripts**

Ground truth: `scripts/extract.py` and `scripts/load.py` both read a single `SUPABASE_DB_URL` env var. Do NOT edit the scripts. Instead, give each `ExternalPythonOperator` task its own env override: extract gets `env={**os.environ, "SUPABASE_DB_URL": os.environ["SUPABASE_DB_URL_RO"]}`; load and log_run get `env={**os.environ, "SUPABASE_DB_URL": os.environ["SUPABASE_DB_URL_MART"]}`. Fail fast at DAG parse time if the needed var is missing: `os.environ["SUPABASE_DB_URL_RO"]` / `os.environ["SUPABASE_DB_URL_MART"]` (bracket access, so a missing key raises immediately with a clear name).

- [ ] **Step 5: Compile-check the DAG**

Run (from the submodule root, using the pipeline venv python): `pipeline-python -m py_compile airflow/dags/waterwise_batch_pipeline.py` — concretely: `& "$env:PIPELINE_PYTHON_BIN" -m py_compile pipeline/airflow/dags/waterwise_batch_pipeline.py` (or the `PIPELINE_VENV` fallback binary from Task 2). Run from repo root `C:\Users\Iverene Grace\Projects\Capstone_WaterWise`.
Expected: exit 0, no output. Fix any `SyntaxError` before continuing.

- [ ] **Step 6: Airflow DAG dry-run parse test**

Run: `airflow dags test waterwise_batch_pipeline 2026-09-15` (replace with the DAG's actual `dag_id` recorded in Step 1 if different; a parse-only alternative is `airflow dags show waterwise_batch_pipeline`).
Expected: DAG parses with 6 tasks (extract, dbt_run, dbt_test, load, log_run + any pre-existing sensor). Do NOT trigger a live scheduled run here — full execution is Task 8.

- [ ] **Step 7: Commit + push inside the submodule, bump pointer in superproject**

Run: `git -C pipeline add airflow/dags/waterwise_batch_pipeline.py .env.example; if ($?) { git -C pipeline commit -m "refactor(airflow): env-relative paths, cross-platform python, fail-closed log_run" }; if ($?) { git -C pipeline push }; if ($?) { git add pipeline; if ($?) { git commit -m "chore: bump pipeline pointer (hardened DAG)" } }`
Expected: submodule push succeeds, superproject commit records the new gitlink SHA. Verify with `git -C pipeline rev-parse HEAD` and `git ls-tree HEAD pipeline`.

---

### Task 5: Remap the four `stg_*` models to the real OLTP schema

**Files:**
- Modify (in submodule): the four staging models (exact names confirmed: `stg_consumers.sql`, `stg_consumption.sql`, `stg_billing.sql`, `stg_payments.sql` under `pipeline/dbt_waterwise/models/staging/`)
- Test: `dbt parse` + `dbt test` in Steps 3–4

**Interfaces:**
- Consumes: real OLTP columns from `backend/db/migration.sql` and the prototype's own verified `stg_*` outputs (consumer_id, purok_no, billing_id, consumption_cbm, total_bill, payment_id — see Step 2)
- Produces: UNCHANGED `stg_*` outputs (verify-and-preserve; see amendment note below) consumed by downstream `int_*`/`marts_*`

> **Amendment 2026-09-15 (human-approved verify-and-preserve):** ground truth shows the prototype's `stg_*` outputs already match the real OLTP schema (`user_id→consumer_id` alias, `lower(status)`, type casts) and the canonical names from `CONTEXT.md §3` (`bill_id`, `amount_due`, `consumption_m3`, `purok_id`, `reading_id`, `amount_paid`, `meter_serial_number`) appear NOWHERE in `pipeline/dbt_waterwise/models/`. Renaming would break the verified graph. This task therefore VERIFIES instead of remapping: keep all `stg_*` SQL byte-identical unless `dbt parse`/`dbt test` against real extracts reveals a genuine gap. The `ref('stg_billing')` join idea is withdrawn — `stg_payments` stays join-free (enrichment already lives in `int_billing_payments`).

- [ ] **Step 1: Read the four staging models and record their output column lists**

Read `pipeline/dbt_waterwise/models/staging/stg_consumers.sql`, `stg_consumption.sql`, `stg_billing.sql`, `stg_payments.sql` in full. Record each output alias. Expected baseline: `stg_consumers` → `consumer_id, username, first_name, middle_name, last_name, purok_no, consumer_status`; `stg_consumption` → `consumption_id, consumer_id, reading_date, year_month, previous_reading, present_reading, consumption_cbm, is_initial, is_reset`; `stg_billing` → `billing_id, consumption_id, consumer_id, billing_date, due_date, year_month, total_bill, remaining_balance, billing_status`; `stg_payments` → `payment_id, billing_id, total_paid, payment_date, payment_timestamp, payment_method, reference_number`. Sources are `read_parquet('../data/raw/*.parquet')` — do NOT migrate to `source()`/`ref()` in this task.

- [ ] **Step 2: Cross-check each output against the real OLTP schema — change nothing unless a gap is proven**

For each `stg_*` output column, confirm the underlying Parquet column exists in `backend/db/migration.sql` (`consumers`: id, username, first_name, middle_name, last_name, purok_no, status; `consumption`: id, consumer_id, reading_date, previous_reading, present_reading, consumption; `billing`: id, consumption_id, user_id, billing_date, due_date, total_bill, remaining_balance, status; `payments`: id, billing_id, total_paid, payment_date, payment_method, reference_number, created_at). Known non-issues (do NOT "fix"): `previous_reading is null as is_initial` (column is NOT NULL in OLTP, so always false — harmless); `payment_date` derived via `timezone('UTC', created_at)` (matches pipeline convention); `year_month` derived via `date_trunc('month', …)` (matches `load.py` conflict targets). If and only if a referenced column is genuinely absent from OLTP, fix that single line minimally and document it.

- [ ] **Step 3: Prove no canonical-name references exist (guard against silent drift)**

Run (from repo root): `Select-String -Path 'pipeline/dbt_waterwise/models/**/*.sql' -Pattern 'meter_serial_number| as bill_id|amount_due|consumption_m3|purok_id|reading_id|amount_paid|billing_period'`
Expected: zero matches. Any match is a FAIL — investigate before continuing (it means someone renamed outputs without updating downstream).

- [ ] **Step 4: `dbt parse` clean (full graph, real logic, DuckDB)**

Run (from `pipeline/dbt_waterwise` with the pipeline venv active): `dbt parse`
Expected: parse clean with no model errors. `dbt test` on staging requires built relations/real extracts and runs in Task 8 — this step gates on parse only. On parse failure caused by a genuine OLTP gap found in Step 2, apply the minimal single-line fix, re-run parse, and document the change.

- [ ] **Step 5: Commit only if changed; otherwise record verification with an empty commit**

If Step 2/4 produced fixes: run `git -C pipeline add dbt_waterwise/models/staging/; if ($?) { git -C pipeline commit -m "fix(dbt): align stg outputs to real OLTP schema" }; if ($?) { git -C pipeline push }; if ($?) { git add pipeline; if ($?) { git commit -m "chore: bump pipeline pointer (stg alignment)" } }`. If nothing changed (expected): run `git commit --allow-empty -m "verify(dbt): stg outputs already match real OLTP schema, no changes needed"` in the superproject to record the verification. Either way the pointer/outcome is committed, mirroring Task 4 Step 7.

---

### Task 6: Read-only `backend/models/martsModels.js`

**Files:**
- Create: `backend/models/martsModels.js`
- Test: `node --check` + live read smoke test in Steps 3–4

**Interfaces:**
- Consumes: `supabase` client from `../config/supabase.js` (service_role — bypasses RLS by design, so NO explicit SELECT policy is required; Step 4 proves this empirically)
- Produces: five read functions consumed by future dashboard routes (no routes wired in this plan — YAGNI)

- [ ] **Step 1: Study the existing model pattern**

Read `backend/models/billingModels.js` lines 100–140 (one `.from().select()` query with error handling) and copy its import + error-handling shape exactly. The new file must look like it belongs: `import { supabase } from "../config/supabase.js"`, async functions returning `{ data, error }`.

- [ ] **Step 2: Write the five read-only functions**

```js
// backend/models/martsModels.js
// Read-only dashboard access to pipeline marts. No writes by convention:
// every function below uses .select() only; adding .insert()/.update()/.delete()
// to this file is a review-blocking violation.
import { supabase } from "../config/supabase.js";

const MART_TABLES = {
  systemConsumption: "mart_system_consumption_summary",
  purokMonthly: "mart_purok_monthly_reports",
  delinquent: "mart_delinquent_accounts_summary",
  benchmarks: "mart_consumer_monthly_benchmarks",
  financial: "mart_monthly_financial_summary",
};

export async function getSystemConsumptionSummary(limit = 24) {
  return supabase.from(MART_TABLES.systemConsumption).select("*").order("year_month", { ascending: false }).limit(limit);
}

export async function getPurokMonthlyReports(purokNo = null, limit = 100) {
  let query = supabase.from(MART_TABLES.purokMonthly).select("*").limit(limit);
  if (purokNo !== null) query = query.eq("purok_no", purokNo);
  return query;
}

export async function getDelinquentAccounts(limit = 100) {
  return supabase.from(MART_TABLES.delinquent).select("*").limit(limit);
}

export async function getConsumerBenchmarks(consumerId, limit = 24) {
  return supabase.from(MART_TABLES.benchmarks).select("*").eq("consumer_id", consumerId).limit(limit);
}

export async function getMonthlyFinancialSummary(limit = 24) {
  return supabase.from(MART_TABLES.financial).select("*").order("year_month", { ascending: false }).limit(limit);
}
```

Ground-truth column names (from `pipeline/scripts/supabase_marts_ddl.sql`, verified): time grain is `year_month` (date), purok key is `purok_no` (int), consumer key is `consumer_id` (int). If the checked-out SHA's DDL differs, match it exactly — the DDL wins over this listing.

- [ ] **Step 3: Syntax-check**

Run: `node --check backend/models/martsModels.js`
Expected: exit 0, no output.

- [ ] **Step 4: Live read smoke test (proves service_role bypass, no policy needed)**

Run with `backend/.env` present (never printed):

```powershell
node -e "import('./backend/models/martsModels.js').then(async (m) => { const { data, error } = await m.getSystemConsumptionSummary(1); console.log(JSON.stringify({ rows: (data || []).length, error: error?.message || null })); })"
```

Expected: `{"rows":0,"error":null}` on empty marts (proves SELECT works through RLS with zero rows, no policy required). Any `error` mentioning RLS/policy means the service_role assumption is wrong — STOP and add an explicit `FOR SELECT USING (true)` policy analysis before continuing.

- [ ] **Step 5: Commit**

Run: `git add backend/models/martsModels.js; if ($?) { git commit -m "feat(backend): read-only marts models for dashboard" }`
Expected: commit succeeds; no routes modified.

---

### Task 7: Dual-role smoke test (before end-to-end)

**Files:** none (database verification only)
**Test:** the two psql checks below ARE the test

**Interfaces:**
- Consumes: roles + connection strings for `waterwise_extractor_ro` (`SUPABASE_DB_URL_RO`) and `waterwise_mart_writer` (`SUPABASE_DB_URL_MART`); set the two passwords/URLs per Supabase dashboard before starting
- Produces: go/no-go for Task 8

- [ ] **Step 1: Prove RO cannot write**

Run with the RO connection: `INSERT INTO public.mart_pipeline_execution_logs (run_id, status) VALUES ('__smoke_reject__', 'failed');`
Expected: `permission denied` error. Any success is a FAIL — fix grants (Task 3) before continuing.

- [ ] **Step 2: Prove MART writer is confined to marts + log**

Run with the MART connection, in order:

```sql
INSERT INTO public.mart_pipeline_execution_logs (run_id, status) VALUES ('__smoke_ok__', 'success') RETURNING run_id;
UPDATE public.mart_system_consumption_summary SET year_month = year_month WHERE false;
INSERT INTO public.consumers (username) VALUES ('__smoke_reject__');
```

Expected: statement 1 succeeds (capture the id, delete it afterwards with an admin connection); statement 2 succeeds (zero rows matched, no error); statement 3 fails with `permission denied`. Clean up the smoke log row via admin: `DELETE FROM public.mart_pipeline_execution_logs WHERE run_id = '__smoke_ok__';`

---

### Task 8: Same-DB marts-only end-to-end validation + idempotency proof

**Files:** none (runtime validation; record results in the commit message of Step 6)
**Test:** the chain below IS the test

**Interfaces:**
- Consumes: Tasks 1–7 outputs (pinned DAG, verified stg, empty marts, proven roles, baseline counts from Task 3 Step 7)
- Produces: populated marts, `success=true` log row, validation record

- [ ] **Step 1: Manual `extract` dry-run (zero writes)**

Trigger only the extract task (Airflow `dags test` on the extract task, or run `extract.py` with `SUPABASE_DB_URL_RO`). Compare Parquet row counts per entity against the Task 3 Step 7 baseline.
Expected: counts match exactly. Any mismatch is a FAIL — stop, do not run dbt.

- [ ] **Step 2: `dbt run` — 11 models green**

Run: `dbt run` from `pipeline/dbt_waterwise` (pipeline venv).
Expected: `Completed successfully` for all 11 models. Fix genuine OLTP-gap errors (Task 5) on failure; never proceed to tests on a partial run.

- [ ] **Step 3: `dbt test` — 19 tests pass (hard gate)**

Run: `dbt test`
Expected: all 19 pass. On ANY failure: `load` is skipped by design; fix the model/data issue and restart at Step 2.

- [ ] **Step 4: `load` then `load` again (idempotency proof)**

Run the load step twice back-to-back. After each run record:

```sql
SELECT 'mart_system_consumption_summary' t, COUNT(*) FROM public.mart_system_consumption_summary
UNION ALL SELECT 'mart_purok_monthly_reports', COUNT(*) FROM public.mart_purok_monthly_reports
UNION ALL SELECT 'mart_delinquent_accounts_summary', COUNT(*) FROM public.mart_delinquent_accounts_summary
UNION ALL SELECT 'mart_consumer_monthly_benchmarks', COUNT(*) FROM public.mart_consumer_monthly_benchmarks
UNION ALL SELECT 'mart_monthly_financial_summary', COUNT(*) FROM public.mart_monthly_financial_summary;
```

Expected: identical counts after run 1 and run 2 (`ON CONFLICT DO UPDATE`, no duplicates, no errors).

- [ ] **Step 5: Prove OLTP untouched + `log_run` recorded success**

Re-run the Task 3 Step 7 count query.
Expected: the four OLTP numbers are byte-identical to baseline. Then confirm: `SELECT run_id, status, finished_at FROM public.mart_pipeline_execution_logs ORDER BY finished_at DESC NULLS LAST LIMIT 1;` shows `status='success'`.

- [ ] **Step 6: Record the validation (commit the record, not data)**

Run: `git log --oneline -3; if ($?) { git status --short }`
Expected: working tree clean (validation writes only to the database, never to the repo). If clean, no commit is needed — report the validation numbers (baseline counts, mart counts ×2 runs, log id) as the final message. Any repo modification found here is a scope violation — inspect before finishing.

---

## Self-Review

**1. Spec coverage:** §1 submodule+DDL+models → Tasks 1, 3, 6. §2 stg contract (amended 2026-09-15 to verify-and-preserve; prototype outputs already match OLTP) → Task 5 Steps 1–5. §3 flow + `.env` + binary fallback + `cwd` + per-task credential split + two-tier gitignore → Tasks 2, 4, 8. §4 fail-closed gate + `all_done` + retries + RLS/roles → Tasks 3, 4, 7. §5 order (prototype-first, pointer bump) + role smoke + double-load idempotency → Tasks 4–8 ordering. Kickoff checkpoints: schema USAGE → Task 3 Step 2; service_role bypass proof → Task 6 Step 4; SHA pin → Task 1. Ground-truth corrections applied: log table `mart_pipeline_execution_logs` (not `pipeline_run_log`); mart grain/key columns `year_month`/`purok_no`/`consumer_id`; scripts keep singular `SUPABASE_DB_URL` with DAG per-task env override; deps file is `requirements.txt`. No spec section left without a task.

**2. Placeholder scan:** No TBD/TODO; every short-SHA/SHA reference is produced by a concrete command in its own task; mart/table names defer to the prototype DDL via an explicit read-first step with a STOP condition rather than invented values.

**3. Type consistency:** Role names (`waterwise_extractor_ro`, `waterwise_mart_writer`), env names, `PIPELINE_ROOT`/`PIPELINE_PYTHON` identifiers, and mart table names are spelled identically across all tasks.
