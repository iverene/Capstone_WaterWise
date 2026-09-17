import {
  buildReportPreview,
  createPersistentReport,
  renderReportPdf,
  toReportFilename,
} from "../services/reportServices.js";
import {
  getGeneratedReportById,
  listGeneratedReports,
} from "../models/reportModels.js";

const sendError = (res, error, fallback) => {
  console.error(fallback, error);
  return res.status(error.statusCode ?? 500).json({
    success: false,
    message: error.message || fallback,
  });
};

export async function previewReport(req, res) {
  try {
    return res.status(200).json({ success: true, data: await buildReportPreview(req.body ?? {}) });
  } catch (error) {
    return sendError(res, error, "Failed to preview report.");
  }
}

export async function createReport(req, res) {
  try {
    const report = await createPersistentReport(req.body ?? {}, req.user.id);
    return res.status(201).json({
      success: true,
      message: "Report generated successfully.",
      data: report,
    });
  } catch (error) {
    return sendError(res, error, "Failed to generate report.");
  }
}

export async function listReports(req, res) {
  try {
    return res.status(200).json({ success: true, data: await listGeneratedReports() });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve generated reports.");
  }
}

export async function showReport(req, res) {
  try {
    return res.status(200).json({ success: true, data: await getGeneratedReportById(req.params.id) });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve generated report.");
  }
}

export async function downloadReport(req, res) {
  try {
    const report = await getGeneratedReportById(req.params.id);
    const pdf = await renderReportPdf(report);
    const filename = toReportFilename(report.title);
    const disposition = req.query.disposition === "inline" ? "inline" : "attachment";
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": pdf.length,
      "Content-Type": "application/pdf",
    });
    return res.status(200).send(pdf);
  } catch (error) {
    return sendError(res, error, "Failed to create report PDF.");
  }
}
