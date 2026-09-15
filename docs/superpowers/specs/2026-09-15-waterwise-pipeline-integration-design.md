# WaterWise Pipeline Integration Design

Date: 2026-09-15
Status: Approved (all 5 sections signed off in brainstorming)
Decision: Option A — Submodule + versioned DDL mirror
Blueprint: `CONTEXT.md` (corrected by this spec where it conflicts with real schema)

## 0. Locked decisions

- Layout: `pipeline/` git submodule → `https://github.com/iverene/waterwise-pipeline-prototype.git` (pinned commit, bumped explicitly). No root-level `/scripts`, `/dbt_waterwise`, `/airflow`, `/data`.
- Prototype source: remote repo above (branch/commit pinned at implementation time).
- DDL: incorporated into `backend/db/` as versioned migration (`backend/db/marts_analytics_migration.sql`).
- Validation target: same live Supabase DB, marts-only (read-only OLTP + mart-write grants).
- Paths: `.env` + `__file__`-relative resolution (`Path(__file__).resolve().parents[2]` confirmed for `pipeline/airflow/dags/waterwise_batch_pipeline.py` → `pipeline/`).
- Contract source of truth: `backend/db/migration.sql` (real schema). `CONTEXT.md §3` idealized names are remapped in `stg_*`, not migrated in backend.

## 1. Architecture & repo layout

- Submodule contents only: `scripts/extract.py`, `scripts/load.py`, `scripts/log_run.py`, `dbt_waterwise/` (11 models), `airflow/dags/waterwise_batch_pipeline.py`, `data/` (gitignored), `requirements-pipeline.txt`, `pipeline/.env.example`, pipeline-owned `.gitignore` (`data/raw/*.parquet`, `*.duckdb`, `airflow/logs/`, `airflow/*.db`, `venv/`).
- Main repo owns: `backend/db/marts_analytics_migration.sql` (creates 5× `mart_*` + `pipeline_run_log` with RLS `REVOKE ALL FROM anon, authenticated; GRANT ... TO service_role` plus pipeline roles), `backend/models/martsModels.js` (new file, read-only dashboard queries against marts), `docs/` contract note correcting `CONTEXT.md §3`.
- Guardrail enforced by grants: runtime uses (a) read-only role for `extract` on the 4 OLTP tables, (b) mart-write role for `load` on `mart_*` + `pipeline_run_log` only. Dashboard reads via existing `service_role` pattern.
- Backend (Node) and pipeline (Python) environments fully isolated: `requirements-pipeline.txt` lives in the submodule; nothing Python enters `backend/`.
- DAG path fix: `PIPELINE_ROOT = Path(__file__).resolve().parents[2]`; loads `pipeline/.env`; `ExternalPythonOperator(python=<resolved binary>)` + `BashOperator` for dbt with explicit env. No `~/airflow-venv` literals.

## 2. Upstream column contract (`stg_*`) — AMENDED 2026-09-15 (human-approved verify-and-preserve)

Ground truth from the pinned submodule (SHA `f98b37f5`) supersedes the remap table below: the prototype's `stg_*` outputs already match the real OLTP schema, and the `CONTEXT.md §3` canonical names (`consumer_id` as PK alias except where noted, `purok_id`, `meter_serial_number`, `reading_id`, `bill_id`, `amount_due`, `billing_period_*`, `amount_paid`) appear NOWHERE in `pipeline/dbt_waterwise/models/` (verified by grep). Renaming would break the verified `int_*`/`marts_*` graph, so `stg_*` SQL stays byte-identical (verify-only).

Actual verified outputs: `stg_consumers` → `consumer_id, username, first_name, middle_name, last_name, purok_no, consumer_status` (`lower(status)`); `stg_consumption` → `consumption_id, consumer_id, reading_date, year_month, previous_reading, present_reading, consumption_cbm, is_initial, is_reset`; `stg_billing` → `billing_id, consumption_id, consumer_id` (from `user_id`), `billing_date, due_date, year_month, total_bill, remaining_balance, billing_status` (`lower(status)`); `stg_payments` → `payment_id, billing_id, total_paid, payment_date` (from `created_at`), `payment_timestamp, payment_method, reference_number`, join-free (enrichment lives in `int_billing_payments`). Sources are `read_parquet('../data/raw/*.parquet')`, not `source()` refs. Log table is `mart_pipeline_execution_logs` (`run_id, started_at, finished_at, rows_extracted, rows_transformed, rows_loaded, status, error_message`), not `pipeline_run_log`. Mart grain/key columns are `year_month`/`purok_no`/`consumer_id`.

Original remap proposal (kept for audit trail, DO NOT IMPLEMENT):

- `stg_consumers` ← `public.consumers`: `id AS consumer_id`, `purok_no AS purok_id`, `status`, `created_at`. Include `CAST(NULL AS VARCHAR) AS meter_serial_number` only if any intermediate/benchmark model references it, so the dbt graph never breaks on the missing column.
- `stg_consumption` ← `public.consumption`: `id AS reading_id`, `consumer_id`, `reading_date`, `previous_reading`, `present_reading`, `consumption AS consumption_m3`.
- `stg_billing` ← `public.billing`: `id AS bill_id`, `user_id AS consumer_id`, `billing_date AS billing_period_start`, `total_bill AS amount_due`, `due_date`, `status`; carry `consumption_id` as join key. `billing_period_end` has no real column — derive as `due_date` (documented assumption; month-end logic already exists in `record_consumption_and_billing`).
- `stg_payments` ← `public.payments` joined to billing for consumer resolution: `payments.id AS payment_id`, `billing_id AS bill_id`, `billing.user_id AS consumer_id`, `payment_date`, `total_paid AS amount_paid`, `payment_method`. Resolve via `ref('stg_billing')` (or cleanly in `int_billing_payments`) so dbt lineage stays directed and acyclic.

Downstream `int_*` / `marts_*` keep canonical names; only the four `stg` SELECTs change. Any future OLTP rename updates these four files — recorded in the contract doc.

## 3. Data flow, `.env`, cross-platform paths, `.gitignore`

Flow: `extract` (Polars/ConnectorX → Parquet, RO URL only) → `dbt run` (11 models, DuckDB) → `dbt test` (19 tests, fail-closed gate) → `load` (Polars `df.rows()` + psycopg2-binary upserts, MART URL only) → `log_run` (fail-closed row to `pipeline_run_log`).

`.env` at `pipeline/.env` (never committed; `pipeline/.env.example` committed): `PIPELINE_PYTHON_BIN` (explicit, preferred) · `PIPELINE_VENV` (fallback root) · `SUPABASE_DB_URL_RO` · `SUPABASE_DB_URL_MART` · `DBT_PROFILES_DIR`. `PIPELINE_ROOT` derived, not stored.

Python binary fallback chain: (1) `PIPELINE_PYTHON_BIN` if set, (2) `<VENV>/Scripts/python.exe` if exists (Windows), (3) `<VENV>/bin/python` (Linux). Same helper injects `PIPELINE_ROOT/scripts` into `sys.path` for `ExternalPythonOperator`. `BashOperator` for dbt sets `cwd=str(PIPELINE_ROOT / "dbt_waterwise")` plus env dict — no inline `cd`.

`.gitignore` two-tier: pipeline-owned (submodule) covers `data/raw/*.parquet`, `*.duckdb`, `airflow/logs/`, `airflow/*.db`, `venv/`, `.env`. Main repo adds root `.gitignore` (new file) covering root `.env`, `pipeline/.env` belt-and-braces, OS cruft. `backend/.gitignore`, `frontend/.gitignore` untouched.

## 4. Fail-closed error handling + RLS safety

- Gate: `dbt test` (orphan consumption, billing/payment consistency, collection-efficiency sanity, delinquency 0–100%) is a hard gate; `load` keeps default `all_success`. `log_run` uses `trigger_rule="all_done"` and writes `success=false` + error excerpt on any upstream failure.
- Retries: `retries=2` with brief delay on `extract` and `load` (transient network); `retries=0` on `dbt_run` / `dbt_test` so modeling bugs fail immediately to `log_run`.
- DB roles (idempotent `DO $$` existence checks in migration; proposed names `waterwise_extractor_ro` / `waterwise_mart_writer`, finalized in plan): `REVOKE ALL ON mart_*, pipeline_run_log FROM anon, authenticated`; `GRANT SELECT, INSERT, UPDATE ON mart_* TO waterwise_mart_writer` (upsert only, no `DELETE`); `GRANT INSERT, SELECT ON pipeline_run_log TO waterwise_mart_writer`; `GRANT SELECT ON consumers, consumption, billing, payments TO waterwise_extractor_ro`. `ENABLE ROW LEVEL SECURITY` on all six new tables, matching `migration.sql` convention.
- App side: `backend/models/martsModels.js` reads marts via existing `service_role` pattern; no new auth surface, no OLTP write path.

## 5. Migration & validation checklist

Migration order: (1) commit/push DAG refactor + `stg_*` remaps inside `waterwise-pipeline-prototype` first; (2) `git submodule add https://github.com/iverene/waterwise-pipeline-prototype.git pipeline` + stage pinned pointer in main repo; (3) root `.gitignore` + `pipeline/.env.example`, verify with `git check-ignore`; (4) author/apply `backend/db/marts_analytics_migration.sql` (empty marts + log table only); (5) add `backend/models/martsModels.js`.

Pre-run role smoke test: RO URL rejected on write attempts; MART URL writes only to `mart_*` + `pipeline_run_log`.

Validation (same DB): snapshot OLTP counts → `extract` dry-run (Parquet counts = OLTP counts, zero writes) → `dbt run` (11 ok) → `dbt test` (19 pass, else stop) → `load` → run `load` twice back-to-back to prove `ON CONFLICT DO UPDATE` idempotency (row counts unchanged) → confirm OLTP counts unchanged + `anon`/`authenticated` blocked from marts → `log_run` row `success=true` → dashboard spot-check via `martsModels.js`.

## 6. Explicit non-goals (YAGNI)

No local Postgres fork, no Airflow Variables/Connections migration, no backend column renames, no new auth surface, no changes to existing models/routes beyond adding `martsModels.js` and the marts migration.
