import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Banknote, CalendarClock, CheckCircle2, Droplets, Flag, ReceiptText, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTooltip from "../components/ChartTooltip";
import KPI from "../components/KPI";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { currency, fetchAdminDashboardMetrics } from "../services/adminDashboardMetrics";

const STATUS_COLORS = {
  "Paid This Month": "#34d399",
  "Partially Paid": "#fbbf24",
  Unpaid: "#f87171",
};

const compactPeso = (value) => {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 1000) return `₱${(amount / 1000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}k`;
  return `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
};

const compactCubicMeters = (value) => {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}k`;
  return `${amount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
};

const formatCubicMeters = (value) =>
  `${Number(value ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 1 })} m³`;

function ChartCard({ badge, children, title }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-extrabold tracking-tight text-navy-900">{title}</h2>
        {badge ? (
          <span className="rounded-full bg-water-50 px-2.5 py-0.5 text-[11px] font-bold text-water-700">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-3 h-48">{children}</div>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setMetrics(await fetchAdminDashboardMetrics());
    } catch (requestError) {
      setError(requestError?.message ?? "Unable to load dashboard metrics.");
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadMetrics);
  }, [loadMetrics]);

  const coverage = metrics && metrics.residentsActive > 0
    ? Math.round((metrics.readingsDone / metrics.residentsActive) * 100)
    : 0;
  const collectedChange = metrics && metrics.collectedPrevious > 0
    ? ((metrics.collectedMonth - metrics.collectedPrevious) / metrics.collectedPrevious) * 100
    : null;

  return (
    <main className="space-y-5 sm:space-y-6" data-testid="admin-dashboard">
      <PageHeader title="Dashboard" />
      <p className="-mt-3 text-sm font-semibold text-slate-600">
        {new Intl.DateTimeFormat("en-PH", {
          day: "numeric",
          month: "long",
          timeZone: "Asia/Manila",
          weekday: "long",
          year: "numeric",
        }).format(new Date())}
      </p>

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span className="flex items-center gap-2"><AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />{error}</span>
          <button className="min-h-11 shrink-0 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800" onClick={loadMetrics} type="button">
            Try again
          </button>
        </div>
      )}

      {loading || !metrics ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
          <LoadingSkeleton label="Loading dashboard metrics" variant="inline" />
          <LoadingSkeleton label="Loading dashboard metrics" variant="inline" />
          <LoadingSkeleton label="Loading dashboard metrics" variant="inline" />
          <LoadingSkeleton label="Loading dashboard metrics" variant="inline" />
        </div>
      ) : (
        <>
          <section aria-label="Key indicators" className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
            <KPI
              compact
              description="Unpaid Bills"
              descriptionHighlight={metrics.debtorCount > 0 ? `${metrics.debtorCount} Debtors` : "All Clear"}
              descriptionIcon={metrics.debtorCount > 0 ? ReceiptText : CheckCircle2}
              descriptionTone={metrics.debtorCount > 0 ? "warning" : "positive"}
              icon={WalletCards}
              title="Outstanding Balance"
              value={currency(metrics.outstandingTotal)}
            />
            <KPI
              compact
              descriptionHighlight={collectedChange === null ? "No Prior Data" : `${collectedChange >= 0 ? "+" : ""}${collectedChange.toFixed(1)}% vs ${metrics.previousMonthLabel}`}
              descriptionIcon={collectedChange === null ? undefined : collectedChange > 0 ? TrendingUp : collectedChange < 0 ? TrendingDown : undefined}
              descriptionTone={collectedChange === null ? "neutral" : collectedChange > 0 ? "positive" : collectedChange < 0 ? "negative" : "neutral"}
              icon={Banknote}
              title="Collected This Month"
              value={currency(metrics.collectedMonth)}
            />
            <KPI
              compact
              descriptionHighlight={`${coverage}% Coverage`}
              descriptionIcon={CalendarClock}
              descriptionTone={coverage >= 100 ? "positive" : "water"}
              icon={Droplets}
              title="Readings Recorded"
              value={`${metrics.readingsDone} of ${metrics.residentsActive}`}
            />
            <KPI
              compact
              description="Unpaid for 3+ Months"
              descriptionHighlight={metrics.flaggedCount > 0 ? "Needs Review" : "None Flagged"}
              descriptionIcon={metrics.flaggedCount > 0 ? Flag : CheckCircle2}
              descriptionTone={metrics.flaggedCount > 0 ? "warning" : "positive"}
              icon={Flag}
              title="Flagged Accounts"
              value={String(metrics.flaggedCount)}
            />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Collections">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={metrics.collectionsSeries} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
                  <XAxis axisLine={false} dataKey="month" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                  <YAxis axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={compactPeso} tickLine={false} width={52} />
                  <Tooltip content={<ChartTooltip unit="" valueFormatter={(value) => currency(value)} />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="amount" name="Collected" radius={[6, 6, 6, 6]} maxBarSize={40}>
                    {metrics.collectionsSeries.map((entry, index) => (
                      <Cell fill={index === metrics.collectionsSeries.length - 1 ? "#0284c7" : "#bae6fd"} key={entry.month} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Consumption">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={metrics.consumptionSeries} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
                  <defs>
                    <linearGradient id="dashboard-consumption-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#0284c7" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis axisLine={false} dataKey="month" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                  <YAxis axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={compactCubicMeters} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip unit="" valueFormatter={(value) => formatCubicMeters(value)} />} cursor={{ stroke: "#bae6fd" }} />
                  <Area activeDot={{ fill: "#0284c7", r: 4, strokeWidth: 0 }} dataKey="cubicMeters" dot={{ fill: "#0284c7", r: 3, strokeWidth: 2, stroke: "#ffffff" }} fill="url(#dashboard-consumption-fill)" name="Consumption" stroke="#0284c7" strokeWidth={2.5} type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard badge="All Bills" title="Billing Status">
              <div className="flex h-full items-center gap-3">
                <div className="h-full min-w-0 flex-1">
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Pie data={metrics.billingStatus} dataKey="value" innerRadius="62%" nameKey="name" outerRadius="88%" paddingAngle={5} strokeWidth={0} cornerRadius={7}>
                        {metrics.billingStatus.map((entry) => (
                          <Cell fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} key={entry.name} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip unit="" valueFormatter={(value) => currency(value)} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="grid shrink-0 gap-3 pr-1">
                  {metrics.billingStatus.map((entry) => (
                    <li key={entry.name}>
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[entry.name] ?? "#94a3b8" }} />
                        {entry.name}
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-extrabold tabular-nums text-navy-900">
                        {currency(entry.value)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartCard>

            <ChartCard badge={metrics.currentMonthLabel} title="Consumption by Purok">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={metrics.purokTop} layout="vertical" margin={{ bottom: 0, left: 0, right: 40, top: 0 }}>
                  <XAxis axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={compactCubicMeters} tickLine={false} type="number" />
                  <YAxis axisLine={false} dataKey="purok" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} type="category" width={76} />
                  <Tooltip content={<ChartTooltip unit="" valueFormatter={(value) => formatCubicMeters(value)} />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar background={{ fill: "#f1f5f9", radius: 7 }} barSize={14} dataKey="cubicMeters" fill="#0284c7" name="Consumption" radius={[7, 7, 7, 7]}>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </main>
  );
}
