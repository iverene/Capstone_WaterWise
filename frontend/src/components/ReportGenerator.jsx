import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FileDown,
  FileText,
  LoaderCircle,
  Printer,
} from "lucide-react";
import Dropdown from "./Dropdown";
import { useToast } from "./Toast";
import { clearSession, getStoredAccount } from "../services/authToken";
import {
  downloadReportPDF,
  fetchReportDateRange,
  generateReport,
  openPrintableReport,
  savePdfBlob,
} from "../services/reportAPI";
import { manilaToday } from "../utils/billingPolicy";

const REPORT_TYPES = {
  consumption: {
    label: "Consumption",
    description: "Meter readings and water-use totals.",
    sections: ["summary", "consumption", "analytics", "incidents"],
  },
  billing: {
    label: "Billing",
    description: "Charges, balances, and billing statuses.",
    sections: ["summary", "billing"],
  },
  residents: {
    label: "Residents",
    description: "Resident accounts registered during the period.",
    sections: ["summary", "residents"],
  },
  analytics: {
    label: "Analytics",
    description: "Trends, purok comparison, and key findings.",
    sections: ["summary", "trend", "analytics"],
  },
};

const SECTION_LABELS = {
  analytics: "Purok comparison",
  billing: "Billing records",
  consumption: "Consumption records",
  incidents: "Meter change incidents",
  residents: "Resident directory",
  summary: "Executive summary",
  trend: "Period trend",
};

const today = manilaToday();
const initialType = "consumption";
const initialForm = {
  endDate: today,
  sections: REPORT_TYPES[initialType].sections,
  startDate: `${today.slice(0, 7)}-01`,
  type: initialType,
};

const requestMessage = (error, fallback) =>
  error?.response?.data?.message ?? error.message ?? fallback;

function blockManualPickerEntry(event) {
  const allowedKeys = new Set(["Tab", "Enter", "Escape"]);
  if (allowedKeys.has(event.key) || (event.altKey && event.key === "ArrowDown")) return;
  event.preventDefault();
}

const toTitleCaseFilename = (title) =>
  `${String(title ?? "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join("-")
    .replace(/-To-/g, "-to-") || "Waterwise-Report"}.pdf`;

export default function ReportGenerator({ onGenerated }) {
  const toast = useToast();
  const [form, setForm] = useState(initialForm);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [dateRange, setDateRange] = useState(null);
  const [rangeLoading, setRangeLoading] = useState(true);
  const [rangeError, setRangeError] = useState("");

  const template = REPORT_TYPES[form.type];
  const activeRange = dateRange?.type === form.type ? dateRange : null;
  const typeOptions = useMemo(
    () => Object.entries(REPORT_TYPES).map(([value, item]) => ({ label: item.label, value })),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchReportDateRange(form.type, { signal: controller.signal })
      .then((range) => {
        if (!active) return;
        setDateRange(range);
        setForm((current) => {
          if (current.type !== range.type) return current;
          if (!range.hasData) return { ...current, endDate: "", startDate: "" };

          const currentMonthStart = `${range.maxDate.slice(0, 7)}-01`;
          let endDate = current.endDate || range.maxDate;
          if (endDate > range.maxDate || endDate < range.minDate) endDate = range.maxDate;

          let startDate = current.startDate || currentMonthStart;
          if (startDate < range.minDate) startDate = range.minDate;
          if (startDate > range.maxDate) startDate = range.maxDate;
          if (startDate > endDate) startDate = endDate;
          return { ...current, endDate, startDate };
        });
      })
      .catch((requestError) => {
        if (!active || requestError?.name === "AbortError" || requestError?.code === "ERR_CANCELED") return;
        setDateRange(null);
        setRangeError(requestMessage(requestError, "Unable to load the available report dates."));
      })
      .finally(() => {
        if (active) setRangeLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [form.type]);

  const changeField = (name, value) => {
    if (name === "type") {
      setRangeLoading(true);
      setRangeError("");
    }
    setForm((current) => {
      if (name === "type") {
        return { ...current, type: value, sections: REPORT_TYPES[value].sections };
      }
      return { ...current, [name]: value };
    });
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setGeneratedReport(null);
  };

  const toggleSection = (section) => {
    const selected = form.sections.includes(section);
    changeField(
      "sections",
      selected ? form.sections.filter((item) => item !== section) : [...form.sections, section],
    );
  };

  const validate = () => {
    const nextErrors = {};
    if (!activeRange?.hasData) {
      setError(rangeError || `No ${template.label.toLowerCase()} data is available yet.`);
      return false;
    }
    if (!form.startDate) nextErrors.startDate = "Select a start date.";
    if (!form.endDate) nextErrors.endDate = "Select an end date.";
    if (form.startDate && form.startDate < activeRange.minDate) {
      nextErrors.startDate = `Select ${activeRange.minDate} or a later date.`;
    }
    if (form.endDate && form.endDate > activeRange.maxDate) {
      nextErrors.endDate = `Select ${activeRange.maxDate} or an earlier date.`;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "End date must be on or after the start date.";
    }
    if (form.startDate && form.endDate) {
      const period = (Date.parse(`${form.endDate}T00:00:00Z`) - Date.parse(`${form.startDate}T00:00:00Z`)) / 86400000;
      if (period > 366) nextErrors.endDate = "Report period cannot exceed one year.";
    }
    if (form.sections.length === 0) nextErrors.sections = "Select at least one section.";
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const generate = async () => {
    if (!validate()) return;

    // Cookie-only: backend 401 handles expiry. Just require stored account.
    if (!getStoredAccount()) {
      toast.error("Session expired", "Your session has expired. Please sign in again.");
      clearSession();
      return;
    }

    try {
      setBusyAction("generate");
      setError("");
      const report = await generateReport(form);
      setGeneratedReport(report);
      await Promise.resolve(onGenerated?.()).catch(() => undefined);
      toast.success("Report generated", `${report.title} was saved to the report archive.`);
    } catch (requestError) {
      const message = requestMessage(requestError, "The report could not be generated.");
      setError(message);
      toast.error("Report not generated", message);
    } finally {
      setBusyAction("");
    }
  };

  const downloadReport = async () => {
    if (!generatedReport?.id) return;
    try {
      setBusyAction("download");
      setError("");
      const pdf = await downloadReportPDF(generatedReport.id);
      const filename = toTitleCaseFilename(generatedReport.title);
      savePdfBlob(pdf, filename);
      toast.success("Download started", `${filename} is being saved to your device.`);
    } catch (requestError) {
      const message = requestMessage(requestError, "The PDF could not be downloaded.");
      setError(message);
      toast.error("Download failed", message);
    } finally {
      setBusyAction("");
    }
  };

  const printReport = async () => {
    if (!generatedReport?.id) return;
    try {
      setError("");
      await openPrintableReport(generatedReport.id);
      toast.info("Print view opened", "Use the browser print dialog to print or save the report.");
    } catch (requestError) {
      const message = requestMessage(requestError, "The printable PDF could not be opened.");
      setError(message);
      toast.error("Print view unavailable", message);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-600">Report builder</p>
        <h2 className="mt-1 text-xl font-extrabold text-navy-900">Prepare a report</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Select a template and period, then generate the final PDF.
        </p>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div>
          <label className="text-sm font-bold text-navy-900" htmlFor="report-type">Report type</label>
          <Dropdown
            ariaLabel="Select report type"
            className="mt-2"
            id="report-type"
            name="type"
            onValueChange={(value) => changeField("type", value)}
            options={typeOptions}
            value={form.type}
          />
          <p className="mt-1.5 text-xs leading-5 text-slate-500">{template.description}</p>
        </div>
        <div>
          <label className="text-sm font-bold text-navy-900" htmlFor="report-start">Start date</label>
          <input
            aria-describedby={fieldErrors.startDate ? "report-start-error" : undefined}
            aria-invalid={Boolean(fieldErrors.startDate)}
            className="ww-field mt-2 px-4 text-sm"
            disabled={rangeLoading || !activeRange?.hasData}
            id="report-start"
            max={form.endDate || activeRange?.maxDate || today}
            min={activeRange?.minDate || undefined}
            name="startDate"
            onChange={(event) => changeField("startDate", event.target.value)}
            onDrop={(event) => event.preventDefault()}
            onKeyDown={blockManualPickerEntry}
            onPaste={(event) => event.preventDefault()}
            type="date"
            value={form.startDate}
          />
          {fieldErrors.startDate && <p className="mt-1.5 text-sm font-semibold text-red-600" id="report-start-error">{fieldErrors.startDate}</p>}
        </div>
        <div>
          <label className="text-sm font-bold text-navy-900" htmlFor="report-end">End date</label>
          <input
            aria-describedby={fieldErrors.endDate ? "report-end-error" : undefined}
            aria-invalid={Boolean(fieldErrors.endDate)}
            className="ww-field mt-2 px-4 text-sm"
            disabled={rangeLoading || !activeRange?.hasData}
            id="report-end"
            max={activeRange?.maxDate || today}
            min={form.startDate}
            name="endDate"
            onChange={(event) => changeField("endDate", event.target.value)}
            onDrop={(event) => event.preventDefault()}
            onKeyDown={blockManualPickerEntry}
            onPaste={(event) => event.preventDefault()}
            type="date"
            value={form.endDate}
          />
          {fieldErrors.endDate && <p className="mt-1.5 text-sm font-semibold text-red-600" id="report-end-error">{fieldErrors.endDate}</p>}
        </div>
      </div>

      {rangeLoading && <p className="mt-3 text-sm text-slate-500">Checking available report dates…</p>}
      {!rangeLoading && activeRange && !activeRange.hasData && (
        <p className="mt-3 text-sm font-semibold text-amber-700" role="status">
          No {template.label.toLowerCase()} data is available yet.
        </p>
      )}
      {!rangeLoading && rangeError && <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{rangeError}</p>}

      <fieldset className="mt-6">
        <legend className="text-sm font-bold text-navy-900">Included sections</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {template.sections.map((section) => {
            const selected = form.sections.includes(section);
            return (
              <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-colors ${selected ? "border-water-300 bg-water-50 text-water-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`} key={section}>
                <input checked={selected} className="sr-only" onChange={() => toggleSection(section)} type="checkbox" />
                <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? "border-water-600 bg-water-600 text-white" : "border-slate-300 bg-white"}`}>
                  {selected && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
                </span>
                {SECTION_LABELS[section]}
              </label>
            );
          })}
        </div>
        {fieldErrors.sections && <p className="mt-2 text-sm font-semibold text-red-600" role="alert">{fieldErrors.sections}</p>}
      </fieldset>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-water-600 px-5 font-bold text-white hover:bg-water-700 disabled:opacity-60" disabled={Boolean(busyAction) || rangeLoading || !activeRange?.hasData} onClick={generate} type="button">
          {busyAction === "generate" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileText aria-hidden="true" className="h-4 w-4" />}
          {busyAction === "generate" ? "Generating report…" : "Generate report"}
        </button>
      </div>

      {generatedReport && (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5" aria-label="Generated report actions">
          <div className="flex items-start gap-3">
            <Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-bold text-emerald-900">Report ready</p>
              <p className="mt-1 text-sm text-emerald-800">{generatedReport.title}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-water-600 px-4 font-bold text-white hover:bg-water-700 disabled:opacity-60" disabled={Boolean(busyAction)} onClick={downloadReport} type="button">
              {busyAction === "download" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileDown aria-hidden="true" className="h-4 w-4" />}
              Download PDF
            </button>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-bold text-navy-900 hover:bg-slate-50" onClick={printReport} type="button">
              <Printer aria-hidden="true" className="h-4 w-4" />
              Open to print
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
