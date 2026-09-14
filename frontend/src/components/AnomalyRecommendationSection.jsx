import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  Lightbulb,
  RefreshCw,
} from "lucide-react";

import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumptionRanking } from "../services/consumptionAPI";
import { fetchAllRecommendations } from "../services/recommendationAPI";
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

export default function AnomalyRecommendationSection() {
  const [recommendations, setRecommendations] = useState(
    EMPTY_RECOMMENDATIONS,
  );
  const [rankOrder, setRankOrder] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");
  const [expandedPurok, setExpandedPurok] = useState(null);

  const loadRecommendations = useCallback(async (signal) => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [recommendationResponse, rankingResponse] = await Promise.all([
        fetchAllRecommendations({ signal }),
        fetchConsumptionRanking({ signal }).catch(() => null),
      ]);
      setRecommendations({
        ...EMPTY_RECOMMENDATIONS,
        ...(recommendationResponse?.data ?? {}),
      });
      const rankingData = rankingResponse?.data?.ranking ?? rankingResponse?.data ?? rankingResponse ?? [];
      setRankOrder(
        Array.isArray(rankingData)
          ? rankingData.map((item) => String(item?.purok ?? ""))
          : [],
      );
    } catch (error) {
      if (!isCanceledRequest(error)) {
        setRecommendations(EMPTY_RECOMMENDATIONS);
        setRankOrder([]);
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

  const purokItems = useMemo(() => {
    const source = period === "monthly"
      ? recommendations.allPuroksMonthly
      : recommendations.allPuroksYearly;
    const names = [...new Set(
      (source ?? []).map((item) => item?.purok).filter((name) => name != null && String(name).trim() !== ""),
    )];
    const rankOf = (name) => {
      const index = rankOrder.findIndex((entry) => entry === name);
      return index >= 0 ? index : Number.POSITIVE_INFINITY;
    };
    names.sort((a, b) => rankOf(a) - rankOf(b) || String(a).localeCompare(String(b)));
    return names.map((name) => ({
      purok: name,
      rank: rankOf(name),
      result: source.find((item) => item?.purok === name) ?? null,
    }));
  }, [period, rankOrder, recommendations]);

  return (
    <section
      data-testid="anomaly-recommendation-section"
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
        <div className="flex items-center gap-2">
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

          <div>
            <h3 className="mb-3 font-bold text-navy-900">Ranked Puroks</h3>
            {purokItems.length > 0 ? (
              <ul className="grid gap-2">
                {purokItems.map((item) => {
                  const expanded = expandedPurok === item.purok;
                  return (
                    <li key={item.purok} className="overflow-hidden rounded-xl border border-slate-200">
                      <button
                        aria-expanded={expanded}
                        className="flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-water-600"
                        onClick={() => setExpandedPurok(expanded ? null : item.purok)}
                        type="button"
                      >
                        {Number.isFinite(item.rank) ? (
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-extrabold tabular-nums ${item.rank === 0 ? "bg-water-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                            {item.rank + 1}
                          </span>
                        ) : (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-900">{item.purok}</span>
                        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                      {expanded && (
                        <div className="border-t border-slate-100 p-4">
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
