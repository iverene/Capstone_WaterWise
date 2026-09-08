import { AlertCircle, RefreshCw } from "lucide-react";
import KPI from "./KPI";
import LoadingSkeleton from "./LoadingSkeleton";

function RefreshButton({ label, loading, onRefresh }) {
  return (
    <button
      aria-label={`Refresh ${label.toLowerCase()}`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 disabled:opacity-50"
      disabled={loading}
      onClick={onRefresh}
      title={`Refresh ${label.toLowerCase()}`}
      type="button"
    >
      <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}

export default function AnalyticsMetricCard({
  compact = false,
  description,
  error,
  icon: Icon,
  label,
  loading,
  onRefresh,
  testId,
  unit = "m³",
  value,
}) {
  const heightClass = compact ? "min-h-32 sm:min-h-44" : "min-h-40 sm:min-h-52";
  const refreshButton = (
    <RefreshButton label={label} loading={loading} onRefresh={onRefresh} />
  );

  if (!loading && !error) {
    return (
      <KPI
        cardTestId={testId}
        className={heightClass}
        compact={compact}
        description={description}
        headerAction={refreshButton}
        icon={Icon}
        title={label}
        unit={unit}
        value={value}
      />
    );
  }

  return (
    <article
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-navy-900 shadow-card ${heightClass}`}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-water-100 text-water-700">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        {refreshButton}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-water-700">
        {label}
      </p>

      {loading ? (
        <LoadingSkeleton
          className="mt-3"
          label={`Loading ${label.toLowerCase()}`}
          variant="inline"
        />
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-start gap-3 text-sm text-red-700" role="alert">
          <span className="flex items-start gap-2">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-5">{error}</span>
          </span>
          <button
            className="min-h-11 rounded-xl bg-red-50 px-3 text-sm font-bold text-red-700 hover:bg-red-100"
            onClick={onRefresh}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
    </article>
  );
}
