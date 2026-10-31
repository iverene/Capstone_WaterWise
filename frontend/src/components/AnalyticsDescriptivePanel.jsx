import AdminOverallConsumptionCard from "./AdminOverallConsumptionCard";
import HistoricalConsumptionGraphs from "./HistoricalConsumptionGraphs";
import HistoricalConsumptionSummary from "./HistoricalConsumptionSummary";
import PurokHistoricalConsumptionGraphs from "./PurokHistoricalConsumptionGraphs";

/**
 * Descriptive analytics workspace: what the system has recorded. Period
 * scoping lives inside the individual graphs that need it.
 */
export default function AnalyticsDescriptivePanel() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <section aria-label="Consumption summary" className="space-y-3">
        <div className="grid gap-2 sm:gap-3 xl:grid-cols-3">
          <AdminOverallConsumptionCard animateValue compact />
          <HistoricalConsumptionSummary
            animateValue
            className="grid grid-cols-2 gap-2 sm:gap-3 xl:col-span-2"
            compact
          />
        </div>
      </section>

      <section aria-label="Monthly and yearly trends" className="space-y-3">
        <HistoricalConsumptionGraphs />
      </section>

      <PurokHistoricalConsumptionGraphs />
    </div>
  );
}
