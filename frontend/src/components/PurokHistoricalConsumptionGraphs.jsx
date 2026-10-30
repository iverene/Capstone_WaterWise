import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchAllPuroksMonthlyHistory, fetchAllPuroksYearlyHistory } from "../services/consumptionAPI";
import { fillYearlyBuckets, manilaCalendar, monthBuckets, parseYearMonth } from "../utils/chartPeriod";
import ChartTooltip from "./ChartTooltip";
import Filter from "./Filter";
import LoadingSkeleton from "./LoadingSkeleton";

const PUROKS = Array.from({ length: 6 }, (_, index) => `Purok ${index + 1}`);
const COLORS = Array(6).fill("#0284C7");
const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? [];

// Bucket raw history into calendar periods so months/years with no readings
// render at zero instead of vanishing and faking the trend. Monthly shows Jan
// through the current month for this year (up to 12), and all of a past year.
function normalize(response, mode, selectedYear) {
  const records = unwrap(response);
  if (!Array.isArray(records)) return [];

  return records.map((record) => {
    const items = Array.isArray(record?.historical) ? record.historical : [];
    let historical;
    if (mode === "monthly") {
      // Monthly items carry no year of their own; anchor them to the selected
      // or backend-resolved year. Stop the current year at the current month.
      const anchorYear = Number(record?.latestYear ?? (selectedYear ? Number(selectedYear) : NaN)) || manilaCalendar().year;
      const parsed = items
        .map((item) => {
          const position = parseYearMonth(item?.month ?? item?.period, anchorYear);
          if (!position || position.monthIndex < 0 || !Number.isInteger(position.year)) return null;
          const amount = Number(item?.consumption ?? 0);
          return { ...position, consumption: Number.isFinite(amount) ? amount : 0 };
        })
        .filter(Boolean);
      const allYearBuckets = monthBuckets({ year: anchorYear });
      const current = manilaCalendar();
      const buckets = anchorYear === current.year
        ? allYearBuckets.slice(0, current.monthIndex + 1)
        : allYearBuckets;
      const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));
      for (const entry of parsed) {
        if (entry.year !== anchorYear) continue;
        const key = `${entry.year}-${String(entry.monthIndex + 1).padStart(2, "0")}`;
        if (totals.has(key)) totals.set(key, totals.get(key) + entry.consumption);
      }
      historical = buckets.map((bucket) => ({ consumption: totals.get(bucket.key), period: bucket.label }));
    } else {
      const entries = items
        .map((item) => {
          const year = Number(item?.year ?? item?.period);
          const amount = Number(item?.consumption ?? 0);
          return Number.isInteger(year) ? { consumption: Number.isFinite(amount) ? amount : 0, year } : null;
        })
        .filter(Boolean);
      const { year: currentYear } = manilaCalendar();
      const startYear = entries.reduce((earliest, entry) => Math.min(earliest, entry.year), currentYear);
      const buckets = [];
      for (let bucketYear = startYear; bucketYear <= currentYear; bucketYear += 1) {
        buckets.push({ key: String(bucketYear), label: String(bucketYear), year: bucketYear });
      }
      historical = entries.length > 0
        ? fillYearlyBuckets(entries, buckets, (entry) => entry.consumption, (entry) => entry.year)
          .map((bucket) => ({ consumption: bucket.consumption, period: bucket.label }))
        : [];
    }
    return { historical, purok: record?.purok };
  });
}

function PurokGraph({ color, data, purok }) {
  const gradientId = `purok-history-fill-${useId().replace(/:/g, "")}`;
  const latest = data.at(-1);
  const previous = data.at(-2);

  let trend = null;
  let trendDirection = "neutral";
  let trendTone = "neutral";

  if (latest && previous && previous.consumption > 0) {
    const change = ((latest.consumption - previous.consumption) / previous.consumption) * 100;
    const rounded = Math.round(change * 10) / 10;
    trend = `${change >= 0 ? "+" : ""}${rounded}%`;
    trendDirection = change > 0 ? "up" : change < 0 ? "down" : "neutral";
    trendTone = change > 0 ? "negative" : change < 0 ? "positive" : "neutral";
  }

  const trendStyles = {
    positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    negative: "bg-red-50 text-red-700 ring-red-200",
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold text-slate-900">{purok}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {trend ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset sm:text-xs ${trendStyles[trendTone]}`}>
              {trendDirection === "up" ? <TrendingUp aria-hidden="true" className="h-3 w-3 shrink-0" /> : trendDirection === "down" ? <TrendingDown aria-hidden="true" className="h-3 w-3 shrink-0" /> : null}
              <span>{trend}</span>
            </span>
          ) : null}
        </div>
      </div>

      {data.length > 0 ? (
        <div aria-label={`${purok} historical consumption graph`} className="mt-4 h-60">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 12, top: 8 }}>
              <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
              <XAxis dataKey="period" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
              <YAxis axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 0 })} tickLine={false} width={44} />
              <Tooltip content={<ChartTooltip unit="" valueFormatter={(entry) => `${Number(entry ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} m³`} />} cursor={{ stroke: "#bae6fd" }} />
              <Area activeDot={{ fill: color, r: 4, strokeWidth: 0 }} dataKey="consumption" dot={{ fill: color, r: 3, stroke: "#ffffff", strokeWidth: 2 }} fill={`url(#${gradientId})`} name="Historical Consumption" stroke={color} strokeWidth={2.5} type="monotone" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 flex h-52 items-center justify-center rounded-xl bg-slate-50 px-5 text-center text-xs text-slate-500">No consumption records yet.</div>
      )}
    </article>
  );
}

export default function PurokHistoricalConsumptionGraphs() {
  const [period, setPeriod] = useState("monthly");
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [availableYears, setAvailableYears] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const [monthlyResponse, yearlyResponse] = await Promise.all([
        fetchAllPuroksMonthlyHistory(selectedYear || undefined),
        fetchAllPuroksYearlyHistory(),
      ]);
      setMonthly(normalize(monthlyResponse, "monthly", selectedYear));
      setYearly(normalize(yearlyResponse, "yearly", selectedYear));
      const years = [...new Set(
        unwrap(yearlyResponse)
          .flatMap((record) => Array.isArray(record?.historical) ? record.historical : [])
          .map((item) => Number(item?.year))
          .filter(Number.isInteger),
      )].sort((a, b) => b - a);
      setAvailableYears(years);
      if (!selectedYear && years.length > 0) {
        setSelectedYear(String(years[0]));
      }
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? requestError?.message ?? "Unable to load purok history.");
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(loadHistory, 0);
    const intervalId = window.setInterval(loadHistory, 15000);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadHistory]);

  const displayedPuroks = useMemo(() => {
    const source = period === "monthly" ? monthly : yearly;
    const current = manilaCalendar();
    const zeroMonths = monthly.length > 0
      ? monthly[0].historical.map(({ period }) => ({ consumption: 0, period }))
      : monthBuckets({ year: Number(selectedYear) || manilaCalendar().year })
        .filter((bucket) => {
          return bucket.year < current.year || (bucket.year === current.year && bucket.monthIndex <= current.monthIndex);
        })
        .map((bucket) => ({ consumption: 0, period: bucket.label }));
    const purokNumber = (value) => {
      const match = String(value ?? "").match(/\d+/);
      return match ? Number(match[0]) : null;
    };
    const findRecord = (purok) => {
      const want = purokNumber(purok);
      return source.find((record) => {
        if (record.purok === purok) return true;
        const have = purokNumber(record.purok);
        return want !== null && have !== null && have === want;
      }) ?? null;
    };
    return PUROKS.map((purok) => ({
      historical: findRecord(purok)?.historical ?? (period === "monthly" && monthly.length > 0 ? zeroMonths : []),
      purok,
    }));
  }, [monthly, period, selectedYear, yearly]);

  return (
    <section aria-label="Consumption per purok" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[15px] font-extrabold tracking-tight text-navy-900">Consumption Per Purok</h3>
        <div className="flex shrink-0 flex-row items-center gap-2">
            <Filter
            ariaLabel="Filter purok history by year"
            compact
            filters={[
              {
                ariaLabel: "Filter purok history by year",
                dataTestId: "purok-year-filter",
                hideLabel: true,
                hideLabelOnMobile: true,
                icon: CalendarDays,
                id: "purok-year-filter",
                label: "",
                name: "purokYear",
                onValueChange: setSelectedYear,
                options: availableYears.map((entry) => ({ label: String(entry), value: String(entry) })),
                value: selectedYear,
              },
            ]}
          />
          <div aria-label="Purok consumption period" className="inline-flex w-fit rounded-xl bg-slate-100 p-1" role="group">
          {["monthly", "yearly"].map((option) => (
            <button aria-pressed={period === option} className={`rounded-xl px-4 py-2 text-xs font-bold capitalize transition ${period === option ? "bg-white text-water-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`} key={option} onClick={() => setPeriod(option)} type="button">{option}</button>
          ))}
          </div>
        </div>
      </div>

      {loading && <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{PUROKS.map((purok) => <LoadingSkeleton key={purok} label={`Loading ${purok} consumption history`} variant="card" />)}</div>}
      {!loading && error && <div className="mt-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>}
      {!loading && !error && <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{displayedPuroks.map((record, index) => <PurokGraph color={COLORS[index % COLORS.length]} data={record.historical} key={record.purok} purok={record.purok} />)}</div>}
    </section>
  );
}
