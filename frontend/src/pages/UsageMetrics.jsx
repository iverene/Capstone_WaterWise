import { useCallback, useEffect, useState } from "react";
import AnalyticsSummaryGrid from "../components/AnalyticsSummaryGrid";
import {
  ConsumerMonthlyConsumptionChart,
  ConsumerYearlyConsumptionChart,
} from "../components/ConsumptionTrendGraph";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumptionHistory } from "../services/consumptionHistory.service";

export default function UsageMetrics({ usageHistory }) {
  const usesApi = usageHistory === undefined;
  const [history, setHistory] = useState([]);
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

    fetchConsumptionHistory({ signal: controller.signal })
      .then((nextHistory) => {
        setHistory(nextHistory);
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
  const pageHeader = <PageHeader title="Analytics" />;

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

      {filteredHistory.length > 0 && (
        <AnalyticsSummaryGrid consumptionHistory={filteredHistory} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ConsumerMonthlyConsumptionChart
          activeYear={activeYear}
          onYearChange={setSelectedYear}
          trendData={filteredHistory}
          yearOptions={yearOptions}
        />
        <ConsumerYearlyConsumptionChart trendData={displayedHistory} />
      </div>
    </div>
  );
}
