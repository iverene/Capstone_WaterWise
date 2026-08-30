import { useMemo, useState } from "react";
import {
  Check,
  FileDown,
  FileText,
  LoaderCircle,
  Printer,
} from "lucide-react";
import Dropdown from "./Dropdown";
import KPI from "./KPI";
import { useToast } from "./Toast";
import {
  clearSession,
  getAccessToken,
  getAccessTokenExpiresAt,
} from "../services/authToken";
import {
  downloadReportPDF,
  generateReport,
  openPrintableReport,
  savePdfBlob,
} from "../services/reportAPI";

const REPORT_TYPES = {
  consumption: {
    label: "Consumption",
    description: "Meter readings and water-use totals.",
    sections: ["summary", "consumption", "analytics"],
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
    description: "Consumption indicators and purok comparison.",
    sections: ["summary", "analytics", "consumption"],
  },
};

const SECTION_LABELS = {
  analytics: "Purok analysis",
  billing: "Billing records",
  consumption: "Consumption records",
  residents: "Resident directory",
  summary: "Executive summary",
};

const today = new Date().toISOString().slice(0, 10);
const initialType = "consumption";
const initialForm = {
  endDate: today,
  sections: REPORT_TYPES[initialType].sections,
  startDate: `${today.slice(0, 7)}-01`,
  type: initialType,
};

const requestMessage = (error, fallback) =>
  error?.response?.data?.message ?? error.message ?? fallback;

const formatMetricLabel = (key) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

const formatMetricValue = (key, value) => {
  const numericValue = Number(value) || 0;
  if (/amount|balance|billed|collected/i.test(key)) {
    return `₱${numericValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }
  if (/consumption/i.test(key)) return `${numericValue.toLocaleString("en-US")} m³`;
  return numericValue.toLocaleString("en-US");
};

export default function ReportGenerator({ onGenerated }) {
  const toast = useToast();
  const [form, setForm] = useState(initialForm);
  const [preview, setPreview] = useState(null);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const template = REPORT_TYPES[form.type];
  const typeOptions = useMemo(
    () => Object.entries(REPORT_TYPES).map(([value, item]) => ({ label: item.label, value })),
    [],
  );

  const changeField = (name, value) => {
    setForm((current) => {
      if (name === "type") {
        return { ...current, type: value, sections: REPORT_TYPES[value].sections };
      }
      return { ...current, [name]: value };
    });
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setPreview(null);
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
    if (!form.startDate) nextErrors.startDate = "Select a start date.";
    if (!form.endDate) nextErrors.endDate = "Select an end date.";
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

    const token = getAccessToken();
    const expiresAt = getAccessTokenExpiresAt(token);
    if (!token || !expiresAt || expiresAt <= Date.now()) {
      toast.error("Session expired", "Your session has expired. Please sign in again.");
      clearSession();
      return;
    }

    try {
      setBusyAction("generate");
      setError("");
      const report = await generateReport(form);
      setGeneratedReport(report);
      setPreview({
        title: report.title,
        startDate: report.start_date,
        endDate: report.end_date,
        recordCount: report.record_count,
        summary: report.report_data?.summary ?? {},
      });
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
      savePdfBlob(pdf, `${generatedReport.title}.pdf`);
      toast.success("Download started", `${generatedReport.title}.pdf is being saved to your device.`);
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
          Select a template and period, verify the matching records, then generate the final PDF.
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
            id="report-start"
            max={form.endDate || today}
            name="startDate"
            onChange={(event) => changeField("startDate", event.target.value)}
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
            id="report-end"
            min={form.startDate}
            name="endDate"
            onChange={(event) => changeField("endDate", event.target.value)}
            type="date"
            value={form.endDate}
          />
          {fieldErrors.endDate && <p className="mt-1.5 text-sm font-semibold text-red-600" id="report-end-error">{fieldErrors.endDate}</p>}
        </div>
      </div>

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
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-water-600 px-5 font-bold text-white hover:bg-water-700 disabled:opacity-60" disabled={Boolean(busyAction)} onClick={generate} type="button">
          {busyAction === "generate" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileText aria-hidden="true" className="h-4 w-4" />}
          {busyAction === "generate" ? "Generating report…" : "Generate report"}
        </button>
      </div>

      {preview && (
        <section className="mt-6 rounded-2xl border border-water-200 bg-water-50/60 p-4 sm:p-5" aria-labelledby="report-preview-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Data preview</p>
              <h3 className="mt-1 font-extrabold text-navy-900" id="report-preview-title">{preview.title}</h3>
              <p className="mt-1 font-mono text-xs tabular-nums text-slate-600">{preview.startDate} to {preview.endDate}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-water-200 bg-white px-3 py-1.5 text-xs font-bold text-water-800">
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              {preview.recordCount.toLocaleString()} matching records
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(preview.summary).map(([key, value]) => (
              <KPI
                className="shadow-none sm:p-4"
                icon={FileText}
                key={key}
                title={formatMetricLabel(key)}
                value={formatMetricValue(key, value)}
              />
            ))}
          </div>
        </section>
      )}

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
