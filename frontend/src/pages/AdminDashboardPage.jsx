import AdminOverallConsumptionCard from "../components/AdminOverallConsumptionCard";
import HistoricalConsumptionSummary from "../components/HistoricalConsumptionSummary";
import HistoricalConsumptionGraphs from "../components/HistoricalConsumptionGraphs";
import PurokHistoricalConsumptionGraphs from "../components/PurokHistoricalConsumptionGraphs";
import PageHeader from "../components/PageHeader";

export default function AdminDashboardPage() {
  return (
    <main className="space-y-5" data-testid="admin-dashboard">
      <PageHeader
        description="Review recorded consumption using historical water data."
        eyebrow="Operations overview"
        title="Water operations overview"
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
