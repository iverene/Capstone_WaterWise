import apiClient, { apiRequest } from "./apiClient";

const unwrap = (response) => response?.data ?? response;

export async function fetchGeneratedReports(options = {}) {
  return unwrap(await apiRequest("/reports", { signal: options.signal }));
}

export async function fetchReportDateRange(type, options = {}) {
  return unwrap(await apiRequest(`/reports/date-range?type=${encodeURIComponent(type)}`, {
    signal: options.signal,
  }));
}

export async function fetchReportDetails(reportId, options = {}) {
  return unwrap(await apiRequest(`/reports/${reportId}`, { signal: options.signal }));
}

export async function previewReport(payload, options = {}) {
  return unwrap(await apiRequest("/reports/preview", {
    body: payload,
    method: "POST",
    signal: options.signal,
  }));
}

export async function generateReport(payload) {
  return unwrap(await apiRequest("/reports", { body: payload, method: "POST" }));
}

export async function downloadReportPDF(reportId, { inline = false } = {}) {
  const response = await apiClient.get(`/reports/${reportId}/pdf`, {
    params: inline ? { disposition: "inline" } : undefined,
    responseType: "blob",
  });
  return response.data;
}

export function savePdfBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export async function openPrintableReport(reportId) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) throw new Error("Allow pop-ups to open the printable report.");

  reportWindow.document.title = "Preparing WaterWise report";
  reportWindow.document.body.innerHTML =
    '<p style="font:16px system-ui;padding:24px;color:#334155">Preparing printable report…</p>';
  try {
    const blob = await downloadReportPDF(reportId, { inline: true });
    const url = window.URL.createObjectURL(blob);
    reportWindow.location.replace(url);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch (error) {
    reportWindow.close();
    throw error;
  }
}
