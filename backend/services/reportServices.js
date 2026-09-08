import PDFDocument from "pdfkit";
import { supabase } from "../config/supabase.js";
import { composeFullName } from "../models/consumerModels.js";
import { insertGeneratedReport } from "../models/reportModels.js";

const REPORT_TYPES = {
  consumption: { label: "Consumption", sections: ["summary", "consumption", "analytics"] },
  billing: { label: "Billing", sections: ["summary", "billing"] },
  residents: { label: "Residents", sections: ["summary", "residents"] },
  analytics: { label: "Analytics", sections: ["summary", "analytics", "consumption"] },
};

const serviceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseDate = (value, label) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw serviceError(`${label} must use the YYYY-MM-DD format.`);
  }
  return value;
};

const validateRequest = ({ type, startDate, endDate, sections }) => {
  const template = REPORT_TYPES[type];
  if (!template) throw serviceError("Select a supported report type.");

  const start = parseDate(startDate, "Start date");
  const end = parseDate(endDate, "End date");
  if (end < start) throw serviceError("The end date must be on or after the start date.");
  const periodDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  if (periodDays > 366) throw serviceError("A report period cannot exceed one year.");

  const selectedSections = [...new Set(Array.isArray(sections) ? sections : [])];
  if (selectedSections.length === 0) throw serviceError("Select at least one report section.");
  if (selectedSections.some((section) => !template.sections.includes(section))) {
    throw serviceError(`One or more sections are not available for ${template.label} reports.`);
  }
  return { endDate: end, sections: selectedSections, startDate: start, template, type };
};

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round = (value) => Number(number(value).toFixed(2));
const purok = (value) => (value == null ? "Unassigned" : `Purok ${value}`);

const consumerDisplayName = (consumer, fallback = "Unknown resident") => {
  if (!consumer) return fallback;
  return (
    composeFullName(consumer.first_name, consumer.middle_name, consumer.last_name) ||
    consumer.full_name ||
    fallback
  );
};

async function consumptionRecords(startDate, endDate) {
  const { data, error } = await supabase
    .from("consumption")
    .select(`
      id, consumer_id, reading_date, previous_reading, present_reading, consumption,
      consumers!consumption_consumer_id_fkey (id, username, first_name, middle_name, last_name, purok_no)
    `)
    .gte("reading_date", startDate)
    .lte("reading_date", endDate)
    .order("reading_date", { ascending: true });
  if (error) throw serviceError(`Failed to retrieve consumption data: ${error.message}`, 500);
  return (data ?? []).map((record) => ({
    id: record.id,
    consumerId: record.consumer_id,
    consumerName: consumerDisplayName(record.consumers),
    username: record.consumers?.username ?? "Unavailable",
    purok: purok(record.consumers?.purok_no),
    readingDate: record.reading_date,
    previousReading: number(record.previous_reading),
    currentReading: number(record.present_reading),
    consumption: number(record.consumption),
  }));
}

async function billingRecords(startDate, endDate) {
  const { data, error } = await supabase
    .from("billing")
    .select(`
      id, billing_date, due_date, total_bill, remaining_balance, status,
      consumers!billing_user_id_fkey (id, username, first_name, middle_name, last_name, purok_no)
    `)
    .gte("billing_date", startDate)
    .lte("billing_date", endDate)
    .order("billing_date", { ascending: true });
  if (error) throw serviceError(`Failed to retrieve billing data: ${error.message}`, 500);
  return (data ?? []).map((record) => ({
    id: record.id,
    billingDate: record.billing_date,
    consumerName: consumerDisplayName(record.consumers),
    dueDate: record.due_date,
    purok: purok(record.consumers?.purok_no),
    remainingBalance: number(record.remaining_balance),
    status: record.status ?? "Unknown",
    totalBill: number(record.total_bill),
    username: record.consumers?.username ?? "Unavailable",
  }));
}

async function residentRecords(startDate, endDate) {
  const { data, error } = await supabase
    .from("consumers")
    .select("id, username, first_name, middle_name, last_name, email, purok_no, status, created_at")
    .gte("created_at", `${startDate}T00:00:00Z`)
    .lte("created_at", `${endDate}T23:59:59.999Z`)
    .order("created_at", { ascending: true });
  if (error) throw serviceError(`Failed to retrieve resident data: ${error.message}`, 500);
  return (data ?? []).map((record) => ({
    id: record.id,
    createdAt: record.created_at,
    email: record.email,
    name: consumerDisplayName(record, "Unknown resident"),
    purok: purok(record.purok_no),
    status: record.status ?? "inactive",
    username: record.username,
  }));
}

const consumptionSummary = (records) => {
  const total = records.reduce((sum, record) => sum + record.consumption, 0);
  return {
    totalConsumption: round(total),
    averageConsumption: round(records.length ? total / records.length : 0),
    highestConsumption: round(Math.max(0, ...records.map((record) => record.consumption))),
    uniqueResidents: new Set(records.map((record) => record.consumerId)).size,
  };
};

const consumptionByPurok = (records) => {
  const totals = new Map();
  records.forEach((record) => totals.set(record.purok, number(totals.get(record.purok)) + record.consumption));
  return [...totals.entries()]
    .map(([name, totalConsumption]) => ({ name, totalConsumption: round(totalConsumption) }))
    .sort((first, second) => second.totalConsumption - first.totalConsumption);
};

async function buildSnapshot(request) {
  const validated = validateRequest(request);
  let records;
  let summary;
  let analytics = [];

  if (["consumption", "analytics"].includes(validated.type)) {
    records = await consumptionRecords(validated.startDate, validated.endDate);
    summary = consumptionSummary(records);
    analytics = consumptionByPurok(records);
  } else if (validated.type === "billing") {
    records = await billingRecords(validated.startDate, validated.endDate);
    summary = {
      totalBilled: round(records.reduce((sum, record) => sum + record.totalBill, 0)),
      collectedAmount: round(records.reduce((sum, record) => sum + record.totalBill - record.remainingBalance, 0)),
      outstandingBalance: round(records.reduce((sum, record) => sum + record.remainingBalance, 0)),
      paidBills: records.filter((record) => record.status === "Paid").length,
    };
  } else {
    records = await residentRecords(validated.startDate, validated.endDate);
    summary = {
      activeResidents: records.filter((record) => record.status?.toLowerCase() === "active").length,
      inactiveResidents: records.filter((record) => record.status?.toLowerCase() !== "active").length,
      puroksRepresented: new Set(records.map((record) => record.purok)).size,
    };
  }
  return { ...validated, analytics, generatedAt: new Date().toISOString(), recordCount: records.length, records, summary };
}

export async function buildReportPreview(request) {
  const snapshot = await buildSnapshot(request);
  return {
    analytics: snapshot.analytics,
    endDate: snapshot.endDate,
    recordCount: snapshot.recordCount,
    sections: snapshot.sections,
    startDate: snapshot.startDate,
    summary: snapshot.summary,
    title: `${snapshot.template.label} report preview`,
    type: snapshot.type,
  };
}

export async function createPersistentReport(request, adminId) {
  const snapshot = await buildSnapshot(request);
  const title = `${snapshot.template.label} Report - ${snapshot.startDate} to ${snapshot.endDate}`;
  return insertGeneratedReport({
    end_date: snapshot.endDate,
    generated_by: adminId,
    record_count: snapshot.recordCount,
    report_data: {
      analytics: snapshot.analytics,
      generatedAt: snapshot.generatedAt,
      records: snapshot.records,
      summary: snapshot.summary,
    },
    report_type: snapshot.type,
    sections: snapshot.sections,
    start_date: snapshot.startDate,
    status: "Ready",
    title,
  });
}

const currency = (value) => `PHP ${number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const metricLabel = (key) => key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
const dateOnly = (value) => String(value ?? "").slice(0, 10) || "Unavailable";

export function renderReportPdf(report) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ bufferPages: true, margin: 44, size: "A4" });
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    const PAGE_TOP = 44;
    const PAGE_BOTTOM = 780;
    const TABLE_LEFT = 44;
    const TABLE_WIDTH = 507;
    const data = report.report_data ?? {};
    const sections = report.sections ?? [];

    const ensureSpace = (height = 32) => {
      if (pdf.y + height > PAGE_BOTTOM) {
        pdf.addPage();
      }
    };

    const heading = (title) => {
      ensureSpace(48);
      if (pdf.y > 60) pdf.moveDown(0.5);
      pdf.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a").text(title);
      pdf.moveDown(0.15).strokeColor("#bae6fd").lineWidth(1).moveTo(44, pdf.y).lineTo(551, pdf.y).stroke();
      pdf.moveDown(0.35);
    };

    const row = (text) => {
      ensureSpace(18);
      pdf.font("Helvetica").fontSize(8).fillColor("#334155").text(text, { lineGap: 1 });
      pdf.moveDown(0.2);
    };

    const drawTable = (columns, rows) => {
      const HEADER_HEIGHT = 18;
      const ROW_HEIGHT = 16;
      const FONT_SIZE = 7.5;
      const HEADER_FONT_SIZE = 7.5;
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

      const drawHeader = (y) => {
        let x = TABLE_LEFT;
        pdf.rect(TABLE_LEFT, y, totalWidth, HEADER_HEIGHT).fill("#0b2b40");
        columns.forEach((col) => {
          pdf.font("Helvetica-Bold").fontSize(HEADER_FONT_SIZE).fillColor("#ffffff").text(col.label, x + 4, y + 5, { width: col.width - 8, lineBreak: false });
          x += col.width;
        });
        return y + HEADER_HEIGHT;
      };

      const drawRow = (rowIndex, y) => {
        let x = TABLE_LEFT;
        if (rowIndex % 2 === 0) {
          pdf.rect(TABLE_LEFT, y, totalWidth, ROW_HEIGHT).fill("#f8fafc");
        }
        columns.forEach((col) => {
          const value = col.format ? col.format(rows[rowIndex]) : String(rows[rowIndex][col.key] ?? "");
          pdf.font("Helvetica").fontSize(FONT_SIZE).fillColor("#334155").text(value, x + 4, y + 4, { width: col.width - 8, lineBreak: false });
          x += col.width;
        });
        return y + ROW_HEIGHT;
      };

      const drawBorders = (startY, endY) => {
        let x = TABLE_LEFT;
        pdf.strokeColor("#e2e8f0").lineWidth(0.5);
        columns.forEach((col) => {
          pdf.moveTo(x, startY).lineTo(x, endY).stroke();
          x += col.width;
        });
        pdf.moveTo(x, startY).lineTo(x, endY).stroke();
        pdf.moveTo(TABLE_LEFT, startY).lineTo(TABLE_LEFT + totalWidth, startY).stroke();
        pdf.moveTo(TABLE_LEFT, endY).lineTo(TABLE_LEFT + totalWidth, endY).stroke();
      };

      if (!rows.length) {
        ensureSpace(40);
        row("No records were found for this reporting period.");
        return;
      }

      let y = pdf.y;
      ensureSpace(HEADER_HEIGHT + ROW_HEIGHT + 10);
      y = pdf.y;
      let contentTop = y;
      y = drawHeader(y);

      rows.forEach((rowData, index) => {
        if (y + ROW_HEIGHT > PAGE_BOTTOM) {
          drawBorders(contentTop, y);
          pdf.addPage();
          y = pdf.y;
          contentTop = y;
          y = drawHeader(y);
        }
        y = drawRow(index, y);
      });

      drawBorders(contentTop, y);
      pdf.y = y;
    };

    pdf.font("Helvetica-Bold").fontSize(10).fillColor("#0284c7").text("WATERWISE | SUCOL WATER SYSTEM");
    pdf.moveDown(0.3).fontSize(20).fillColor("#0f172a").text(report.title);
    pdf.moveDown(0.25).font("Helvetica").fontSize(9).fillColor("#64748b");
    pdf.text(`Reporting period: ${report.start_date} to ${report.end_date}`);
    pdf.text(`Generated: ${dateOnly(report.created_at)} | Records: ${report.record_count} | Status: ${report.status}`);
    pdf.moveDown(0.5);

    if (sections.includes("summary")) {
      heading("Executive summary");
      Object.entries(data.summary ?? {}).forEach(([key, value]) => {
        const formatted = /amount|balance|billed|collected/i.test(key)
          ? currency(value)
          : /consumption/i.test(key)
            ? `${number(value).toLocaleString("en-US")} m3`
            : number(value).toLocaleString("en-US");
        row(`${metricLabel(key)}: ${formatted}`);
      });
    }

    if (sections.includes("analytics")) {
      heading("Consumption by purok");
      if (!(data.analytics ?? []).length) row("No analytics data is available for this period.");
      (data.analytics ?? []).forEach((item, index) => row(`${index + 1}. ${item.name} - ${number(item.totalConsumption).toLocaleString("en-US")} m3`));
    }

    const recordSection = report.report_type === "billing" ? "billing" : report.report_type === "residents" ? "residents" : "consumption";
    if (sections.includes(recordSection)) {
      heading(`${REPORT_TYPES[report.report_type]?.label ?? "Report"} records`);

      if (report.report_type === "consumption" || report.report_type === "analytics") {
        const columns = [
          { label: "#", key: "index", width: 28 },
          { label: "Date", key: "readingDate", width: 68 },
          { label: "Consumer", key: "consumerName", width: 150 },
          { label: "Purok", key: "purok", width: 62 },
          { label: "Prev. Reading", key: "previousReading", width: 72 },
          { label: "Curr. Reading", key: "currentReading", width: 72 },
          { label: "Usage (m³)", key: "consumption", width: 55 },
        ];
        const rows = (data.records ?? []).map((r, i) => ({ ...r, index: i + 1 }));
        drawTable(columns, rows);
      } else if (report.report_type === "billing") {
        const columns = [
          { label: "#", key: "index", width: 28 },
          { label: "Date", key: "billingDate", width: 72 },
          { label: "Consumer", key: "consumerName", width: 140 },
          { label: "Purok", key: "purok", width: 62 },
          { label: "Total Bill", key: "totalBill", width: 70, format: (r) => currency(r.totalBill) },
          { label: "Balance", key: "remainingBalance", width: 70, format: (r) => currency(r.remainingBalance) },
          { label: "Status", key: "status", width: 65 },
        ];
        const rows = (data.records ?? []).map((r, i) => ({ ...r, index: i + 1 }));
        drawTable(columns, rows);
      } else if (report.report_type === "residents") {
        const columns = [
          { label: "#", key: "index", width: 28 },
          { label: "Name", key: "name", width: 140 },
          { label: "Username", key: "username", width: 100 },
          { label: "Purok", key: "purok", width: 62 },
          { label: "Status", key: "status", width: 62 },
          { label: "Registered", key: "createdAt", width: 115, format: (r) => dateOnly(r.createdAt) },
        ];
        const rows = (data.records ?? []).map((r, i) => ({ ...r, index: i + 1 }));
        drawTable(columns, rows);
      }
    }

    const pageRange = pdf.bufferedPageRange();
    for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
      pdf.switchToPage(page);
      pdf.font("Helvetica").fontSize(8).fillColor("#94a3b8").text(
        `Official WaterWise administrative report | Page ${page + 1} of ${pageRange.count}`,
        44,
        792,
        { align: "center", width: 507 },
      );
    }
    pdf.end();
  });
}
