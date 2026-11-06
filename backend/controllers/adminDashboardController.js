import { getAdminDashboardMetrics } from "../services/adminDashboardService.js";

export async function showAdminDashboardMetrics(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: await getAdminDashboardMetrics(),
    });
  } catch (error) {
    console.error("Admin dashboard metrics error:", error);
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Failed to retrieve dashboard metrics.",
    });
  }
}

