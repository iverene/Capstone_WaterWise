import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  Lightbulb,
  RefreshCw,
} from "lucide-react";

import { isCanceledRequest } from "../services/apiClient";
import {
  fetchAllPuroksMonthlyHistory,
  fetchAllPuroksYearlyHistory,
  fetchConsumptionRanking,
  fetchMonthlyHistory,
  fetchYearlyHistory,
} from "../services/consumptionAPI";
import { fetchAllRecommendations } from "../services/recommendationAPI";
import { getMonthlyBaselineStatus, getYearlyBaselineStatus } from "../utils/baselineStatus";
import { hasDismissedAnalyticsBaselineWarning, markAnalyticsBaselineWarningDismissed } from "../utils/analyticsBaselineToastSession";
import { useToast } from "./Toast";
import LoadingSkeleton from "./LoadingSkeleton";

const EMPTY_RECOMMENDATIONS = {
  overallMonthly: null,
  overallYearly: null,
  allPuroksMonthly: [],
  allPuroksYearly: [],
};

function RecommendationDetails({ recommendation, summary }) {
  const action = recommendation?.recommendations?.[0];
  if (!action) {
    return (
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
        {summary ?? "No recommendations are available."}
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h5 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
        <Lightbulb aria-hidden="true" className="h-4 w-4 shrink-0" />
        {action.title || "Recommended action"}
      </h5>
      <p className="mt-1 text-sm leading-6 text-emerald-800">
        {action.description}
      </p>
    </div>
  );
}

const extractHistoryList = (response) => {
  const data = response?.data?.data ?? response?.data ?? response ?? [];
  if (Array.isArray(data)) return data;
  return (
    data?.allPuroksMonthly ??
    data?.allPuroksYearly ??
    data?.history ??
    data?.data ??
    []
  );
};

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

const getHistoricalArray = (entry) => {
  if (Array.isArray(entry?.historical)) return entry.historical;
  if (Array.isArray(entry?.monthly)) return entry.monthly;
  if (Array.isArray(entry?.yearly)) return entry.yearly;
  return [];
};

const toConsumptionNumber = (record) => {
  const value = Number(
    record?.consumption ??
      record?.totalConsumption ??
      record?.total_consumption ??
      record?.value ??
      0,
  );
  return Number.isFinite(value) ? value : 0;
};

const monthIndexOf = (month) => {
  const normalized = String(month ?? "").trim().toLowerCase();
  if (!normalized) return -1;
  const fullIndex = MONTH_ORDER.indexOf(normalized);
  if (fullIndex >= 0) return fullIndex;
  return MONTH_ORDER.findIndex((name) => normalized.startsWith(name.slice(0, 3)));
};

// Display-only: latest recorded month (e.g. September), not a YTD sum.
// Does not change what the recommendation AI engine collects.
const getLatestMonthlyValue = (entry) => {
  const historical = getHistoricalArray(entry);
  if (historical.length === 0) return 0;
  let latest = historical[historical.length - 1];
  let latestIndex = -2;
  historical.forEach((record) => {
    const index = monthIndexOf(record?.month ?? record?.label);
    if (index > latestIndex) {
      latestIndex = index;
      latest = record;
    }
  });
  return toConsumptionNumber(latest);
};

// Display-only: latest recorded year (e.g. this year), not an all-years sum.
// Does not change what the recommendation AI engine collects.
const getLatestYearlyValue = (entry) => {
  const historical = getHistoricalArray(entry);
  if (historical.length === 0) return 0;
  let latest = historical[historical.length - 1];
  let latestYear = Number.NEGATIVE_INFINITY;
  historical.forEach((record) => {
    const year = Number(record?.year);
    if (Number.isFinite(year) && year > latestYear) {
      latestYear = year;
      latest = record;
    }
  });
  return toConsumptionNumber(latest);
};

const buildConsumptionMap = (response, period) => {
  const list = extractHistoryList(response);
  const source = Array.isArray(list) ? list : [];
  const map = {};
  source.forEach((entry) => {
    const name = entry?.purok ?? entry?.name;
    if (name == null || String(name).trim() === "") return;
    map[String(name)] =
      period === "monthly" ? getLatestMonthlyValue(entry) : getLatestYearlyValue(entry);
  });
  return map;
};

export default function RecommendationSection() {
  const [recommendations, setRecommendations] = useState(
    EMPTY_RECOMMENDATIONS,
  );
  const [rankEntries, setRankEntries] = useState([]);
  const [periodConsumption, setPeriodConsumption] = useState({
    monthly: {},
    yearly: {},
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");
  const [baselineMonthlyCount, setBaselineMonthlyCount] = useState(null);
  const [baselineYearlyCount, setBaselineYearlyCount] = useState(null);
  const [baselineMonthlyHistory, setBaselineMonthlyHistory] = useState([]);
  const [baselineYearlyHistory, setBaselineYearlyHistory] = useState([]);
  const toast = useToast();
  const baselineToastId = useRef(null);
  const baselineToastMessage = useRef(null);
  const [expandedPurok, setExpandedPurok] = useState(null);

  const loadRecommendations = useCallback(async (signal) => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [
        recommendationResponse,
        rankingResponse,
        monthlyHistoryResponse,
        yearlyHistoryResponse,
        overallMonthlyResponse,
        overallYearlyResponse,
      ] = await Promise.all([
        fetchAllRecommendations({ signal }),
        fetchConsumptionRanking({ signal }).catch(() => null),
        fetchAllPuroksMonthlyHistory().catch(() => null),
        fetchAllPuroksYearlyHistory().catch(() => null),
        fetchMonthlyHistory().catch(() => null),
        fetchYearlyHistory().catch(() => null),
      ]);
      setRecommendations({
        ...EMPTY_RECOMMENDATIONS,
        ...(recommendationResponse?.data ?? {}),
      });
      const rankingData = rankingResponse?.data?.ranking ?? rankingResponse?.data ?? rankingResponse ?? [];
      setRankEntries(
        Array.isArray(rankingData)
          ? rankingData.map((item) => ({
            name: String(item?.purok ?? ""),
            value: Number(item?.consumption ?? item?.value ?? 0),
          }))
          : [],
      );
      if (!signal?.aborted) {
        setPeriodConsumption({
          monthly: buildConsumptionMap(monthlyHistoryResponse, "monthly"),
          yearly: buildConsumptionMap(yearlyHistoryResponse, "yearly"),
        });
        const overallMonthlyData = overallMonthlyResponse?.data?.data ?? overallMonthlyResponse?.data ?? overallMonthlyResponse;
        const overallMonthlyList = Array.isArray(overallMonthlyData) ? overallMonthlyData : (overallMonthlyData?.monthlyHistory ?? overallMonthlyData?.history ?? []);
        setBaselineMonthlyCount(overallMonthlyList.length);
        setBaselineMonthlyHistory(overallMonthlyList);
        const overallYearlyData = overallYearlyResponse?.data?.data ?? overallYearlyResponse?.data ?? overallYearlyResponse;
        const overallYearlyList = Array.isArray(overallYearlyData) ? overallYearlyData : (overallYearlyData?.yearlyHistory ?? overallYearlyData?.history ?? []);
        setBaselineYearlyCount(overallYearlyList.length);
        setBaselineYearlyHistory(overallYearlyList);
      }
    } catch (error) {
      if (!isCanceledRequest(error)) {
        setRecommendations(EMPTY_RECOMMENDATIONS);
        setRankEntries([]);
        setPeriodConsumption({ monthly: {}, yearly: {} });
        setErrorMessage(
          error.response?.data?.message ??
            "Unable to load recommendations.",
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        loadRecommendations(controller.signal);
      }
    });
    return () => controller.abort();
  }, [loadRecommendations]);

  const overall = period === "monthly"
    ? recommendations.overallMonthly
    : recommendations.overallYearly;
  const baselineStatus = period === "monthly"
    ? (baselineMonthlyCount === null ? null : getMonthlyBaselineStatus(baselineMonthlyCount, baselineMonthlyHistory, "recommendation"))
    : (baselineYearlyCount === null ? null : getYearlyBaselineStatus(baselineYearlyCount, baselineYearlyHistory, "recommendation"));

  useEffect(() => {
    if (loading || errorMessage || !baselineStatus || baselineStatus.isComplete) return;
    if (hasDismissedAnalyticsBaselineWarning("prescriptive")) return;
    if (baselineToastId.current) {
      // Still on Prescriptive (period switch, refresh): update the message
      // instead of popping the toast a second time.
      if (baselineToastMessage.current === baselineStatus.message) return;
      baselineToastMessage.current = baselineStatus.message;
      toast.update(baselineToastId.current, { message: baselineStatus.message });
      return;
    }
    const toastId = toast.info("Prescriptive baseline information", baselineStatus.message, {
      key: "prescriptive-baseline",
      duration: 0,
      wide: true,
      actions: [{
        label: "Dismiss",
        onClick: () => {
          markAnalyticsBaselineWarningDismissed("prescriptive");
          toast.dismiss(toastId);
        },
      }],
    });
    baselineToastId.current = toastId;
    baselineToastMessage.current = baselineStatus.message;
  }, [loading, errorMessage, period, baselineStatus, toast]);

  // The toast belongs to Prescriptive only: leaving the tab or the page hides
  // it, and revisiting brings it back until the admin dismisses it.
  useEffect(() => () => {
    if (!baselineToastId.current) return;
    toast.dismiss(baselineToastId.current);
    baselineToastId.current = null;
    baselineToastMessage.current = null;
  }, [toast]);

  const purokItems = useMemo(() => {
    const source = period === "monthly"
      ? recommendations.allPuroksMonthly
      : recommendations.allPuroksYearly;
    const names = [...new Set(
      (source ?? []).map((item) => item?.purok).filter((name) => name != null && String(name).trim() !== ""),
    )];
    const consumptionMap = period === "monthly"
      ? periodConsumption.monthly ?? {}
      : periodConsumption.yearly ?? {};
    const hasPeriodValues = names.some((name) =>
      Object.prototype.hasOwnProperty.call(consumptionMap, name),
    );
    const fallbackRankOf = (name) => {
      const index = rankEntries.findIndex((entry) => entry.name === name);
      return index >= 0 ? index : Number.POSITIVE_INFINITY;
    };
    const valueOf = (name) => {
      if (Object.prototype.hasOwnProperty.call(consumptionMap, name)) {
        const value = Number(consumptionMap[name]);
        return Number.isFinite(value) ? value : 0;
      }
      return rankEntries.find((entry) => entry.name === name)?.value ?? null;
    };
    if (hasPeriodValues) {
      names.sort((a, b) => {
        const valueA = valueOf(a) ?? Number.NEGATIVE_INFINITY;
        const valueB = valueOf(b) ?? Number.NEGATIVE_INFINITY;
        if (valueB !== valueA) return valueB - valueA;
        return String(a).localeCompare(String(b));
      });
      return names.map((name, index) => ({
        purok: name,
        rank: index,
        result: source.find((item) => item?.purok === name) ?? null,
        value: valueOf(name),
      }));
    }
    names.sort((a, b) => fallbackRankOf(a) - fallbackRankOf(b) || String(a).localeCompare(String(b)));
    return names.map((name) => ({
      purok: name,
      rank: fallbackRankOf(name),
      result: source.find((item) => item?.purok === name) ?? null,
      value: valueOf(name),
    }));
  }, [period, periodConsumption, rankEntries, recommendations]);

  return (
    <section
      data-testid="recommendation-section"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <BrainCircuit aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-bold">Human review required</p>
          <p className="mt-1 leading-6 text-emerald-800">
            Recommendations support official decisions; they do not automatically change service operations.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">
            AI-assisted decision support
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-navy-900">
            Recommended Actions
          </h2>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div aria-label="Recommendation period" className="inline-flex rounded-xl bg-slate-100 p-1" role="group">
            {["monthly", "yearly"].map((option) => (
              <button
                aria-pressed={period === option}
                className={`rounded-xl px-4 py-2 text-xs font-bold capitalize transition ${period === option ? "bg-white text-water-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                key={option}
                onClick={() => { setPeriod(option); setExpandedPurok(null); }}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          <button
            aria-label="Refresh analysis"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 disabled:opacity-60"
            disabled={loading}
            onClick={() => loadRecommendations()}
            title="Refresh analysis"
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && (
        <LoadingSkeleton count={3} label="Loading recommendations" variant="list" />
      )}

      {!loading && errorMessage && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <p className="font-semibold">{errorMessage}</p>
          <button className="mt-3 min-h-11 rounded-xl bg-white px-4 font-bold hover:bg-red-100" onClick={() => loadRecommendations()} type="button">
            Try again
          </button>
        </div>
      )}

      {!loading && !errorMessage && (
        <div className="mt-6 space-y-6">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-navy-900">
              {period === "monthly" ? "Overall Monthly" : "Overall Yearly"}
            </h3>
            <div className="mt-3">
              <RecommendationDetails recommendation={overall} summary={overall?.summary} />
            </div>
          </article>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 font-bold text-navy-900">Puroks Ranked by Consumption</h3>
            {purokItems.length > 0 ? (
              <ul className="divide-y divide-slate-100 border-y border-slate-100">
                {purokItems.map((item) => {
                  const expanded = expandedPurok === item.purok;
                  return (
                    <li key={item.purok}>
                      <button
                        aria-expanded={expanded}
                        className="flex min-h-16 w-full items-center gap-3 px-1 py-1 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-water-600"
                        onClick={() => setExpandedPurok(expanded ? null : item.purok)}
                        type="button"
                      >
                        {Number.isFinite(item.rank) ? (
                          <span aria-hidden="true" className="w-7 shrink-0 font-mono text-xs font-extrabold tabular-nums text-slate-400">
                            {item.rank + 1}.
                          </span>
                        ) : (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-900">{item.purok}</span>
                        {item.value !== null && (
                          <span className="shrink-0 font-mono text-sm font-extrabold tabular-nums text-navy-900">
                            {item.value.toLocaleString("en-PH", { maximumFractionDigits: 1 })}
                            <span className="ml-1 text-[10px] font-bold text-slate-500">m³</span>
                          </span>
                        )}
                        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                      {expanded && (
                        <div className="px-1 pb-4">
                          <RecommendationDetails recommendation={item.result} summary={item.result?.summary} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                No purok recommendations are available.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
