import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, FileText } from "lucide-react";
import KPI from "./KPI";
import LoadingSkeleton from "./LoadingSkeleton";
import Modal from "./Modal";
import { fetchReportDetails } from "../services/reportAPI";

const metricLabel = (key) => key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
const metricValue = (key, value) => {
  const numericValue = Number(value) || 0;
  if (/amount|balance|billed|collected/i.test(key)) return `₱${numericValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  if (/percent|share/i.test(key)) return `${numericValue.toLocaleString("en-US")}%`;
  if (/consumption/i.test(key)) return `${numericValue.toLocaleString("en-US")} m³`;
  return numericValue.toLocaleString("en-US");
};

function recordSummary(record, type) {
  if (type === "billing") return `${record.billingDate} · ${record.consumerName} · ₱${Number(record.totalBill).toLocaleString("en-US", { minimumFractionDigits: 2 })} · ${record.status}`;
  if (type === "residents") return `${record.name} · ${record.username} · ${record.purok} · ${record.status}`;
  return `${record.readingDate} · ${record.consumerName} · ${record.purok} · ${Number(record.consumption).toLocaleString("en-US")} m³`;
}

export default function ReportDetailsModal({ onClose, reportId }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchReportDetails(reportId, { signal: controller.signal })
      .then(setReport)
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") {
          setError(requestError?.response?.data?.message ?? requestError.message ?? "Unable to load report details.");
        }
      });
    return () => {
      controller.abort();
    };
  }, [reportId]);

  return (
    <Modal
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"
      closeLabel="Close report details"
      eyebrow="Saved report"
      isOpen
      onClose={onClose}
      title={report?.title ?? "Report details"}
      zIndexClass="z-[90]"
    >
          {!report && !error && <LoadingSkeleton label="Loading report details" variant="list" />}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">{error}</div>}
          {report && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <KPI className="shadow-none sm:p-4" description="Coverage" icon={CalendarDays} title="Period" value={`${report.start_date} – ${report.end_date}`} />
                <KPI className="shadow-none sm:p-4" description="Source Records" icon={FileText} title="Records" value={report.record_count.toLocaleString()} />
                <KPI className="shadow-none sm:p-4" description="Report Status" icon={CheckCircle2} title="Status" value={report.status} />
              </div>

              <section>
                <h3 className="font-extrabold text-navy-900">Included summary</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {Object.entries(report.report_data?.summary ?? {}).map(([key, value]) => (
                    <KPI className="shadow-none sm:p-4" icon={FileText} key={key} title={metricLabel(key)} value={metricValue(key, value)} />
                  ))}
                </div>
              </section>

              {report.report_type === "analytics" ? (
                <>
                  {Array.isArray(report.report_data?.insights) && report.report_data.insights.length > 0 && (
                    <section>
                      <h3 className="font-extrabold text-navy-900">Key findings</h3>
                      <ul className="mt-3 list-disc space-y-1 rounded-xl border border-slate-200 p-4 pl-8 text-sm leading-6 text-slate-600">
                        {report.report_data.insights.map((finding, index) => (
                          <li key={index}>{finding}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section>
                    <h3 className="font-extrabold text-navy-900">Purok comparison</h3>
                    <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {(report.report_data?.analytics ?? []).slice(0, 6).map((item, index) => (
                        <div className="flex items-start gap-3 p-3 text-sm text-slate-600" key={item.name ?? index}><FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-water-700" /><span>{index + 1}. {item.name} · {Number(item.totalConsumption).toLocaleString("en-US")} m³</span></div>
                      ))}
                      {(report.report_data?.analytics ?? []).length === 0 && <p className="p-4 text-sm text-slate-500">No analytics data were included.</p>}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Ranked by period consumption. The PDF contains the full trend and comparison.</p>
                  </section>
                </>
              ) : (
                <section>
                  <h3 className="font-extrabold text-navy-900">Record preview</h3>
                  <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {(report.report_data?.records ?? []).slice(0, 5).map((record) => (
                      <div className="flex items-start gap-3 p-3 text-sm text-slate-600" key={record.id}><FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-water-700" /><span>{recordSummary(record, report.report_type)}</span></div>
                    ))}
                    {(report.report_data?.records ?? []).length === 0 && <p className="p-4 text-sm text-slate-500">No source records were included.</p>}
                  </div>
                  {(report.report_data?.records ?? []).length > 5 && <p className="mt-2 text-xs text-slate-500">Showing 5 of {report.record_count.toLocaleString()} records. The PDF contains the complete snapshot.</p>}
                </section>
              )}
            </div>
          )}
    </Modal>
  );
}
