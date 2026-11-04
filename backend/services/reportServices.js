import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../config/supabase.js";
import { composeFullName } from "../models/consumerModels.js";
import { insertGeneratedReport } from "../models/reportModels.js";
import { currentManilaDate } from "../utils/billingPolicy.js";
import { reportDateRangeError } from "../utils/reportPolicy.js";
import { fetchAllPages } from "../utils/supabasePagination.js";

const serviceDir = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(serviceDir, "..", "assets", "Sucol_logo.png");

export const toReportFilename = (title) => {
  const slug = String(title ?? "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  const titled = slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join("-")
    .replace(/-To-/g, "-to-");
  return `${titled || "Waterwise-Report"}.pdf`;
};

const REPORT_TYPES = {
  consumption: { label: "Consumption", sections: ["summary", "consumption", "analytics", "incidents"] },
  billing: { label: "Billing", sections: ["summary", "billing"] },
  residents: { label: "Residents", sections: ["summary", "residents"] },
  analytics: { label: "Analytics", sections: ["summary", "trend", "analytics"] },
};

const REPORT_DATE_SOURCES = {
  analytics: { column: "reading_date", table: "consumption" },
  billing: { column: "billing_date", table: "billing" },
  consumption: { column: "reading_date", table: "consumption" },
  residents: { column: "created_at", table: "consumers" },
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

export async function getReportDateRange(type) {
  const template = REPORT_TYPES[type];
  if (!template) throw serviceError("Select a supported report type.");

  const source = REPORT_DATE_SOURCES[type];
  const { data, error } = await supabase
    .from(source.table)
    .select(source.column)
    .order(source.column, { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw serviceError(`Failed to retrieve the ${template.label.toLowerCase()} date range: ${error.message}`, 500);
  }

  const rawMinimum = data?.[source.column];
  const minDate = rawMinimum ? String(rawMinimum).slice(0, 10) : null;
  return {
    hasData: Boolean(minDate),
    maxDate: currentManilaDate(),
    minDate,
    type,
  };
}

const validateRequest = async ({ type, startDate, endDate, sections }) => {
  const template = REPORT_TYPES[type];
  if (!template) throw serviceError("Select a supported report type.");

  const start = parseDate(startDate, "Start date");
  const end = parseDate(endDate, "End date");
  const range = await getReportDateRange(type);
  if (!range.hasData) {
    throw serviceError(`No ${template.label.toLowerCase()} data is available yet.`, 409);
  }
  const rangeError = reportDateRangeError({
    endDate: end,
    maxDate: range.maxDate,
    minDate: range.minDate,
    startDate: start,
  });
  if (rangeError) throw serviceError(rangeError);
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
  const { data, error } = await fetchAllPages(() => supabase
    .from("consumption")
    .select(`
      id, consumer_id, reading_date, previous_reading, present_reading, consumption,
      reading_source, carried_consumption, meter_incident_id,
      consumers!consumption_consumer_id_fkey (id, username, first_name, middle_name, last_name, purok_no)
    `)
    .gte("reading_date", startDate)
    .lte("reading_date", endDate)
    .order("reading_date", { ascending: true })
    .order("id", { ascending: true }));
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
    readingSource: record.reading_source ?? "actual",
    carriedConsumption: number(record.carried_consumption),
    meterIncidentId: record.meter_incident_id ?? null,
  }));
}

async function meterChangeRecords(startDate, endDate) {
  const { data, error } = await fetchAllPages(() => supabase
    .from("meter_incidents")
    .select(`
      id, consumer_id, incident_type, effective_date, old_meter_serial,
      old_final_reading, prior_usage, prior_usage_basis, new_meter_serial,
      new_baseline, status, review_status, notes,
      consumers!meter_incidents_consumer_id_fkey (id, username, first_name, middle_name, last_name, purok_no)
    `)
    .eq("incident_type", "replacement")
    .gte("effective_date", startDate)
    .lte("effective_date", endDate)
    .order("effective_date", { ascending: true })
    .order("id", { ascending: true }));
  if (error) throw serviceError(`Failed to retrieve meter change incidents: ${error.message}`, 500);
  return (data ?? []).map((record) => ({
    id: record.id,
    consumerName: consumerDisplayName(record.consumers),
    username: record.consumers?.username ?? "Unavailable",
    purok: purok(record.consumers?.purok_no),
    effectiveDate: record.effective_date,
    oldMeterSerial: record.old_meter_serial ?? "—",
    oldFinalReading: record.old_final_reading == null ? "—" : number(record.old_final_reading),
    priorUsage: number(record.prior_usage),
    priorUsageBasis: record.prior_usage_basis,
    newMeterSerial: record.new_meter_serial ?? "—",
    newBaseline: number(record.new_baseline),
    status: record.status,
    reviewStatus: record.review_status,
    notes: record.notes ?? "",
  }));
}

async function billingRecords(startDate, endDate) {
  const { data, error } = await fetchAllPages(() => supabase
    .from("billing")
    .select(`
      id, billing_date, due_date, total_bill, remaining_balance, status,
      consumers!billing_user_id_fkey (id, username, first_name, middle_name, last_name, purok_no)
    `)
    .gte("billing_date", startDate)
    .lte("billing_date", endDate)
    .order("billing_date", { ascending: true })
    .order("id", { ascending: true }));
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
  const { data, error } = await fetchAllPages(() => supabase
    .from("consumers")
    .select("id, username, first_name, middle_name, last_name, email, purok_no, status, created_at")
    .gte("created_at", `${startDate}T00:00:00Z`)
    .lte("created_at", `${endDate}T23:59:59.999Z`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true }));
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

// Deterministic period-trend + insights for Analytics reports only.
// Uses the same consumption query as Consumption reports (no AI calls,
// no change to what the recommendation engine collects) — presentation differs.
const monthlyTrend = (records) => {
  const totals = new Map();
  records.forEach((record) => {
    const period = String(record.readingDate ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) return;
    totals.set(period, round(number(totals.get(period)) + number(record.consumption)));
  });
  return [...totals.entries()]
    .map(([period, totalConsumption]) => ({ period, totalConsumption }))
    .sort((first, second) => (first.period < second.period ? -1 : first.period > second.period ? 1 : 0));
};

const buildAnalyticsTrend = (records) => {
  const monthly = monthlyTrend(records);
  if (monthly.length < 2) {
    // A half-vs-half comparison needs at least two months; otherwise the
    // second half is empty and the math falsely reports -100% (falling).
    const single = monthly[0] ?? null;
    return { changePercent: 0, direction: "stable", lowest: single, monthly, peak: single };
  }
  let peak = monthly[0];
  let lowest = monthly[0];
  monthly.forEach((item) => {
    if (item.totalConsumption > peak.totalConsumption) peak = item;
    if (item.totalConsumption < lowest.totalConsumption) lowest = item;
  });
  const midpoint = Math.ceil(monthly.length / 2);
  const firstHalf = monthly.slice(0, midpoint).reduce((sum, item) => sum + number(item.totalConsumption), 0);
  const secondHalf = monthly.slice(midpoint).reduce((sum, item) => sum + number(item.totalConsumption), 0);
  const changePercent = firstHalf > 0 ? round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;
  const direction = changePercent > 5 ? "rising" : changePercent < -5 ? "falling" : "stable";
  return { changePercent, direction, lowest, monthly, peak };
};

const buildAnalyticsInsights = ({ analytics, summary, trend }) => {
  const insights = [];
  const total = number(summary?.totalConsumption);
  if (analytics.length) {
    const top = analytics[0];
    const topShare = total > 0 ? round((number(top.totalConsumption) / total) * 100) : 0;
    const bottom = analytics[analytics.length - 1];
    const ratio = number(bottom?.totalConsumption) > 0
      ? (number(top.totalConsumption) / number(bottom.totalConsumption)).toFixed(1)
      : null;
    insights.push(
      `${top.name} leads the period with ${number(top.totalConsumption).toLocaleString("en-US")} m3 (${topShare}% of period consumption).`,
    );
    if (analytics.length > 1 && ratio !== null) {
      insights.push(
        `That is about ${ratio}x the lowest purok (${bottom.name}, ${number(bottom.totalConsumption).toLocaleString("en-US")} m3).`,
      );
    }
    if (number(summary?.topPurokSharePercent) >= 50) {
      insights.push("Over half of period consumption is concentrated in a single purok — prioritize it for field review.");
    }
  }
  if (trend?.monthly?.length > 1) {
    insights.push(
      `Peak month ${trend.peak.period} (${number(trend.peak.totalConsumption).toLocaleString("en-US")} m3); lowest ${trend.lowest.period} (${number(trend.lowest.totalConsumption).toLocaleString("en-US")} m3).`,
    );
    const change = Math.abs(number(trend.changePercent));
    insights.push(
      trend.direction === "stable"
        ? "Period consumption is stable between the first and second half of the range."
        : `Second-half consumption is ${change}% ${trend.direction === "rising" ? "higher" : "lower"} than the first half (${trend.direction} trend).`,
    );
  } else if (trend?.monthly?.length === 1) {
    insights.push(`All readings fall in ${trend.monthly[0].period} — extend the range for a month-to-month trend.`);
  }
  if (!insights.length) insights.push("No analytics insights are available for this period.");
  return insights;
};

async function buildSnapshot(request) {
  const validated = await validateRequest(request);
  let records;
  let summary;
  let analytics = [];
  let incidents = [];

  let trend = { changePercent: 0, direction: "stable", lowest: null, monthly: [], peak: null };
  let insights = [];
  if (validated.type === "analytics") {
    records = await consumptionRecords(validated.startDate, validated.endDate);
    analytics = consumptionByPurok(records);
    const baseSummary = consumptionSummary(records);
    const totalPurokConsumption = analytics.reduce((sum, item) => sum + number(item.totalConsumption), 0);
    const topPurokConsumption = analytics.length ? number(analytics[0].totalConsumption) : 0;
    summary = {
      ...baseSummary,
      purokCount: analytics.length,
      highestPurokConsumption: round(topPurokConsumption),
      lowestPurokConsumption: round(analytics.length ? analytics[analytics.length - 1].totalConsumption : 0),
      topPurokSharePercent: round(totalPurokConsumption ? (topPurokConsumption / totalPurokConsumption) * 100 : 0),
    };
    trend = buildAnalyticsTrend(records);
    insights = buildAnalyticsInsights({ analytics, summary, trend });
  } else if (validated.type === "consumption") {
    records = await consumptionRecords(validated.startDate, validated.endDate);
    if (validated.sections.includes("incidents")) {
      incidents = await meterChangeRecords(validated.startDate, validated.endDate);
    }
    summary = consumptionSummary(records);
    if (validated.sections.includes("incidents")) summary.meterChanges = incidents.length;
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
  return { ...validated, analytics, generatedAt: new Date().toISOString(), incidents, insights, recordCount: records.length, records, summary, trend };
}

export async function buildReportPreview(request) {
  const snapshot = await buildSnapshot(request);
  return {
    analytics: snapshot.analytics,
    endDate: snapshot.endDate,
    insights: snapshot.insights ?? [],
    recordCount: snapshot.recordCount,
    sections: snapshot.sections,
    startDate: snapshot.startDate,
    summary: snapshot.summary,
    title: `${snapshot.template.label} report preview`,
    trend: snapshot.trend ?? { changePercent: 0, direction: "stable", lowest: null, monthly: [], peak: null },
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
      incidents: snapshot.incidents ?? [],
      insights: snapshot.insights ?? [],
      records: snapshot.records,
      summary: snapshot.summary,
      trend: snapshot.trend ?? { changePercent: 0, direction: "stable", lowest: null, monthly: [], peak: null },
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
    const pdf = new PDFDocument({
      bufferPages: true,
      margins: { bottom: 44, left: 44, right: 44, top: 30 },
      size: "A4",
    });
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    const PAGE_BOTTOM = 780;
    const TABLE_LEFT = 44;
    const CONTENT_WIDTH = 507;
    const BODY_FONT_SIZE = 12;
    const data = report.report_data ?? {};
    const sections = report.sections ?? [];

    const ensureSpace = (height = 40) => {
      if (pdf.y + height > PAGE_BOTTOM) {
        pdf.addPage();
      }
    };

    const heading = (title) => {
      ensureSpace(64);
      if (pdf.y > 170) pdf.moveDown(0.5);
      pdf.font("Helvetica-Bold").fontSize(14).fillColor("#0b2b40").text(
        String(title).toUpperCase(),
        TABLE_LEFT,
        pdf.y,
        { align: "center", width: CONTENT_WIDTH },
      );
      pdf.moveDown(0.2);
      pdf.strokeColor("#bae6fd").lineWidth(1).moveTo(150, pdf.y).lineTo(445, pdf.y).stroke();
      pdf.moveDown(0.4);
    };

    const row = (text, options = {}) => {
      ensureSpace(26);
      pdf.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(BODY_FONT_SIZE).fillColor(options.color ?? "#334155").text(
        text,
        { align: options.align ?? "left", lineGap: 2 },
      );
      pdf.moveDown(0.25);
    };

    const drawTable = (columns, rows) => {
      const HEADER_HEIGHT = 22;
      const ROW_HEIGHT = 20;
      const FONT_SIZE = 10;
      const HEADER_FONT_SIZE = 10;
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

      // Measure wrapped text so long headers (e.g. PREV./CURR. READING)
      // or long cell values grow their row instead of overlapping it.
      const cellHeight = (text, width, font, size, padding) => {
        pdf.font(font).fontSize(size);
        return Math.ceil(pdf.heightOfString(String(text ?? ""), { width })) + padding;
      };

      const headerHeight = () => Math.max(
        HEADER_HEIGHT,
        ...columns.map((col) => cellHeight(col.label, col.width - 8, "Helvetica-Bold", HEADER_FONT_SIZE, 12)),
      );

      const rowHeight = (rowIndex) => Math.max(
        ROW_HEIGHT,
        ...columns.map((col) => {
          const value = col.format ? col.format(rows[rowIndex]) : String(rows[rowIndex][col.key] ?? "");
          return cellHeight(value, col.width - 8, "Helvetica", FONT_SIZE, 10);
        }),
      );

      const drawHeader = (y, height) => {
        let x = TABLE_LEFT;
        pdf.rect(TABLE_LEFT, y, totalWidth, height).fill("#0b2b40");
        columns.forEach((col) => {
          pdf.font("Helvetica-Bold").fontSize(HEADER_FONT_SIZE).fillColor("#ffffff").text(col.label, x + 4, y + 6, { align: "center", width: col.width - 8 });
          x += col.width;
        });
        return y + height;
      };

      const drawRow = (rowIndex, y, height) => {
        let x = TABLE_LEFT;
        if (rowIndex % 2 === 0) {
          pdf.rect(TABLE_LEFT, y, totalWidth, height).fill("#f8fafc");
        }
        columns.forEach((col) => {
          const value = col.format ? col.format(rows[rowIndex]) : String(rows[rowIndex][col.key] ?? "");
          pdf.font("Helvetica").fontSize(FONT_SIZE).fillColor("#334155").text(value, x + 4, y + 5, { align: col.align ?? "left", width: col.width - 8 });
          x += col.width;
        });
        return y + height;
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
      const firstHeaderHeight = headerHeight();
      ensureSpace(firstHeaderHeight + ROW_HEIGHT + 10);
      y = pdf.y;
      let contentTop = y;
      y = drawHeader(y, firstHeaderHeight);

      rows.forEach((rowData, index) => {
        const height = rowHeight(index);
        if (y + height > PAGE_BOTTOM) {
          drawBorders(contentTop, y);
          pdf.addPage();
          y = pdf.y;
          contentTop = y;
          y = drawHeader(y, headerHeight());
        }
        y = drawRow(index, y, height);
      });

      drawBorders(contentTop, y);
      pdf.y = y;
    };

    const headerTop = pdf.y;
    let headerTextLeft = TABLE_LEFT;
    if (existsSync(LOGO_PATH)) {
      pdf.image(LOGO_PATH, TABLE_LEFT, headerTop, { fit: [58, 58] });
      headerTextLeft = TABLE_LEFT + 70;
    }
    const headerTextWidth = CONTENT_WIDTH - (headerTextLeft - TABLE_LEFT);
    pdf.font("Helvetica-Bold").fontSize(16).fillColor("#0b2b40").text(
      "SUCOL WATER SYSTEM",
      headerTextLeft,
      headerTop + 8,
      { width: headerTextWidth },
    );
    pdf.font("Helvetica").fontSize(11).fillColor("#64748b").text(
      "Sucol, Balayan, Batangas, 4213",
      headerTextLeft,
      pdf.y + 2,
      { width: headerTextWidth },
    );
    pdf.y = Math.max(pdf.y, headerTop + 64);
    pdf.moveDown(0.3);
    pdf.strokeColor("#0b2b40").lineWidth(1.5).moveTo(TABLE_LEFT, pdf.y).lineTo(TABLE_LEFT + CONTENT_WIDTH, pdf.y).stroke();
    pdf.moveDown(0.5);

    const reportTypeTitle = `${REPORT_TYPES[report.report_type]?.label ?? "Report"} Report`.toUpperCase();
    pdf.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(
      reportTypeTitle,
      TABLE_LEFT,
      pdf.y,
      { align: "center", width: CONTENT_WIDTH },
    );
    pdf.moveDown(0.2);
    pdf.font("Helvetica").fontSize(BODY_FONT_SIZE).fillColor("#334155").text(
      `${report.start_date} to ${report.end_date}`,
      TABLE_LEFT,
      pdf.y,
      { align: "center", width: CONTENT_WIDTH },
    );
    pdf.moveDown(0.5);

    const formatSummaryValue = (key, value) => {
      if (/amount|balance|billed|collected/i.test(key)) return currency(value);
      if (/percent|share/i.test(key)) return `${number(value).toLocaleString("en-US")}%`;
      if (/consumption/i.test(key)) return `${number(value).toLocaleString("en-US")} m3`;
      return number(value).toLocaleString("en-US");
    };

    if (sections.includes("summary")) {
      heading("Executive Summary");
      const summaryEntries = Object.entries(data.summary ?? {});
      if (!summaryEntries.length) {
        row("No summary data is available for this period.");
      } else {
        drawTable(
          [
            { align: "left", key: "metric", label: "PARTICULARS", width: 327 },
            { align: "right", key: "amount", label: "VALUE", width: 180 },
          ],
          summaryEntries.map(([key, value]) => ({
            amount: formatSummaryValue(key, value),
            metric: metricLabel(key),
          })),
        );
        pdf.moveDown(0.4);
      }
    }

    if (sections.includes("trend") && report.report_type === "analytics") {
      const trend = data.trend ?? { changePercent: 0, direction: "stable", lowest: null, monthly: [], peak: null };
      const monthly = Array.isArray(trend.monthly) ? trend.monthly : [];
      // Omit the section entirely when there are fewer than two months —
      // a single month cannot produce a month-to-month trend.
      if (monthly.length >= 2) {
        heading("Period Trend");
        monthly.forEach((item) => {
          row(`${item.period} — ${number(item.totalConsumption).toLocaleString("en-US")} m3`);
        });
        if (trend.peak && trend.lowest) {
          row(`Peak: ${trend.peak.period} (${number(trend.peak.totalConsumption).toLocaleString("en-US")} m3) | Lowest: ${trend.lowest.period} (${number(trend.lowest.totalConsumption).toLocaleString("en-US")} m3)`);
        }
        const change = Math.abs(number(trend.changePercent));
        row(
          trend.direction === "stable"
            ? "Trend: stable between the first and second half of the range."
            : `Trend: ${trend.direction} (second half ${change}% ${trend.direction === "rising" ? "higher" : "lower"} than the first half).`,
        );
      }
    }

    if (sections.includes("analytics")) {
      const isAnalyticsReport = report.report_type === "analytics";
      heading(isAnalyticsReport ? "Purok Comparison" : "Consumption by Purok");
      const analyticsItems = data.analytics ?? [];
      if (!analyticsItems.length) {
        row("No analytics data is available for this period.");
      } else {
        const analyticsTotal = analyticsItems.reduce((sum, item) => sum + number(item.totalConsumption), 0);
        const average = analyticsTotal / analyticsItems.length;
        row(`Highest: ${analyticsItems[0].name} — ${number(analyticsItems[0].totalConsumption).toLocaleString("en-US")} m3`, { bold: true });
        if (analyticsItems.length > 1) {
          const lowest = analyticsItems[analyticsItems.length - 1];
          row(`Lowest: ${lowest.name} — ${number(lowest.totalConsumption).toLocaleString("en-US")} m3`, { bold: true });
        }
        if (isAnalyticsReport) {
          row(`Average per purok: ${number(round(average)).toLocaleString("en-US")} m3 across ${analyticsItems.length} puroks`);
        }
        const rankingColumns = isAnalyticsReport
          ? [
            { align: "center", key: "rank", label: "RANK", width: 52 },
            { align: "left", key: "name", label: "PUROK", width: 165 },
            { align: "right", key: "consumption", label: "CONSUMPTION (M3)", width: 130 },
            { align: "right", key: "share", label: "SHARE", width: 75 },
            { align: "right", key: "gap", label: "VS AVERAGE", width: 85 },
          ]
          : [
            { align: "center", key: "rank", label: "RANK", width: 52 },
            { align: "left", key: "name", label: "PUROK", width: 205 },
            { align: "right", key: "consumption", label: "CONSUMPTION (M3)", width: 140 },
            { align: "right", key: "share", label: "SHARE", width: 110 },
          ];
        drawTable(
          rankingColumns,
          analyticsItems.map((item, index) => {
            const share = analyticsTotal ? (number(item.totalConsumption) / analyticsTotal) * 100 : 0;
            const gap = average ? round(((number(item.totalConsumption) - average) / average) * 100) : 0;
            const ranked = {
              consumption: `${number(item.totalConsumption).toLocaleString("en-US")} m3`,
              name: item.name,
              rank: String(index + 1),
              share: `${number(share.toFixed(1))}%`,
            };
            if (isAnalyticsReport) ranked.gap = `${gap >= 0 ? "+" : ""}${gap}%`;
            return ranked;
          }),
        );
        pdf.moveDown(0.4);
      }
      const findings = Array.isArray(data.insights) ? data.insights : [];
      if (report.report_type === "analytics" && findings.length && (sections.includes("analytics") || sections.includes("trend"))) {
        heading("Key Findings");
        findings.forEach((finding, index) => row(`${index + 1}. ${finding}`));
      }
    }

    if (sections.includes("incidents")) {
      heading("Meter Change Incidents");
      const incidentRows = [...(data.incidents ?? [])].map((incident, index) => ({ ...incident, index: index + 1 }));
      if (!incidentRows.length) {
        row("No meter change incidents were recorded during this period.");
      } else {
        drawTable([
          { align: "center", key: "index", label: "#", width: 24 },
          { align: "center", key: "effectiveDate", label: "DATE", width: 64 },
          { align: "left", key: "consumerName", label: "RESIDENT", width: 112 },
          { align: "center", key: "purok", label: "PUROK", width: 52 },
          { align: "left", key: "oldMeterSerial", label: "OLD METER", width: 70 },
          { align: "left", key: "newMeterSerial", label: "NEW METER", width: 70 },
          { align: "center", key: "status", label: "STATUS", width: 58 },
          { align: "center", key: "reviewStatus", label: "REVIEW", width: 57 },
        ], incidentRows);
      }
    }

    const purokSortKey = (value) => {
      const match = String(value ?? "").match(/(\d+)\s*$/);
      return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
    };
    const byPurokAscending = (first, second) =>
      purokSortKey(first.purok) - purokSortKey(second.purok) ||
      String(first.consumerName ?? first.name ?? "").localeCompare(String(second.consumerName ?? second.name ?? "")) ||
      String(first.readingDate ?? first.billingDate ?? first.createdAt ?? "").localeCompare(
        String(second.readingDate ?? second.billingDate ?? second.createdAt ?? ""),
      );

    const recordSection = report.report_type === "billing" ? "billing" : report.report_type === "residents" ? "residents" : report.report_type === "consumption" ? "consumption" : null;
    if (recordSection && sections.includes(recordSection)) {
      heading(`${REPORT_TYPES[report.report_type]?.label ?? "Report"} Records`);

      if (report.report_type === "consumption") {
        const columns = [
          { align: "center", key: "index", label: "#", width: 30 },
          { align: "center", key: "readingDate", label: "DATE", width: 70 },
          { align: "left", key: "consumerName", label: "CONSUMER", width: 105 },
          { align: "center", key: "purok", label: "PUROK", width: 62 },
          {
            align: "right",
            key: "previousReading",
            label: "PREV. READING",
            width: 64,
            format: (record) => record.readingSource === "incident" || record.meterIncidentId
              ? "New / 0"
              : String(record.previousReading),
          },
          { align: "right", key: "currentReading", label: "CURR. READING", width: 64 },
          {
            align: "right",
            key: "consumption",
            label: "USAGE (M3)",
            width: 112,
            format: (record) => record.readingSource === "incident" || record.meterIncidentId
              ? `Carried: ${record.carriedConsumption} + Current: ${record.currentReading} = Total: ${record.consumption} m3`
              : `Total: ${record.consumption} m3`,
          },
        ];
        const rows = [...(data.records ?? [])]
          .sort(byPurokAscending)
          .map((r, i) => ({ ...r, index: i + 1 }));
        drawTable(columns, rows);
      } else if (report.report_type === "billing") {
        const columns = [
          { align: "center", key: "index", label: "#", width: 30 },
          { align: "center", key: "billingDate", label: "DATE", width: 70 },
          { align: "left", key: "consumerName", label: "CONSUMER", width: 138 },
          { align: "center", key: "purok", label: "PUROK", width: 62 },
          { align: "right", key: "totalBill", label: "TOTAL BILL", width: 72, format: (r) => currency(r.totalBill) },
          { align: "right", key: "remainingBalance", label: "BALANCE", width: 72, format: (r) => currency(r.remainingBalance) },
          { align: "center", key: "status", label: "STATUS", width: 63 },
        ];
        const rows = [...(data.records ?? [])]
          .sort(byPurokAscending)
          .map((r, i) => ({ ...r, index: i + 1 }));
        drawTable(columns, rows);
      } else if (report.report_type === "residents") {
        const columns = [
          { align: "center", key: "index", label: "#", width: 30 },
          { align: "left", key: "name", label: "NAME", width: 138 },
          { align: "left", key: "username", label: "USERNAME", width: 100 },
          { align: "center", key: "purok", label: "PUROK", width: 62 },
          { align: "center", key: "status", label: "STATUS", width: 62 },
          { align: "center", key: "createdAt", label: "REGISTERED", width: 115, format: (r) => dateOnly(r.createdAt) },
        ];
        const rows = [...(data.records ?? [])]
          .sort(byPurokAscending)
          .map((r, i) => ({ ...r, index: i + 1 }));
        drawTable(columns, rows);
      }
    }

    const pageRange = pdf.bufferedPageRange();
    // Footer must sit above the printable bottom (page height 842 - bottom
    // margin 44 = 798); any lower and the text call spills onto a blank page.
    const FOOTER_Y = 786;
    for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
      pdf.switchToPage(page);
      pdf.font("Helvetica").fontSize(9).fillColor("#94a3b8").text(
        `Official WaterWise administrative report | Page ${page + 1} of ${pageRange.count}`,
        44,
        FOOTER_Y,
        { align: "center", width: 507 },
      );
    }
    pdf.end();
  });
}
