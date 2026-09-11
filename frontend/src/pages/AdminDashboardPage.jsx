import { useEffect, useState } from "react";
import AdminOverallConsumptionCard from "../components/AdminOverallConsumptionCard";
import DashboardPeriodFilter, { ALL_MONTHS_VALUE } from "../components/DashboardPeriodFilter";
import HistoricalConsumptionSummary from "../components/HistoricalConsumptionSummary";
import HistoricalConsumptionGraphs from "../components/HistoricalConsumptionGraphs";
import PurokHistoricalConsumptionGraphs from "../components/PurokHistoricalConsumptionGraphs";
import PageHeader from "../components/PageHeader";
import { fetchYearlyHistory } from "../services/consumptionAPI";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? [];

export default function AdminDashboardPage() {
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
    <main className="space-y-5" data-testid="admin-dashboard">
      <PageHeader
        description="Review recorded consumption using historical water data."
        eyebrow="Operations overview"
        title="Water operations overview"
      />

      <DashboardPeriodFilter
        availableYears={availableYears}
        month={selectedMonth}
        onMonthChange={setSelectedMonth}
        onYearChange={setSelectedYear}
        year={selectedYear}
      />

      <section aria-labelledby="dashboard-summary" className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-water-600">Live indicators</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900" id="dashboard-summary">Consumption summary</h2>
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

      <section aria-labelledby="dashboard-trends" className="space-y-3">
        <div>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900" id="dashboard-trends">Monthly And Yearly Trends</h2>
          <p className="mt-1 text-sm text-slate-500">Review recorded monthly and yearly water consumption.</p>
        </div>
        <HistoricalConsumptionGraphs />
      </section>

      <PurokHistoricalConsumptionGraphs />

    </main>
  );
}
