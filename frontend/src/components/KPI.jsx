import { Minus, MoreHorizontal, TrendingDown, TrendingUp } from "lucide-react";

const supportingToneStyles = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  negative: "bg-red-50 text-red-700 ring-red-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  water: "bg-water-50 text-water-700 ring-water-200",
};

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Minus,
};

const monthNames = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const descriptionHighlightPattern = new RegExp(
  `((?:${monthNames})\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\s+(?:${monthNames})(?:\\s+\\d{4})?|\\d{4}-\\d{2}-\\d{2}|(?:[+-]?₱\\s*)?(?:\\d{1,2}:\\d{2}\\s?(?:AM|PM)?|[+-]?\\d[\\d,]*(?:\\.\\d+)?)(?:\\s?(?:%|m³|m3|liters?|L))?|\\b(?:increase(?:d|s)?|increasing|higher|grew|growth|gained|decrease(?:d|s)?|decreasing|lower|declined?|dropped?)\\b)`,
  "gi",
);
const positiveTrendPattern = /\b(increase(?:d|s)?|increasing|higher|more|above|grew|growth|gained|up)\b/i;
const negativeTrendPattern = /\b(decrease(?:d|s)?|decreasing|lower|less|below|declined?|dropped?|down)\b/i;

function descriptionTone(description, match, index) {
  const context = description.slice(Math.max(0, index - 28), index + match.length + 28);
  if (match.trim().startsWith("+") || positiveTrendPattern.test(match) || positiveTrendPattern.test(context)) return "positive";
  if (match.trim().startsWith("-") || negativeTrendPattern.test(match) || negativeTrendPattern.test(context)) return "negative";
  return "water";
}

function DescriptionText({ children }) {
  if (typeof children !== "string") return children;

  const matches = [...children.matchAll(descriptionHighlightPattern)];
  if (!matches.length) return children;

  const parts = [];
  let cursor = 0;
  matches.forEach((match) => {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(children.slice(cursor, index));
    const tone = descriptionTone(children, match[0], index);
    parts.push(
      <strong
        className={`mx-0.5 inline-flex rounded-full px-2 py-0.5 font-mono font-bold tabular-nums ring-1 ring-inset ${supportingToneStyles[tone]}`}
        key={`${index}-${match[0]}`}
      >
        {match[0]}
      </strong>,
    );
    cursor = index + match[0].length;
  });
  if (cursor < children.length) parts.push(children.slice(cursor));
  return parts;
}

/** Shared responsive KPI card for summary grids across WaterWise. */
export default function KPI({
  cardTestId,
  className = "",
  compact = false,
  description,
  descriptionHighlight,
  descriptionHighlightTestId,
  descriptionIcon: DescriptionIcon,
  descriptionTone = "water",
  headerAction,
  icon: Icon,
  menuLabel,
  onMenu,
  title,
  showTrendBadge = true,
  trend,
  trendBelow = false,
  trendDirection = "neutral",
  trendTone = "neutral",
  unit,
  value,
  valueTestId,
}) {
  const TrendIcon = trendIcons[trendDirection] ?? Minus;
  const supportingValue = trendBelow ? descriptionHighlight : (descriptionHighlight ?? trend);
  const SupportingIcon = DescriptionIcon ?? (trend ? TrendIcon : null);
  const resolvedTone = descriptionHighlight
    ? descriptionTone
    : trendTone === "neutral"
      ? trendDirection === "up"
        ? "positive"
        : trendDirection === "down"
          ? "negative"
          : "neutral"
      : trendTone;
  const trendBadgeTone = trendTone === "neutral"
    ? trendDirection === "up"
      ? "positive"
      : trendDirection === "down"
        ? "negative"
        : "neutral"
    : trendTone;
  const trendBadge = showTrendBadge && trend ? (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset sm:px-2 sm:py-1 sm:text-xs ${supportingToneStyles[trendBadgeTone] ?? supportingToneStyles.water}`}>
      {trendDirection === "up" ? <TrendingUp aria-hidden="true" className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" /> : trendDirection === "down" ? <TrendingDown aria-hidden="true" className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" /> : null}
      <span className="truncate">{trend}</span>
    </span>
  ) : null;

  return (
    <article className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-card ${compact ? "p-3" : "p-3 sm:p-4"} ${className}`.trim()} data-testid={cardTestId}>
      <div className={`flex min-w-0 flex-wrap items-center ${compact ? "gap-2 sm:gap-2.5" : "gap-2 sm:gap-2.5"}`}>
        {Icon ? (
          <span className={`flex shrink-0 items-center justify-center rounded-lg bg-water-50 text-water-700 ${compact ? "h-8 w-8 sm:h-9 sm:w-9" : "h-8 w-8 sm:h-9 sm:w-9"}`}>
            <Icon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
        ) : null}
        <h2 className="min-w-0 flex-1 text-xs font-bold leading-4 text-slate-600 sm:text-[13px]">
          {title}
        </h2>
        {!trendBelow && trendBadge}
        {headerAction}
        {onMenu ? (
          <button
            aria-label={menuLabel ?? `More options for ${title}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-500 focus-visible:ring-offset-2"
            onClick={onMenu}
            type="button"
          >
            <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <p className={`min-w-0 overflow-hidden font-sans font-extrabold leading-tight tracking-tight text-navy-900 [overflow-wrap:anywhere] tabular-nums ${compact ? "mt-2 text-[clamp(1.05rem,4.5vw,1.25rem)] sm:mt-2 sm:text-2xl" : "mt-2 text-[clamp(1.05rem,4.5vw,1.25rem)] sm:mt-3 sm:text-2xl"}`} data-testid={valueTestId}>
        {value}
        {unit ? <span className="ml-1 text-[10px] font-bold text-slate-500 sm:text-[13px]">{unit}</span> : null}
      </p>

      {(supportingValue || description || (trendBelow && trendBadge)) ? (
        <div className={`flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] leading-4 sm:text-xs ${compact ? "pt-1.5 sm:pt-2" : "pt-2 sm:pt-2.5"}`}>
          {trendBelow && trendBadge}
          {supportingValue ? (
            <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 font-bold ring-1 ring-inset sm:px-2 sm:py-1 ${supportingToneStyles[resolvedTone] ?? supportingToneStyles.water}`}>
              {SupportingIcon ? <SupportingIcon aria-hidden="true" className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" /> : null}
              <span className="truncate capitalize" data-testid={descriptionHighlightTestId}>{supportingValue}</span>
            </span>
          ) : null}
          {description ? (
            <span className={`min-w-0 font-medium text-slate-500 ${supportingValue ? "hidden sm:inline" : ""}`}>
              <DescriptionText>{description}</DescriptionText>
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
