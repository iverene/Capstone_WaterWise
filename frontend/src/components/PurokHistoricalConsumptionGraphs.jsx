import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchAllPuroksMonthlyHistory, fetchAllPuroksYearlyHistory } from "../services/consumptionAPI";
import ChartTooltip from "./ChartTooltip";
import LoadingSkeleton from "./LoadingSkeleton";

const PUROKS = Array.from({ length: 6 }, (_, index) => `Purok ${index + 1}`);
const COLORS = Array(6).fill("#0284C7");
const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? [];

function normalize(response, periodKey) {
  const records = unwrap(response);
  if (!Array.isArray(records)) return [];

  return records.map((record) => ({
    purok: record?.purok,
    historical: (Array.isArray(record?.historical) ? record.historical : [])
      .map((item) => ({ period: item?.[periodKey], consumption: Number(item?.consumption ?? 0) }))
      .filter((item) => item.period !== undefined && Number.isFinite(item.consumption))
      .slice(-4),
  }));
}

function PurokGraph({ color, data, purok }) {
  const total = data.reduce((sum, item) => sum + item.consumption, 0);
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
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-slate-900">{purok}</h3>
          <p className="mt-1 text-xs text-slate-500">4-period total: {total.toLocaleString("en-PH", { maximumFractionDigits: 2 })} m³</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {trend ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset sm:text-xs ${trendStyles[trendTone]}`}>
              {trendDirection === "up" ? <TrendingUp aria-hidden="true" className="h-3 w-3 shrink-0" /> : trendDirection === "down" ? <TrendingDown aria-hidden="true" className="h-3 w-3 shrink-0" /> : null}
              <span>{trend}</span>
            </span>
          ) : null}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700"><TrendingUp className="h-4 w-4" /></span>
        </div>
      </div>

      {data.length > 0 ? (
        <div aria-label={`${purok} historical consumption graph`} className="mt-4 h-52">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={data} margin={{ left: -16, right: 12, top: 8 }}>
              <defs><linearGradient id="purokHistoryFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.16} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid stroke="#DCE5EA" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} width={58} />
              <Tooltip content={<ChartTooltip valueLabel="consumption" />} cursor={{ stroke: "#94A3B8", strokeWidth: 1 }} />
              <Area activeDot={{ fill: color, r: 6, stroke: "#FFFFFF", strokeWidth: 2 }} dataKey="consumption" dot={{ fill: "#FFFFFF", r: 3.5, stroke: color, strokeWidth: 2 }} fill="url(#purokHistoryFill)" name="Historical consumption" stroke={color} strokeWidth={2.5} type="linear" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 flex h-52 items-center justify-center rounded-xl bg-slate-50 px-5 text-center text-xs text-slate-500">No historical consumption recorded for this purok.</div>
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

  const loadHistory = useCallback(async () => {
    try {
      const [monthlyResponse, yearlyResponse] = await Promise.all([
        fetchAllPuroksMonthlyHistory(),
        fetchAllPuroksYearlyHistory(),
      ]);
      setMonthly(normalize(monthlyResponse, "month"));
      setYearly(normalize(yearlyResponse, "year"));
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? requestError?.message ?? "Unable to load purok history.");
    } finally {
      setLoading(false);
    }
  }, []);

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
    return PUROKS.map((purok) => ({ purok, historical: source.find((record) => record.purok === purok)?.historical ?? [] }));
  }, [monthly, period, yearly]);

  return (
    <section aria-labelledby="purok-consumption-title" className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-water-600">Community history</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900" id="purok-consumption-title">Consumption Per Purok</h2>
          <p className="mt-1 text-sm text-slate-500">Latest four historical periods for each of the six puroks.</p>
        </div>
        <div aria-label="Purok consumption period" className="inline-flex w-fit rounded-xl bg-slate-100 p-1" role="group">
          {["monthly", "yearly"].map((option) => (
            <button aria-pressed={period === option} className={`rounded-xl px-4 py-2 text-xs font-bold capitalize transition ${period === option ? "bg-white text-water-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`} key={option} onClick={() => setPeriod(option)} type="button">{option}</button>
          ))}
        </div>
      </div>

      {loading && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{PUROKS.map((purok) => <LoadingSkeleton key={purok} label={`Loading ${purok} consumption history`} variant="card" />)}</div>}
      {!loading && error && <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>}
      {!loading && !error && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{displayedPuroks.map((record, index) => <PurokGraph color={COLORS[index]} data={record.historical} key={record.purok} purok={record.purok} />)}</div>}
    </section>
  );
}
