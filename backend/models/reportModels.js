import { fetchAllPages } from "../utils/supabasePagination.js";
import { supabase } from "../config/supabase.js";

const LIST_FIELDS =
  "id, title, report_type, start_date, end_date, sections, generated_by, record_count, status, created_at";
const DETAIL_FIELDS = `${LIST_FIELDS}, report_data`;

const reportError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const reportId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw reportError("A valid report ID is required.", 400);
  return id;
};

export async function insertGeneratedReport(report) {
  const { data, error } = await supabase
    .from("generated_reports")
    .insert(report)
    .select(DETAIL_FIELDS)
    .single();
  if (error) throw reportError(`Failed to save generated report: ${error.message}`);
  return data;
}

export async function listGeneratedReports() {
  const { data, error } = await fetchAllPages(() => supabase
    .from("generated_reports")
    .select(LIST_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }));
  if (error) throw reportError(`Failed to retrieve generated reports: ${error.message}`);
  return data ?? [];
}

export async function getGeneratedReportById(value) {
  const { data, error } = await supabase
    .from("generated_reports")
    .select(DETAIL_FIELDS)
    .eq("id", reportId(value))
    .maybeSingle();
  if (error) throw reportError(`Failed to retrieve generated report: ${error.message}`);
  if (!data) throw reportError("Generated report not found.", 404);
  return data;
}
