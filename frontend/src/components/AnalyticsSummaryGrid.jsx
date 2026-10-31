import { CalendarDays, Droplets, Gauge, Sigma, TrendingUp } from "lucide-react";
import KPI from "./KPI";

const number = (value) =>
  Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function AnalyticsSummaryGrid({ consumptionHistory = [] }) {
  const totalConsumption = consumptionHistory.reduce(
    (total, record) => total + Number(record.volume ?? 0),
    0,
  );
  const averageUsage = consumptionHistory.length
    ? totalConsumption / consumptionHistory.length
    : 0;
  const latestRecord = consumptionHistory.at(-1) ?? null;
  const highestRecord = consumptionHistory.length
    ? consumptionHistory.reduce((highest, record) =>
        Number(record.volume) > Number(highest.volume) ? record : highest,
      )
    : null;

  return (
    <section
      aria-label="Consumption summary"
      className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4"
      data-testid={consumptionHistory.length ? "analytics-grid" : "analytics-empty"}
    >
      <KPI
        animateValue
        description="Recorded Month"
        descriptionHighlight={latestRecord?.month ?? "No Recorded Month"}
        descriptionIcon={CalendarDays}
        icon={Droplets}
        title="Latest Water Use"
        unit="m³"
        value={number(latestRecord?.volume)}
        valueTestId="stat-latest"
      />
      <KPI
        animateValue
        description="Averaged"
        descriptionHighlight={`${consumptionHistory.length} Recorded Month${consumptionHistory.length === 1 ? "" : "s"}`}
        icon={Gauge}
        title="Monthly Average"
        unit="m³"
        value={number(averageUsage)}
        valueTestId="stat-avg"
      />
      <KPI
        animateValue
        description="This Period"
        descriptionHighlight={`${consumptionHistory.length} Recorded Month${consumptionHistory.length === 1 ? "" : "s"}`}
        icon={Sigma}
        title="Total for Period"
        unit="m³"
        value={number(totalConsumption)}
        valueTestId="stat-total"
      />
      <KPI
        animateValue
        description="Water Used"
        descriptionHighlight={`${number(highestRecord?.volume)} m³`}
        descriptionIcon={Droplets}
        descriptionTone="warning"
        icon={TrendingUp}
        title="Highest-Use Month"
        value={
          <span className="block text-lg sm:text-2xl">
            {highestRecord?.month ?? "No recorded month"}
          </span>
        }
        valueTestId="stat-highest"
      />
    </section>
  );
}
