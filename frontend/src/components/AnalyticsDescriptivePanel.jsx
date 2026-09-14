import { useEffect, useState } from "react";
import AdminOverallConsumptionCard from "./AdminOverallConsumptionCard";
import DashboardPeriodFilter, { ALL_MONTHS_VALUE } from "./DashboardPeriodFilter";
import HistoricalConsumptionGraphs from "./HistoricalConsumptionGraphs";
import HistoricalConsumptionSummary from "./HistoricalConsumptionSummary";
import PurokHistoricalConsumptionGraphs from "./PurokHistoricalConsumptionGraphs";
import { fetchYearlyHistory } from "../services/consumptionAPI";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? [];

/**
 * Descriptive analytics workspace: what the system has recorded. Owns its
 * period-filter state so the dashboard stays free of historical browsing.
 */
export default function AnalyticsDescriptivePanel() {
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(ALL_MONTHS_VALUE);
  const [availableYears, setAvailableYears] = useState([]);

  useEffect(() => {
    let active = true;
    fetchYearlyHistory()
      .then((response) => {
        if (!active) return;
        const data = unwrap(response);
        const years = (Array.isArray(data) ? data : [])
          .map((record) => Number(record?.year))
          .filter((year) => Number.isInteger(year))
          .sort((a, b) => b - a);
        setAvailableYears([...new Set(years)]);
      })
      .catch(() => {
        if (active) setAvailableYears([]);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardPeriodFilter
        availableYears={availableYears}
        month={selectedMonth}
        onMonthChange={setSelectedMonth}
        onYearChange={setSelectedYear}
        year={selectedYear}
      />

      <section aria-labelledby="descriptive-summary-heading" className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-water-600">Recorded totals</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900" id="descriptive-summary-heading">Consumption summary</h2>
        </div>
        <div className="grid gap-2 sm:gap-3 xl:grid-cols-3">
          <AdminOverallConsumptionCard compact />
          <HistoricalConsumptionSummary
            className="grid grid-cols-2 gap-2 sm:gap-3 xl:col-span-2"
            compact
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </div>
      </section>

      <section aria-labelledby="descriptive-trends-heading" className="space-y-3">
        <div>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900" id="descriptive-trends-heading">Monthly and Yearly Trends</h2>
          <p className="mt-1 text-sm text-slate-500">Review recorded monthly and yearly water consumption.</p>
        </div>
        <HistoricalConsumptionGraphs />
      </section>

      <PurokHistoricalConsumptionGraphs />
    </div>
  );
}
