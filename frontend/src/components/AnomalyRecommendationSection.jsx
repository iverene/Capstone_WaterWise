import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Lightbulb,
  RefreshCw,
} from "lucide-react";

import { generateAllAnomalies } from "../services/anomalyAPI";
import { isCanceledRequest } from "../services/apiClient";
import { fetchAllRecommendations } from "../services/recommendationAPI";
import AnomalyAlertCard from "./AnomalyAlertCard";
import LoadingSkeleton from "./LoadingSkeleton";

const EMPTY_ANALYSIS = {
  overallMonthly: null,
  overallYearly: null,
  allPuroksMonthly: [],
  allPuroksYearly: [],
};

const EMPTY_RECOMMENDATIONS = {
  overallMonthly: null,
  overallYearly: null,
  allPuroksMonthly: [],
  allPuroksYearly: [],
};

function AnomalyGroup({ items, title }) {
  return (
    <div>
      <h3 className="mb-3 font-bold text-navy-900">{title}</h3>
      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <AnomalyAlertCard
              anomalies={item.anomalies}
              area={item.purok}
              key={item.purok}
              message={item.summary}
              riskScore={item.riskScore}
              severity={item.status}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No purok consumption history is available for this analysis.
        </p>
      )}
    </div>
  );
}

function RecommendationCard({ area, result }) {
  const items = result?.recommendations ?? [];
  const recommendation = items[0];

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-bold text-navy-900">{area}</h4>
      <div className="mt-4">
        {recommendation ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h5 className="text-sm font-bold text-emerald-900">
              {recommendation.title || "Recommended action"}
            </h5>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              {recommendation.description}
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
            {result?.summary ?? "No recommendations are available."}
          </p>
        )}
      </div>
    </article>
  );
}

function RecommendationGroup({ items, title }) {
  return (
    <div>
      <h3 className="mb-3 font-bold text-navy-900">{title}</h3>
      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <RecommendationCard
              area={item.purok}
              key={item.purok}
              result={item}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No purok consumption history is available for recommendations.
        </p>
      )}
    </div>
  );
}

export default function AnomalyRecommendationSection() {
  const [analysis, setAnalysis] = useState(EMPTY_ANALYSIS);
  const [recommendations, setRecommendations] = useState(
    EMPTY_RECOMMENDATIONS,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  // BACKUP (anomalies hidden): original default was "anomalies". Restore to "anomalies" to bring back the Anomalies tab.
  const [view, setView] = useState("recommendations");

  const loadAnalysis = useCallback(async (signal) => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [anomalyResponse, recommendationResponse] = await Promise.all([
        generateAllAnomalies({ signal }),
        fetchAllRecommendations({ signal }),
      ]);
      setAnalysis({ ...EMPTY_ANALYSIS, ...(anomalyResponse?.data ?? {}) });
      setRecommendations({
        ...EMPTY_RECOMMENDATIONS,
        ...(recommendationResponse?.data ?? {}),
      });
    } catch (error) {
      if (!isCanceledRequest(error)) {
        setAnalysis(EMPTY_ANALYSIS);
        setRecommendations(EMPTY_RECOMMENDATIONS);
        setErrorMessage(
          error.response?.data?.message ??
            "Unable to load Gemini anomaly analysis and recommendations.",
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
        loadAnalysis(controller.signal);
      }
    });
    return () => controller.abort();
  }, [loadAnalysis]);

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
      data-testid="anomaly-recommendation-section"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">
            AI-assisted decision support
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-navy-900">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Consumption review
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {/* BACKUP (anomalies hidden) original text: "Detects unusual usage and provides data-based administrative actions." */}
            Provides data-based administrative actions.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 disabled:opacity-60"
          disabled={loading}
          onClick={() => loadAnalysis()}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh analysis
        </button>
      </div>

      {/* BACKUP (anomalies hidden): toggle kept with a single option so setView stays used. Restore the anomalies option below to bring back the tab switch. */}
      <div aria-label="Decision support view" className="mb-6 inline-flex rounded-xl bg-slate-100 p-1" role="group">
        {[
          // BACKUP (anomalies hidden): { id: "anomalies", label: "Anomalies" },
          { id: "recommendations", label: "Recommended actions" },
        ].map((option) => (
          <button
            aria-pressed={view === option.id}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition-colors ${
              view === option.id
                ? "bg-white text-water-700 shadow-sm"
                : "text-slate-600 hover:text-navy-900"
            }`}
            key={option.id}
            onClick={() => setView(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && (
        <LoadingSkeleton count={3} label="Analyzing consumption history" variant="list" />
      )}

      {!loading && errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <p className="font-semibold">{errorMessage}</p>
          <button className="mt-3 min-h-11 rounded-xl bg-white px-4 font-bold hover:bg-red-100" onClick={() => loadAnalysis()} type="button">
            Try again
          </button>
        </div>
      )}

      {!loading && !errorMessage && (
        <div className="space-y-7">
          {/* BACKUP (anomalies hidden): block below is intact but unreachable while the Anomalies toggle stays hidden. Restore the toggle option + default view to re-enable. */}
          {view === "anomalies" && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <AnomalyAlertCard
                  anomalies={analysis.overallMonthly?.anomalies}
                  area="Overall monthly"
                  message={analysis.overallMonthly?.summary}
                  riskScore={analysis.overallMonthly?.riskScore}
                  severity={analysis.overallMonthly?.status}
                />
                <AnomalyAlertCard
                  anomalies={analysis.overallYearly?.anomalies}
                  area="Overall yearly"
                  message={analysis.overallYearly?.summary}
                  riskScore={analysis.overallYearly?.riskScore}
                  severity={analysis.overallYearly?.status}
                />
              </div>
              <AnomalyGroup items={analysis.allPuroksMonthly} title="Monthly anomaly status per purok" />
              <AnomalyGroup items={analysis.allPuroksYearly} title="Yearly anomaly status per purok" />
            </>
          )}

          {view === "recommendations" && (
            <>
              <div>
                <h3 className="flex items-center gap-2 text-lg font-extrabold text-navy-900">
                  <Lightbulb aria-hidden="true" className="h-5 w-5 text-emerald-600" />
                  Recommended actions
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Practical actions generated from recorded consumption trends.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <RecommendationCard area="Overall monthly" result={recommendations.overallMonthly} />
                <RecommendationCard area="Overall yearly" result={recommendations.overallYearly} />
              </div>
              <RecommendationGroup items={recommendations.allPuroksMonthly} title="Monthly recommendations per purok" />
              <RecommendationGroup items={recommendations.allPuroksYearly} title="Yearly recommendations per purok" />
            </>
          )}
        </div>
      )}
    </section>
  );
}
