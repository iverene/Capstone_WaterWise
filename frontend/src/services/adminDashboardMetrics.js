import apiClient from "./apiClient";

export const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value ?? 0));

export async function fetchAdminDashboardMetrics(options = {}) {
  const response = await apiClient.get("/admin/dashboard/metrics", options);
  return response.data?.data;
}
