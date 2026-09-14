import { BrainCircuit, Info, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import AdminOverallConsumptionCard from "../components/AdminOverallConsumptionCard";
import AdminMonthlyConsumptionCard from "../components/AdminMonthlyConsumptionCard";
import AdminYearlyConsumptionCard from "../components/AdminYearlyConsumptionCard";
import AdminPerPurokConsumptionCard from "../components/AdminPerPurokConsumptionCard";
import ConsumptionRankingSection from "../components/ConsumptionRankingSection";
import MonthlyConsumptionTrend from "../components/MonthlyConsumptionTrend";
import YearlyConsumptionTrend from "../components/YearlyConsumptionTrend";
import PerPurokConsumptionTrend from "../components/PerPurokConsumptionTrend";
import PurokComparisonChart from "../components/PurokComparisonChart";
import AnomalyRecommendationSection from "../components/AnomalyRecommendationSection";
import PageHeader from "../components/PageHeader";

const TABS = [
  {
    id: "prediction",
    label: "Prediction",
    description: "Forecast overall and per-purok water demand.",
    Icon: TrendingUp,
  },
  {
    id: "decision-support",
    label: "Decision Support",
    description: "Review priorities, anomalies, and recommended actions.",
    Icon: BrainCircuit,
  },
];

export default function AnalyticsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = TABS.some((tab) => tab.id === requestedTab)
    ? requestedTab
    : "prediction";

  const selectTab = (tabId) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tabId);
    setSearchParams(nextParams, { replace: true });
  };

  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    selectTab(TABS[nextIndex].id);
    requestAnimationFrame(() => document.getElementById(`analytics-tab-${TABS[nextIndex].id}`)?.focus());
  };

  return (
    <main className="space-y-5 sm:space-y-6" data-testid="analytics-dashboard">
      <PageHeader
        description="Understand expected demand, identify unusual consumption, and turn system data into practical barangay actions."
        eyebrow="Operational intelligence"
        title="Water Analytics"
      />

      <div
        aria-label="Analytics workspaces"
        className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card"
        onKeyDown={handleTabKeyDown}
        role="tablist"
      >
        {TABS.map(({ description, Icon, id, label }) => {
          const selected = id === activeTab;
          return (
            <button
              aria-controls={`analytics-panel-${id}`}
              aria-selected={selected}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-1 sm:justify-start sm:px-4 ${
                selected
                  ? "bg-water-600 text-white shadow-card"
                  : "text-slate-600 hover:bg-slate-50 hover:text-navy-900"
              }`}
              id={`analytics-tab-${id}`}
              key={id}
              onClick={() => selectTab(id)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="min-w-0 text-left">
                <span className="block">{label}</span>
                <span
                  className={`hidden truncate text-xs font-medium sm:block ${
                    selected ? "text-water-50" : "text-slate-500"
                  }`}
                >
                  {description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === "prediction" && (
        <section
          aria-labelledby="analytics-tab-prediction"
          className="space-y-6 outline-none"
          id="analytics-panel-prediction"
          role="tabpanel"
          tabIndex={0}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
            <div>
              <p className="font-bold">Use forecasts as planning estimates</p>
              <p className="mt-1 leading-6 text-sky-800">
                Predictions are based on recorded consumption history. Confirm unusual results against recent readings and field conditions before allocating resources.
              </p>
            </div>
          </div>

          <section aria-labelledby="forecast-summary-heading" className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Demand outlook</p>
              <h2 className="mt-1 text-xl font-extrabold text-navy-900" id="forecast-summary-heading">
                Forecast summary
              </h2>
              <p className="mt-1 text-sm text-slate-500">Expected water demand across the system and each purok.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <AdminOverallConsumptionCard />
              <AdminMonthlyConsumptionCard />
              <AdminYearlyConsumptionCard />
            </div>
            <AdminPerPurokConsumptionCard />
          </section>

          <section aria-labelledby="forecast-trends-heading" className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Historical context</p>
              <h2 className="mt-1 text-xl font-extrabold text-navy-900" id="forecast-trends-heading">
                Forecast trends
              </h2>
              <p className="mt-1 text-sm text-slate-500">Compare predicted demand with recent monthly and yearly history.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MonthlyConsumptionTrend />
              <YearlyConsumptionTrend />
            </div>
            <PerPurokConsumptionTrend />
          </section>
        </section>
      )}

      {activeTab === "decision-support" && (
        <section
          aria-labelledby="analytics-tab-decision-support"
          className="space-y-6 outline-none"
          id="analytics-panel-decision-support"
          role="tabpanel"
          tabIndex={0}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Action workspace</p>
              <h2 className="mt-1 text-xl font-extrabold text-navy-900">Priorities and recommendations</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Review the areas using the most water, compare puroks, investigate anomalies, and decide which operational response should come first.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                <BrainCircuit aria-hidden="true" className="h-5 w-5" />
                Human review required
              </div>
              <p className="mt-2 text-xs leading-5 text-emerald-700">
                Recommendations support official decisions; they do not automatically change service operations.
              </p>
            </div>
          </div>

          <ConsumptionRankingSection />

          <section aria-labelledby="purok-comparison-heading" className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Resource prioritization</p>
              <h2 className="mt-1 text-xl font-extrabold text-navy-900" id="purok-comparison-heading">
                Purok comparison
              </h2>
              <p className="mt-1 text-sm text-slate-500">Compare consumption levels before planning inspections or community interventions.</p>
            </div>
            <PurokComparisonChart />
          </section>

          <AnomalyRecommendationSection />
        </section>
      )}
    </main>
  );
}
