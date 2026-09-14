import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import {
  fetchMonthlyHistory,
  fetchOverallMonthlyPrediction,
} from "../services/consumptionAPI";
import LoadingSkeleton from "./LoadingSkeleton";
import ChartTooltip from "./ChartTooltip";

const MONTH_ORDER = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function MonthlyConsumptionTrend() {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMonthlyTrend = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [historyResponse, predictionResponse] = await Promise.all([
        fetchMonthlyHistory(),
        fetchOverallMonthlyPrediction(),
      ]);

      const historyData =
        historyResponse?.data?.data ?? historyResponse?.data ?? historyResponse;

      const predictionData =
        predictionResponse?.data?.data ??
        predictionResponse?.data ??
        predictionResponse;

      const monthlyHistory = Array.isArray(historyData)
        ? historyData
        : (historyData?.overallMonthly ??
          historyData?.monthlyHistory ??
          historyData?.history ??
          []);

      const normalizedHistory = Array.isArray(monthlyHistory)
        ? monthlyHistory
            .map((item) => {
              const rawMonth = String(item?.month ?? "").toLowerCase();

              const monthIndex = MONTH_ORDER.indexOf(rawMonth);

              return {
                month:
                  monthIndex >= 0
                    ? MONTH_LABELS[monthIndex]
                    : (item?.month ?? "Unknown"),
                monthIndex: monthIndex >= 0 ? monthIndex : 999,
                consumption: Number(
                  item?.consumption ??
                    item?.totalConsumption ??
                    item?.total_consumption ??
                    item?.value ??
                    0,
                ),
                predicted: null,
              };
            })
            .filter(
              (item) => Number.isFinite(item.consumption),
            )
            .sort((a, b) => a.monthIndex - b.monthIndex)
        : [];

      const lastFiveMonths = normalizedHistory.slice(-5);

      const predictedValue = Number(
        predictionData?.prediction ??
          predictionData?.predictedConsumption ??
          predictionData?.predicted_consumption ??
          predictionData?.forecast ??
          predictionData?.value ??
          0,
      );

      const predictionMonth =
        predictionData?.predictionMonth ??
        predictionData?.prediction_month ??
        predictionData?.month ??
        predictionData?.period ??
        "Next Month";

      const connectedHistory = lastFiveMonths.map((record, index) => ({
        ...record,
        predicted: index === lastFiveMonths.length - 1 ? record.consumption : null,
      }));

      const finalData = [
        ...connectedHistory,
        {
          month: formatMonthLabel(predictionMonth),
          consumption: null,
          predicted: Number.isFinite(predictedValue) ? predictedValue : 0,
        },
      ];

      setChartData(finalData);
    } catch (err) {
      console.error("Failed to load monthly consumption trend:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load monthly consumption trend.",
      );

      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      await loadMonthlyTrend();
    };

    fetchData();
  }, [loadMonthlyTrend]);

  return (
    <section data-testid="monthly-consumption-trend"
    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">
            Monthly outlook
          </p>

          <h2 className="mt-1 text-xl font-extrabold text-navy-900">
            Monthly Consumption Trend
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Five historical months with one AI-predicted month.
          </p>
        </div>

        <button
          type="button"
          onClick={loadMonthlyTrend}
          disabled={loading}
          aria-label="Refresh monthly trend"
          title="Refresh monthly trend"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && (
        <LoadingSkeleton label="Loading monthly consumption trend" variant="chart" />
      )}

      {!loading && error && (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="text-center text-red-700" role="alert">
            <AlertCircle aria-hidden="true" className="mx-auto h-5 w-5" />
            <p className="mt-2 text-sm font-semibold">{error}</p>
            <button className="mt-4 min-h-11 rounded-xl bg-white px-4 text-sm font-bold hover:bg-red-100" onClick={loadMonthlyTrend} type="button">Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div className="h-72 sm:h-80" aria-label="Monthly historical consumption and forecast chart" role="img">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 10,
                right: 20,
                left: 0,
                bottom: 5,
              }}
            >
              <defs>
                <linearGradient id="monthlyTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE5EA" vertical={false} />

              <XAxis
                dataKey="month"
                tick={{
                  fill: "#64748b",
                  fontSize: 12,
                }}
                axisLine={{
                  stroke: "#cbd5e1",
                }}
                tickLine={false}
              />

              <YAxis
                tick={{
                  fill: "#64748b",
                  fontSize: 12,
                }}
                axisLine={{
                  stroke: "#cbd5e1",
                }}
                tickLine={false}
                width={45}
                unit=" m³"
              />

              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#94A3B8", strokeWidth: 1 }} />

              <Legend />

              <Area
                type="linear"
                dataKey="consumption"
                name="Historical"
                stroke="#0284C7"
                strokeWidth={2.5}
                fill="url(#monthlyTrendFill)"
                dot={{ r: 3.5, fill: "#ffffff", stroke: "#0284C7", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#0284C7", stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls={false}
              />

              <Line
                type="linear"
                dataKey="predicted"
                name="Prediction"
                stroke="#0B2B40"
                strokeWidth={2.5}
                strokeDasharray="8 5"
                dot={{ r: 4, fill: "#ffffff", stroke: "#0B2B40", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#0B2B40", stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="sr-only">
            The solid teal line shows recorded monthly consumption. The dashed navy line shows the predicted month.
          </p>
        </div>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <div className="text-center">
            <h3 className="font-semibold text-slate-700">
              No monthly data available
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Monthly consumption history will appear once records are
              available.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function formatMonthLabel(value) {
  const normalized = String(value ?? "").toLowerCase();

  const matchedMonthIndex = MONTH_ORDER.findIndex((month) =>
    normalized.includes(month),
  );

  if (matchedMonthIndex >= 0) {
    return MONTH_LABELS[matchedMonthIndex];
  }

  return value || "Next Month";
}

export default MonthlyConsumptionTrend;
