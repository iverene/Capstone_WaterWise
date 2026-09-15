import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

import {
  fetchYearlyHistory,
  fetchOverallYearlyPrediction,
} from "../services/consumptionAPI";
import LoadingSkeleton from "./LoadingSkeleton";
import ChartTooltip from "./ChartTooltip";

const formatValue = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  });

function YearlyConsumptionTrend() {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadYearlyTrend = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [historyResponse, predictionResponse] = await Promise.all([
        fetchYearlyHistory(),
        fetchOverallYearlyPrediction(),
      ]);

      const historyData =
        historyResponse?.data?.data ?? historyResponse?.data ?? historyResponse;

      const predictionData =
        predictionResponse?.data?.data ??
        predictionResponse?.data ??
        predictionResponse;

      const yearlyHistory = Array.isArray(historyData)
        ? historyData
        : (historyData?.overallYearly ??
          historyData?.yearlyHistory ??
          historyData?.history ??
          []);

      const normalizedHistory = Array.isArray(yearlyHistory)
        ? yearlyHistory
            .map((item) => {
              const year = Number(item?.year ?? 0);

              const consumption = Number(
                item?.consumption ??
                  item?.totalConsumption ??
                  item?.total_consumption ??
                  item?.value ??
                  0,
              );

              return {
                year: String(year),
                yearValue: year,
                consumption: Number.isFinite(consumption) ? consumption : 0,
                predicted: null,
              };
            })
            .filter(
              (item) => Number.isFinite(item.yearValue) && item.yearValue > 0,
            )
            .sort((a, b) => a.yearValue - b.yearValue)
        : [];

      const lastFiveYears = normalizedHistory.slice(-5);

      const predictedValue = Number(
        predictionData?.prediction ??
          predictionData?.predictedConsumption ??
          predictionData?.predicted_consumption ??
          predictionData?.forecast ??
          predictionData?.value ??
          0,
      );

      const latestHistoricalYear =
        lastFiveYears.length > 0
          ? Number(lastFiveYears[lastFiveYears.length - 1].year)
          : new Date().getFullYear();

      const predictionYear = Number(
        predictionData?.predictionYear ??
          predictionData?.prediction_year ??
          predictionData?.year ??
          predictionData?.period ??
          latestHistoricalYear + 1,
      );

      const finalPredictionYear = Number.isFinite(predictionYear)
        ? predictionYear
        : latestHistoricalYear + 1;

      const connectedHistory = lastFiveYears.map((record, index) => ({
        ...record,
        predicted: index === lastFiveYears.length - 1 ? record.consumption : null,
      }));

      const finalData = [
        ...connectedHistory,
        {
          year: String(finalPredictionYear),
          consumption: null,
          predicted: Number.isFinite(predictedValue) ? predictedValue : 0,
          isPrediction: true,
        },
      ];

      setChartData(finalData);
    } catch (err) {
      console.error("Failed to load yearly consumption trend:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load yearly consumption trend.",
      );

      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      await loadYearlyTrend();
    };

    fetchData();
  }, [loadYearlyTrend]);

  return (
    <section data-testid="yearly-consumption-trend"
    className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-extrabold tracking-tight text-navy-900">
          Yearly Consumption Forecast
        </h2>

        <button
          type="button"
          onClick={loadYearlyTrend}
          disabled={loading}
          aria-label="Refresh yearly trend"
          title="Refresh yearly trend"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && (
        <LoadingSkeleton label="Loading yearly consumption trend" variant="chart" />
      )}

      {!loading && error && (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="text-center text-red-700" role="alert">
            <AlertCircle aria-hidden="true" className="mx-auto h-5 w-5" />
            <p className="mt-2 text-sm font-semibold">{error}</p>
            <button className="mt-4 min-h-11 rounded-xl bg-white px-4 text-sm font-bold hover:bg-red-100" onClick={loadYearlyTrend} type="button">Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div className="h-60 w-full" aria-label="Yearly historical consumption and forecast chart" role="img">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{
                top: 10,
                right: 8,
                left: 0,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id="yearlyTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="year"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "#64748b",
                  fontSize: 12,
                }}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "#64748b",
                  fontSize: 11,
                }}
                tickFormatter={(value) => formatValue(value)}
                width={56}
              />

              <Tooltip content={<ChartTooltip hideConnectedPrediction unit="" valueFormatter={(value) => `${formatValue(value)} m³`} />} cursor={{ stroke: "#bae6fd" }} />

              <Legend
                wrapperStyle={{
                  fontSize: "12px",
                }}
              />

              <Area
                type="monotone"
                dataKey="consumption"
                name="Historical"
                stroke="#0284C7"
                strokeWidth={2.5}
                fill="url(#yearlyTrendFill)"
                dot={{ r: 3, fill: "#0284C7", stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{
                  r: 5,
                  fill: "#0284C7",
                  stroke: "#ffffff",
                  strokeWidth: 2,
                }}
                connectNulls={false}
              />

              <Line
                type="monotone"
                dataKey="predicted"
                name="Prediction"
                stroke="#0B2B40"
                strokeWidth={2.5}
                strokeDasharray="8 6"
                dot={{
                  r: 4,
                  fill: "#ffffff",
                  stroke: "#0B2B40",
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: "#0B2B40",
                  stroke: "#ffffff",
                  strokeWidth: 2,
                }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="sr-only">
            The solid teal line shows recorded yearly consumption. The dashed navy line shows the projected year.
          </p>
        </div>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <div className="text-center">
            <h3 className="font-semibold text-slate-700">
              No yearly data available
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Yearly consumption history will appear once records are available.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default YearlyConsumptionTrend;
