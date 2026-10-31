import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchMonthlyHistory, fetchYearlyHistory } from "../services/consumptionAPI";
import { fillMonthlyBuckets, fillYearlyBuckets, manilaCalendar, monthBuckets } from "../utils/chartPeriod";
import ChartTooltip from "./ChartTooltip";
import Filter from "./Filter";
import LoadingSkeleton from "./LoadingSkeleton";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? [];
const value = (record) => Number(record?.consumption ?? record?.totalConsumption ?? record?.total_consumption ?? record?.value ?? 0);

function HistoryGraph({ data, dataKey, fillId, title, yearFilter = null }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-extrabold tracking-tight text-navy-900">{title}</h3>
        {yearFilter}
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
            <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0284C7" stopOpacity={0.35} /><stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} /></linearGradient></defs>
            <XAxis axisLine={false} dataKey={dataKey} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
            <YAxis axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 0 })} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip unit="" valueFormatter={(entry) => `${Number(entry ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} m³`} />} cursor={{ stroke: "#bae6fd" }} />
            <Area activeDot={{ fill: "#0284C7", r: 4, strokeWidth: 0 }} dataKey="consumption" dot={{ fill: "#0284C7", r: 3, stroke: "#ffffff", strokeWidth: 2 }} fill={`url(#${fillId})`} name="Historical Consumption" stroke="#0284C7" strokeWidth={2.5} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default function HistoricalConsumptionGraphs() {
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState("");
  const [availableYears, setAvailableYears] = useState([]);

  const loadHistory = useCallback(async ({ showLoading = true } = {}) => {
      let active = true;
      if (showLoading) setLoading(true);
      try {
        const [monthlyResponse, yearlyResponse] = await Promise.all([
          fetchMonthlyHistory(selectedYear || undefined),
          fetchYearlyHistory(),
        ]);
        if (!active) return;
        const yearlyRecords = Array.isArray(unwrap(yearlyResponse)) ? unwrap(yearlyResponse) : [];
        // Monthly items carry no year of their own; anchor them to the
        // backend-resolved target year (requested, else latest with data).
        const yearlyYears = yearlyRecords
          .map((record) => Number(record?.year ?? record?.Year))
          .filter(Number.isInteger);
        setAvailableYears([...new Set(yearlyYears)].sort((a, b) => b - a));
        if (!selectedYear && yearlyYears.length > 0) {
          setSelectedYear(String(Math.max(...yearlyYears)));
        }
        const dataYear = selectedYear || (yearlyYears.length > 0 ? Math.max(...yearlyYears) : manilaCalendar().year);
        const monthlyRecords = unwrap(monthlyResponse);
        // Zero-filled calendar continuity for elapsed months only: months
        // that haven't happened yet are cut off, never rendered as zero.
        // A series with no records at all stays empty (not a flat zero line).
        const { year: currentYearOnly, monthIndex: currentMonthIndex } = manilaCalendar();
        const currentKey = `${currentYearOnly}-${String(currentMonthIndex + 1).padStart(2, "0")}`;
        const monthlyBuckets = monthBuckets({ year: dataYear }).filter((bucket) => bucket.key <= currentKey);
        setMonthly(
          Array.isArray(monthlyRecords) && monthlyRecords.length > 0
            ? fillMonthlyBuckets(monthlyRecords, monthlyBuckets, value, dataYear)
            : [],
        );
        const { year: currentYear } = manilaCalendar();
        const startYear = yearlyRecords.reduce(
          (earliest, record) => {
            const recordYear = Number(record?.year ?? record?.Year);
            return Number.isInteger(recordYear) ? Math.min(earliest, recordYear) : earliest;
          },
          currentYear,
        );
        const yearRange = [];
        for (let bucketYear = startYear; bucketYear <= currentYear; bucketYear += 1) {
          yearRange.push({ key: String(bucketYear), label: String(bucketYear), year: bucketYear });
        }
        setYearly(fillYearlyBuckets(yearlyRecords, yearRange, value, (record) => record?.year ?? record?.Year));
      } catch {
        if (active) { setMonthly([]); setYearly([]); }
      } finally {
        if (showLoading && active) setLoading(false);
      }
  }, [selectedYear]);

  useEffect(() => {
    void loadHistory();
    const handleTargetedRefresh = (event) => {
      if (event.detail?.path === "/admin/analytics") {
        void loadHistory({ showLoading: false });
      }
    };
    window.addEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    return () => window.removeEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
  }, [loadHistory]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {loading ? (
        <><LoadingSkeleton label="Loading monthly historical consumption" variant="chart-panel" /><LoadingSkeleton label="Loading yearly historical consumption" variant="chart-panel" /></>
      ) : (
        <><HistoryGraph data={monthly} dataKey="label" fillId="descriptive-monthly-fill" title="Monthly Historical Consumption" yearFilter={
          <Filter
            ariaLabel="Filter monthly history by year"
            compact
            filters={[
              {
                ariaLabel: "Filter monthly history by year",
                dataTestId: "history-year-filter",
                id: "history-year-filter",
                label: "",
                name: "historyYear",
                onValueChange: setSelectedYear,
                options: availableYears.map((entry) => ({ label: String(entry), value: String(entry) })),
                value: selectedYear,
              },
            ]}
          />
        } /><HistoryGraph data={yearly} dataKey="label" fillId="descriptive-yearly-fill" title="Yearly Historical Consumption" /></>
      )}
    </div>
  );
}
