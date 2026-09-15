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
