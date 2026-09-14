import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Droplets } from "lucide-react";
import { fetchMonthlyHistory, fetchYearlyHistory } from "../services/consumptionAPI";
import KPI from "./KPI";
import LoadingSkeleton from "./LoadingSkeleton";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? [];
const consumptionValue = (record) => Number(record?.consumption ?? record?.totalConsumption ?? record?.total_consumption ?? record?.value ?? 0);

function HistoryKpi({ Icon, label, records, periodKey, compact, showPeriodMeta = true, captionTrend = false }) {
  const latest = records.at(-1);
  const previous = records.at(-2);

  let trendDirection = "neutral";
  let trend = null;
  let trendTone = "neutral";

  if (latest && previous) {
    const current = consumptionValue(latest);
    const prev = consumptionValue(previous);
    if (prev > 0) {
      const change = ((current - prev) / prev) * 100;
      const rounded = Math.round(change * 10) / 10;
      const prevLabel = String(previous?.[periodKey] ?? "").trim();
      const prevName = prevLabel ? prevLabel.charAt(0).toUpperCase() + prevLabel.slice(1) : "Prior";
      trend = `${change >= 0 ? "+" : ""}${rounded}% vs ${prevName}`;
      trendDirection = change > 0 ? "up" : change < 0 ? "down" : "neutral";
      trendTone = change > 0 ? "negative" : change < 0 ? "positive" : "neutral";
    }
  }

  const previousRaw = previous?.[periodKey];
  const previousName = previousRaw == null || previousRaw === ""
    ? null
    : periodKey === "year"
      ? String(previousRaw)
      : String(previousRaw).charAt(0).toUpperCase() + String(previousRaw).slice(1);
  const trendCaption = !captionTrend
    ? undefined
    : !trend
      ? latest && !previous ? "First Record" : undefined
      : trendDirection === "up"
        ? `Higher than ${previousName ?? "Previous Period"}`
        : trendDirection === "down"
          ? `Lower than ${previousName ?? "Previous Period"}`
          : "Unchanged";

  return (
    <KPI
      className={compact ? "min-h-28" : "min-h-40 sm:h-56"}
      compact={compact}
      description={trendCaption}
      descriptionHighlight={showPeriodMeta ? (latest?.[periodKey] ?? "No Records") : undefined}
      descriptionIcon={showPeriodMeta ? CalendarDays : undefined}
      descriptionTone={showPeriodMeta ? "water" : undefined}
      icon={Icon}
      title={label}
      trend={trend}
      trendBelow
      trendDirection={trendDirection}
      trendTone={trendTone}
      unit="m³"
      value={consumptionValue(latest).toLocaleString("en-PH", { maximumFractionDigits: 2 })}
    />
  );
}

function HistoryKpiSkeleton({ Icon, label, compact }) {
  return (
    <article className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:p-4 ${compact ? "min-h-28" : "min-h-40 sm:h-56"}`}>
      <div className="relative flex h-full flex-col">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-water-50 text-water-700">
          <Icon aria-hidden="true" className="h-6 w-6" />
        </span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-600">{label}</p>
        <LoadingSkeleton className="mt-3" label={`Loading ${label.toLowerCase()}`} variant="inline" />
      </div>
    </article>
  );
}

export default function HistoricalConsumptionSummary({ className = "grid gap-5 md:grid-cols-2", compact = false, selectedMonth = "all", selectedYear = "" }) {
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetchMonthlyHistory(selectedYear || undefined), fetchYearlyHistory()])
      .then(([monthlyResponse, yearlyResponse]) => {
        if (!active) return;
        let monthlyData = unwrap(monthlyResponse);
        const yearlyData = unwrap(yearlyResponse);
        monthlyData = Array.isArray(monthlyData) ? monthlyData : [];
        if (selectedMonth && selectedMonth !== "all") {
          monthlyData = monthlyData.filter(
            (record) => String(record?.month ?? "").toLowerCase() === String(selectedMonth).toLowerCase(),
          );
        }
        setMonthly(monthlyData);
        setYearly(Array.isArray(yearlyData) ? yearlyData : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message ?? "Unable to load historical consumption.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedMonth, selectedYear]);

  if (loading) {
    return (
      <div className={className}>
        <HistoryKpiSkeleton compact={compact} Icon={Droplets} label="Monthly Consumption" />
        <HistoryKpiSkeleton compact={compact} Icon={CalendarDays} label="Yearly Consumption" />
      </div>
    );
  }
  if (error) return <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>;

  const yearlyRecords = selectedYear
    ? yearly.filter((record) => String(record?.year ?? "") === String(selectedYear))
    : yearly;

  return (
    <div className={className}>
      <HistoryKpi compact={compact} Icon={Droplets} label="Monthly Consumption" periodKey="month" records={monthly} showPeriodMeta={false} />
      <HistoryKpi compact={compact} Icon={CalendarDays} label="Yearly Consumption" periodKey="year" records={yearlyRecords.length > 0 ? yearlyRecords : yearly} captionTrend />
    </div>
  );
}
