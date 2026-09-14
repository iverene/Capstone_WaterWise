import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import AnalyticsSummaryGrid from "../components/AnalyticsSummaryGrid";
import ConsumptionTrendGraph from "../components/ConsumptionTrendGraph";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumptionHistory } from "../services/consumptionHistory.service";
import { fetchCurrentBalance } from "../services/consumerPortal.service";

const usageNumber = (value) =>
  Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function UsageMetrics({ amountDue: amountDueProp, usageHistory }) {
  const usesApi = usageHistory === undefined;
  const [history, setHistory] = useState([]);
  const [amountDue, setAmountDue] = useState(amountDueProp ?? 0);
  const [selectedYear, setSelectedYear] = useState("");
  const [isLoading, setIsLoading] = useState(usesApi);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setIsLoading(true);
    setError("");
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!usesApi) return undefined;
    const controller = new AbortController();

    Promise.all([
      fetchConsumptionHistory({ signal: controller.signal }),
      fetchCurrentBalance({ signal: controller.signal }),
    ])
      .then(([nextHistory, nextBalance]) => {
        setHistory(nextHistory);
        setAmountDue(nextBalance);
      })
      .catch((requestError) => {
        if (!isCanceledRequest(requestError)) {
          setHistory([]);
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [requestVersion, usesApi]);

  const displayedHistory = usesApi ? history : usageHistory;
  const displayedAmountDue = usesApi ? amountDue : amountDueProp ?? 0;
  const yearOptions = [...new Set(displayedHistory.map((record) => String(record.year)).filter(Boolean))]
    .sort((left, right) => right.localeCompare(left));
  const activeYear = selectedYear === "all"
    ? "all"
    : yearOptions.includes(selectedYear)
      ? selectedYear
      : yearOptions[0] ?? "all";
  const filteredHistory = activeYear === "all"
    ? displayedHistory
    : displayedHistory.filter((record) => String(record.year) === activeYear);
  const latestUsage = filteredHistory.at(-1)?.volume ?? 0;
  const previousUsage = filteredHistory.at(-2)?.volume;
  const usageDifference = previousUsage === undefined ? null : latestUsage - previousUsage;
  const periodLabel = activeYear === "all" ? "All years" : activeYear;
  const InsightIcon = usageDifference == null || usageDifference === 0
    ? Minus
    : usageDifference > 0
      ? TrendingUp
      : TrendingDown;
  const insightTone = usageDifference == null || usageDifference === 0
    ? "bg-water-50 text-water-700"
    : usageDifference > 0
      ? "bg-amber-50 text-amber-800"
      : "bg-emerald-50 text-emerald-700";
  const insightMessage = filteredHistory.length === 0
    ? "No meter readings are available for this period yet."
    : usageDifference === null
      ? `Your first recorded month used ${usageNumber(latestUsage)} m³ of water.`
      : usageDifference === 0
        ? "Your latest water use is unchanged from the previous recorded month."
        : `Your latest water use is ${usageNumber(Math.abs(usageDifference))} m³ ${usageDifference > 0 ? "higher" : "lower"} than the previous recorded month.`;
  const pageHeader = (
    <PageHeader
      description="Understand your monthly water use and review the meter values behind each result."
      descriptionClassName="!text-[13px] !leading-5 sm:!text-sm sm:!leading-6"
      eyebrow="Resident analytics"
      title="Water Analytics"
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {pageHeader}
        <LoadingSkeleton label="Loading your consumption history" variant="metrics" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {pageHeader}
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{error}</span>
          <button className="min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800" onClick={retry} type="button">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {pageHeader}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5" aria-labelledby="usage-insight-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${insightTone}`}>
              <InsightIcon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Usage insight</p>
              <h2 className="mt-1 text-lg font-extrabold text-navy-900" id="usage-insight-heading">{periodLabel} at a glance</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{insightMessage}</p>
            </div>
          </div>
          <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            displayedAmountDue > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            {displayedAmountDue > 0
              ? <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
              : <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />}
            {displayedAmountDue > 0 ? "Payment needed" : "Account up to date"}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">
            {filteredHistory.length} recorded month{filteredHistory.length === 1 ? "" : "s"} in this view
          </p>
          <Filter
            ariaLabel="Filter water analytics by year"
            className="w-full sm:w-52"
            label="Period"
            onValueChange={setSelectedYear}
            options={[
              { label: "All years", value: "all" },
              ...yearOptions.map((year) => ({ label: year, value: year })),
            ]}
            value={activeYear}
          />
        </div>
      </section>

      {filteredHistory.length > 0 && (
        <AnalyticsSummaryGrid consumptionHistory={filteredHistory} />
      )}

      <ConsumptionTrendGraph periodLabel={periodLabel} trendData={filteredHistory} />
    </div>
  );
}
