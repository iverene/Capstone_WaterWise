import { CalendarDays, Droplets } from "lucide-react";
import KPI from "./KPI";

export default function MonthlyConsumptionWidget({ month = "N/A", usage = 0 }) {
  return (
    <KPI
      description="latest recorded period"
      descriptionHighlight={month}
      descriptionHighlightTestId="consumption-month"
      descriptionIcon={CalendarDays}
      icon={Droplets}
      title="Water Used This Month"
      unit="m³"
      value={usage}
      valueTestId="consumption-usage"
    />
  );
}
