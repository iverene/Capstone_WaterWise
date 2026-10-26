import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  Printer,
  RefreshCw,
} from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import ReportDetailsModal from "../components/ReportDetailsModal";
import ReportGenerator from "../components/ReportGenerator";
import Table from "../components/Table";
import { useToast } from "../components/Toast";
import {
  downloadReportPDF,
  fetchGeneratedReports,
  openPrintableReport,
  savePdfBlob,
} from "../services/reportAPI";

const typeLabels = {
  analytics: "Analytics",
  billing: "Billing",
  consumption: "Consumption",
  incidents: "Meter change incidents",
  residents: "Residents",
};

const dateTime = (value) => {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const safeFilename = (report) =>
  `${String(report.title ?? "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join("-")
    .replace(/-To-/g, "-to-") || "Waterwise-Report"}.pdf`;

export default function Reports() {
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyReport, setBusyReport] = useState("");
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setReports(await fetchGeneratedReports());
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? requestError.message ?? "Unable to load the report archive.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadReports);
  }, [loadReports]);

  const download = async (report) => {
    try {
      setBusyReport(`download-${report.id}`);
      setError("");
      savePdfBlob(await downloadReportPDF(report.id), safeFilename(report));
      toast.success("Download started", `${safeFilename(report)} is being saved to your device.`);
    } catch (requestError) {
      const message = requestError?.response?.data?.message ?? requestError.message ?? "Unable to download the report PDF.";
      setError(message);
      toast.error("Download failed", message);
    } finally {
      setBusyReport("");
    }
  };

  const print = async (report) => {
    try {
      setError("");
      await openPrintableReport(report.id);
      toast.info("Print view opened", "Use the browser print dialog to print or save the report.");
    } catch (requestError) {
      const message = requestError?.response?.data?.message ?? requestError.message ?? "Unable to open the printable report.";
      setError(message);
      toast.error("Print view unavailable", message);
    }
  };

  return (
    <main className="space-y-6">
      <PageHeader description="Preview operational data, generate a fixed report snapshot, and retrieve official PDFs from the archive." title="Reports" />

      <ReportGenerator onGenerated={loadReports} />

      <section aria-labelledby="report-archive-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Persistent archive</p>
            <h2 className="mt-1 text-2xl font-extrabold text-navy-900" id="report-archive-title">Generated reports</h2>
            <p className="mt-1 text-sm text-slate-500">Saved report snapshots remain available after signing out or refreshing.</p>
          </div>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-400" disabled={loading} onClick={loadReports} type="button">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">{error}</div>}
        {loading ? (
          <LoadingSkeleton label="Loading generated reports" variant="table" />
        ) : (
          <Table
            ariaLabel="Generated report archive"
            columns={[
              { key: "report", label: "Report" },
              { key: "period", label: "Period" },
              { key: "records", label: "Records" },
              { key: "created", label: "Generated" },
              { key: "status", label: "Status" },
              { key: "actions", label: "Actions", className: "text-right" },
            ]}
            data={reports}
            emptyDescription="Generate a report after previewing a reporting period."
            emptyTitle="No generated reports"
            getRowKey={(report) => report.id}
            tableClassName="block w-full min-w-[920px] text-left text-sm md:table"
            renderRow={(report) => (
              <>
                <td className="px-4 py-4"><button className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity" onClick={() => setSelectedReportId(report.id)} type="button"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700"><FileText aria-hidden="true" className="h-4 w-4" /></span><div className="min-w-0"><p className="max-w-72 truncate font-bold text-navy-900">{report.title}</p><p className="mt-0.5 text-xs text-slate-500">{typeLabels[report.report_type] ?? report.report_type}</p></div></button></td>
                <td className="px-4 py-4 font-mono text-xs tabular-nums text-slate-600">{report.start_date}<br />{report.end_date}</td>
                <td className="px-4 py-4 font-mono font-bold tabular-nums text-navy-900">{report.record_count.toLocaleString()}</td>
                <td className="px-4 py-4 text-xs text-slate-600">{dateTime(report.created_at)}</td>
                <td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />{report.status}</span></td>
                <td className="px-4 py-4"><div className="flex justify-end gap-1"><button aria-label={`View ${report.title}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-water-700 hover:bg-water-50" onClick={() => setSelectedReportId(report.id)} type="button"><Eye aria-hidden="true" className="h-4 w-4" /></button><button aria-label={`Download ${report.title}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-water-700 hover:bg-water-50 disabled:text-slate-300" disabled={Boolean(busyReport)} onClick={() => download(report)} type="button">{busyReport === `download-${report.id}` ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}</button><button aria-label={`Open ${report.title} for printing`} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100" onClick={() => print(report)} type="button"><Printer aria-hidden="true" className="h-4 w-4" /></button></div></td>
              </>
            )}
          />
        )}
      </section>

      {selectedReportId && <ReportDetailsModal onClose={() => setSelectedReportId(null)} reportId={selectedReportId} />}
    </main>
  );
}
