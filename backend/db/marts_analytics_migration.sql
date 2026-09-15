-- WaterWise analytics marts + pipeline execution log.
-- Source of truth: pipeline/scripts/supabase_marts_ddl.sql (verbatim columns,
-- adapted only CREATE TABLE -> CREATE TABLE IF NOT EXISTS). Creates EMPTY
-- tables only; no OLTP writes.

CREATE TABLE IF NOT EXISTS mart_purok_monthly_reports (year_month date, purok_no int, total_cbm double precision, active_consumers int, avg_per_household double precision, min_cbm double precision, max_cbm double precision, primary key (year_month, purok_no));
CREATE TABLE IF NOT EXISTS mart_delinquent_accounts_summary (year_month date, purok_no int, total_billed int, delinquent_count int, overdue_balance double precision, age_1_30 int, age_31_60 int, age_61_90 int, age_90_plus int, delinquency_rate double precision, primary key (year_month, purok_no));
CREATE TABLE IF NOT EXISTS mart_system_consumption_summary (year_month date primary key, total_cbm double precision, avg_cbm double precision, min_cbm double precision, max_cbm double precision, reading_count int, prev_month_cbm double precision, mom_change_rate double precision);
CREATE TABLE IF NOT EXISTS mart_monthly_financial_summary (year_month date primary key, total_billed double precision, total_collected double precision, outstanding_balance double precision, collection_efficiency double precision, bills_issued int, paid_count int, partial_count int, unpaid_count int, overdue_count int);
CREATE TABLE IF NOT EXISTS mart_consumer_monthly_benchmarks (year_month date, consumer_id int, purok_no int, cbm double precision, rolling_3mo double precision, rolling_6mo double precision, purok_avg double precision, system_avg double precision, vs_purok_diff double precision, primary key (year_month, consumer_id));
CREATE TABLE IF NOT EXISTS mart_pipeline_execution_logs (run_id text primary key, started_at timestamptz, finished_at timestamptz, rows_extracted int, rows_transformed int, rows_loaded int, status text, error_message text);

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
GRANT SELECT, INSERT, UPDATE ON public.mart_pipeline_execution_logs TO waterwise_mart_writer;

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

-- Reader policies for extract (idempotent; mirrors the option-(a) writer policies).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consumers' AND policyname = 'waterwise_extractor_ro_read') THEN
        CREATE POLICY waterwise_extractor_ro_read ON public.consumers FOR SELECT TO waterwise_extractor_ro USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consumption' AND policyname = 'waterwise_extractor_ro_read') THEN
        CREATE POLICY waterwise_extractor_ro_read ON public.consumption FOR SELECT TO waterwise_extractor_ro USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'billing' AND policyname = 'waterwise_extractor_ro_read') THEN
        CREATE POLICY waterwise_extractor_ro_read ON public.billing FOR SELECT TO waterwise_extractor_ro USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'waterwise_extractor_ro_read') THEN
        CREATE POLICY waterwise_extractor_ro_read ON public.payments FOR SELECT TO waterwise_extractor_ro USING (true);
    END IF;
END;
$$;
