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
  fetchAllPuroksMonthlyHistory,
  fetchAllPuroksMonthlyPrediction,
  fetchAllPuroksYearlyHistory,
  fetchAllPuroksYearlyPrediction,
} from "../services/consumptionAPI";
import { manilaCalendar, monthBuckets, parseYearMonth, yearBuckets } from "../utils/chartPeriod";
import ChartTooltip from "./ChartTooltip";
import LoadingSkeleton from "./LoadingSkeleton";

const DEFAULT_PUROKS = [
  "Purok 1",
  "Purok 2",
  "Purok 3",
  "Purok 4",
  "Purok 5",
  "Purok 6",
];

const MONTHS = [
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

const formatConsumption = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const normalizeMonth = (month) => {
  const normalizedMonth = String(month ?? "").toLowerCase();

  const monthIndex = MONTHS.findIndex(
    (item) =>
      normalizedMonth === item || normalizedMonth.startsWith(item.slice(0, 3)),
  );

  return {
    monthIndex,

    label:
      monthIndex >= 0 ? MONTH_LABELS[monthIndex] : String(month ?? "Unknown"),
  };
};

const extractResponseData = (response) =>
  response?.data?.data ?? response?.data ?? response ?? [];

function PerPurokConsumptionTrend() {
  const [period, setPeriod] = useState("Monthly");

  const [purokData, setPurokData] = useState({});

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const loadPerPurokTrend = useCallback(async () => {
    try {
      setLoading(true);

      setError("");

      const [historyResponse, predictionResponse] = await Promise.all([
        period === "Monthly"
          ? fetchAllPuroksMonthlyHistory()
          : fetchAllPuroksYearlyHistory(),

        period === "Monthly"
          ? fetchAllPuroksMonthlyPrediction()
          : fetchAllPuroksYearlyPrediction(),
      ]);

      const historyResult = extractResponseData(historyResponse);

      const predictionResult = extractResponseData(predictionResponse);

      const historyList = Array.isArray(historyResult)
        ? historyResult
        : period === "Monthly"
          ? (historyResult?.allPuroksMonthly ??
            historyResult?.history ??
            historyResult?.data ??
            [])
          : (historyResult?.allPuroksYearly ??
            historyResult?.history ??
            historyResult?.data ??
            []);

      const predictionList = Array.isArray(predictionResult)
        ? predictionResult
        : period === "Monthly"
          ? (predictionResult?.allPuroksMonthly ??
            predictionResult?.predictions ??
            predictionResult?.data ??
            [])
          : (predictionResult?.allPuroksYearly ??
            predictionResult?.predictions ??
            predictionResult?.data ??
            []);

      const combinedData = {};

      DEFAULT_PUROKS.forEach((purokName) => {
        const purokHistory = historyList.find(
          (item) =>
            String(item?.purok ?? "").toLowerCase() === purokName.toLowerCase(),
        );

        const purokPrediction = predictionList.find(
          (item) =>
            String(item?.purok ?? "").toLowerCase() === purokName.toLowerCase(),
        );

        const historicalRecords = Array.isArray(purokHistory?.historical)
          ? purokHistory.historical
          : Array.isArray(purokHistory?.monthly)
            ? purokHistory.monthly
            : Array.isArray(purokHistory?.yearly)
              ? purokHistory.yearly
              : Array.isArray(purokHistory)
                ? purokHistory
                : [];

        const normalizedHistory = historicalRecords.map((record) => {
          const consumption = Number(
            record?.consumption ??
              record?.totalConsumption ??
              record?.total_consumption ??
              record?.value ??
              0,
          );

          const label =
            period === "Monthly"
              ? normalizeMonth(record?.month).label
              : String(record?.year ?? "Unknown");

          return {
            label,

            year: record?.year,

            consumption: Number.isFinite(consumption) ? consumption : 0,

            predicted: null,
          };
        });

        // Zero-filled trailing windows: elapsed months/years with no readings
        // plot at zero instead of vanishing and faking each purok's trend.
        const anchorYear = Number(purokHistory?.latestYear) || manilaCalendar().year;
        let windowHistory;
        if (period === "Monthly") {
          const buckets = monthBuckets({ count: 6 });
          const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));
          for (const record of normalizedHistory) {
            const position = parseYearMonth(record?.month ?? record?.label, anchorYear);
            if (!position || position.monthIndex < 0) continue;
            const key = `${position.year ?? anchorYear}-${String(position.monthIndex + 1).padStart(2, "0")}`;
            if (totals.has(key)) totals.set(key, totals.get(key) + Number(record.consumption ?? 0));
          }
          windowHistory = buckets.map((bucket) => ({
            consumption: totals.get(bucket.key),
            label: bucket.label,
            month: bucket.label,
            predicted: null,
            year: bucket.year,
          }));
        } else {
          const buckets = yearBuckets(6);
          const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));
          for (const record of normalizedHistory) {
            const recordYear = Number(record?.year);
            if (!Number.isInteger(recordYear)) continue;
            const key = String(recordYear);
            if (totals.has(key)) totals.set(key, totals.get(key) + Number(record.consumption ?? 0));
          }
          windowHistory = buckets.map((bucket) => ({
            consumption: totals.get(bucket.key),
            label: bucket.label,
            predicted: null,
            year: bucket.year,
          }));
        }

        const predictionValue = Number(
          purokPrediction?.prediction ??
            purokPrediction?.predictedConsumption ??
            purokPrediction?.predicted_consumption ??
            purokPrediction?.forecast ??
            purokPrediction?.value ??
            0,
        );

        const connectedHistory = windowHistory.map((record, index) => ({
          ...record,

          predicted:
            index === windowHistory.length - 1 ? record.consumption : null,
        }));

        let predictionLabel = "Next";

        if (period === "Monthly") {
          const lastLabel = windowHistory[windowHistory.length - 1]?.label;

          const { monthIndex } = normalizeMonth(lastLabel);

          if (monthIndex >= 0) {
            predictionLabel = MONTH_LABELS[(monthIndex + 1) % 12];
          }
        } else {
          const lastYear = Number(windowHistory[windowHistory.length - 1]?.year);

          if (Number.isFinite(lastYear)) {
            predictionLabel = String(lastYear + 1);
          }
        }

        const chartData = [
          ...connectedHistory,

          {
            label: predictionLabel,

            consumption: null,

            predicted: Number.isFinite(predictionValue) ? predictionValue : 0,

            isPrediction: true,
          },
        ];

        combinedData[purokName] = {
          chartData:
            windowHistory.some((record) => record.consumption > 0) || predictionValue > 0 ? chartData : [],

          predictedConsumption: predictionValue,
        };
      });

      setPurokData(combinedData);
    } catch (err) {
      console.error("Failed to load per purok trend:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load per purok consumption trend.",
      );

      setPurokData({});
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const run = async () => {
      await loadPerPurokTrend();
    };

    run();
  }, [loadPerPurokTrend]);

  return (
    <section
    data-testid="purok-consumption-trend"
      className="
rounded-2xl
border
border-slate-200
bg-white
p-4
sm:p-5
"
    >
      {/* HEADER */}

      <div
        className="
mb-4
flex
flex-wrap
items-center
justify-between
gap-3
"
      >
        <h2
          className="
min-w-0
flex-1
text-[15px]
font-extrabold
leading-snug
tracking-tight
text-navy-900
line-clamp-2
"
        >
          Per Purok Consumption Forecast
        </h2>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div
            className="
inline-flex
rounded-xl
bg-slate-100
p-1
"
            role="group"
            aria-label="Purok trend period"
          >
            <button
              onClick={() => setPeriod("Monthly")}
              aria-pressed={period === "Monthly"}
              className={`
rounded-xl
px-4
py-2
text-xs
font-bold
transition
${
  period === "Monthly" ? "bg-white text-water-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
}

`}
            >
              Monthly
            </button>

            <button
              onClick={() => setPeriod("Yearly")}
              aria-pressed={period === "Yearly"}
              className={`

rounded-xl
px-4
py-2
text-xs
font-bold
transition
${period === "Yearly" ? "bg-white text-water-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}

`}
            >
              Yearly
            </button>
          </div>

          <button
            type="button"
            onClick={loadPerPurokTrend}
            disabled={loading}
            className="
flex
h-8
w-8
shrink-0
items-center
justify-center
rounded-lg
border
border-slate-200
text-slate-500
hover:border-water-300
hover:bg-water-50
hover:text-water-700
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-water-600
disabled:opacity-50
"
          >
            <span className="sr-only">Refresh per-purok trends</span>
            <RefreshCw
              className={`

h-4
w-4

${loading ? "animate-spin" : ""}

`}
            />
          </button>
        </div>
      </div>

      {/* LOADING */}

      {loading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {DEFAULT_PUROKS.map((purok) => <LoadingSkeleton key={purok} label={`Loading ${purok} trend`} variant="card" />)}
        </div>
      )}

      {/* ERROR */}

      {!loading && error && (
        <div
          className="
flex
min-h-56
items-center
justify-center
rounded-2xl
border
border-red-200
bg-red-50
"
        >
          <div
            className="
flex
items-center
gap-2
text-red-600
"
          >
            <AlertCircle
              className="
h-5
w-5
"
            />

            <div>
              <p className="text-sm font-semibold">{error}</p>
              <button className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-red-700 hover:bg-red-100" onClick={loadPerPurokTrend} type="button">
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHARTS */}

      {!loading && !error && (
        <div
          className="
grid
grid-cols-1
gap-6
md:grid-cols-2
xl:grid-cols-3
"
        >
          {DEFAULT_PUROKS.map((purok) => {
            const records = purokData[purok];

            const chartData = records?.chartData ?? [];

            return (
              <article
                key={purok}
                className="
rounded-2xl
border
border-slate-200
bg-white
p-4
"
              >
                <div
                  className="
flex
items-center
justify-between
gap-3
"
                >
                  <h3
                    className="
text-sm
font-extrabold
text-slate-900
"
                  >
                    {purok}
                  </h3>
                </div>

                <div
                  aria-label={`${purok} historical consumption and forecast chart`}
                  className="
mt-4
h-60
"
                  role="img"
                >
                  {chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{
                          top: 10,
                          right: 12,
                          left: -20,
                          bottom: 0,
                        }}
                      >
                        <defs>
                          <linearGradient id="perPurokTrendFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#0284C7" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>

                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />

                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          tickFormatter={(value) => formatConsumption(value)}
                          width={44}
                        />

                        <Tooltip content={<ChartTooltip hideConnectedPrediction unit="" valueFormatter={(value) => `${formatConsumption(value)} m³`} />} cursor={{ stroke: "#bae6fd" }} />

                        <Legend wrapperStyle={{ fontSize: 12 }} />

                        <Area
                          type="monotone"
                          dataKey="consumption"
                          name="Historical"
                          stroke="#0284C7"
                          strokeWidth={2.5}
                          fill="url(#perPurokTrendFill)"
                          dot={{ r: 3, fill: "#0284C7", stroke: "#ffffff", strokeWidth: 2 }}
                          activeDot={{ r: 5, fill: "#0284C7", stroke: "#ffffff", strokeWidth: 2 }}
                        />

                        <Line
                          type="monotone"
                          dataKey="predicted"
                          name="Prediction"
                          stroke="#0B2B40"
                          strokeWidth={2.5}
                          strokeDasharray="8 5"
                          dot={{ r: 4, fill: "#ffffff", stroke: "#0B2B40", strokeWidth: 2 }}
                          activeDot={{ r: 6, fill: "#0B2B40", stroke: "#ffffff", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                  {chartData.length === 0 && (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center">
                      <p className="text-sm text-slate-500">No consumption history is available for {purok}.</p>
                    </div>
                  )}
                </div>
                {chartData.length > 0 && (
                  <p className="sr-only">
                    {purok} chart showing recorded consumption as a solid teal line and prediction as a dashed navy line.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default PerPurokConsumptionTrend;
