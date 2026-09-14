import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchAllPuroksMonthlyPrediction,
  fetchAllPuroksYearlyPrediction,
} from "../services/consumptionAPI";
import ChartTooltip from "./ChartTooltip";
import LoadingSkeleton from "./LoadingSkeleton";

const DEFAULT_PUROKS = Array.from({ length: 6 }, (_, index) => `Purok ${index + 1}`);

export default function AdminPerPurokConsumptionCard() {
  const [period, setPeriod] = useState("Monthly");
  const [puroks, setPuroks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPredictions = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response =
        period === "Monthly"
          ? await fetchAllPuroksMonthlyPrediction()
          : await fetchAllPuroksYearlyPrediction();
      const data = response?.data ?? response;
      const predictions = data?.predictions ?? data?.puroks ?? data?.data ?? data ?? [];
      setPuroks(Array.isArray(predictions) ? predictions : []);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError?.message ??
          "Unable to load purok forecasts.",
      );
      setPuroks([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    queueMicrotask(loadPredictions);
  }, [loadPredictions]);

  const forecastRecords = useMemo(
    () =>
      DEFAULT_PUROKS.map((purokName) => {
        const record =
          puroks.find(
            (item) => item?.name === purokName || item?.purok === purokName,
          ) ?? {};
        const value = Number(
          record?.value ??
            record?.prediction ??
            record?.predictedConsumption ??
            record?.predicted_consumption ??
            record?.forecast ??
            0,
        );
        return { purok: purokName, value: Number.isFinite(value) ? value : 0 };
      }),
    [puroks],
  );
  const hasForecast = forecastRecords.some((record) => record.value > 0);

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      data-testid="purok-consumption-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[15px] font-extrabold leading-snug tracking-tight text-navy-900 line-clamp-2">
          Predicted Consumption by Purok
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <div
            aria-label="Purok forecast period"
            className="inline-flex rounded-xl bg-slate-100 p-1"
            role="group"
          >
            {["Monthly", "Yearly"].map((option) => (
              <button
                aria-pressed={period === option}
                className={`min-h-9 rounded-lg px-3 text-xs font-bold transition-colors ${
                  period === option
                    ? "bg-white text-water-700 shadow-sm"
                    : "text-slate-600 hover:text-navy-900"
                }`}
                key={option}
                onClick={() => setPeriod(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          <button
            aria-label="Refresh purok forecasts"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 disabled:opacity-50"
            disabled={loading}
            onClick={loadPredictions}
            title="Refresh purok forecasts"
            type="button"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton className="mt-4" count={3} label="Loading purok forecasts" variant="list" />
      ) : error ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span className="flex items-start gap-2 font-semibold">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </span>
          <button className="min-h-11 rounded-xl bg-white px-3 font-bold hover:bg-red-100" onClick={loadPredictions} type="button">
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 h-60" aria-label={`Predicted ${period.toLowerCase()} consumption by purok chart`} role="img">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecastRecords} layout="vertical" margin={{ bottom: 0, left: 0, right: 40, top: 0 }}>
                <XAxis axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value) => Number(value ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="purok" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} type="category" width={76} />
                <Tooltip content={<ChartTooltip unit="" valueFormatter={(value) => `${Number(value ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} m³`} />} cursor={{ fill: "#f1f5f9" }} />
                <Bar background={{ fill: "#f1f5f9", radius: 7 }} barSize={14} dataKey="value" fill="#0284c7" name="Forecast" radius={[7, 7, 7, 7]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {hasForecast ? null : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No positive {period.toLowerCase()} purok forecasts are available yet.
            </p>
          )}
        </>
      )}
    </section>
  );
}
