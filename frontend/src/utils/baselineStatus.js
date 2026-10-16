export const MIN_BASELINE_MONTHS = 6;
export const MIN_BASELINE_YEARS = 2;

const toCount = (value) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

export function getMonthlyBaselineStatus(count, history = [], context = "prediction") {
  const monthlyCount = Array.isArray(history) && history.length > 0 ? history.length : toCount(count);
  const isComplete = monthlyCount >= MIN_BASELINE_MONTHS;
  if (isComplete) return { count: monthlyCount, isComplete, message: null, title: null };
  const missing = MIN_BASELINE_MONTHS - monthlyCount;
  const scopeNoun = context === "recommendation" ? "recommendation" : "monthly forecast";
  return {
    count: monthlyCount,
    isComplete,
    title: context === "recommendation" ? "Recommendation — low confidence" : "Monthly forecast — low confidence",
    message: monthlyCount === 0
      ? `No monthly history recorded yet. ${context === "recommendation" ? "Recommendations" : "Monthly forecasts"} need ${MIN_BASELINE_MONTHS} months of readings before they are reliable.`
      : `Only ${monthlyCount} of the required ${MIN_BASELINE_MONTHS} months have recorded consumption data. Add at least ${missing} more month${missing === 1 ? "" : "s"} of valid records to improve ${scopeNoun} reliability.`,
  };
}

const MONTH_SHORT_LABELS = {
  january: "Jan",
  february: "Feb",
  march: "Mar",
  april: "Apr",
  may: "May",
  june: "Jun",
  july: "Jul",
  august: "Aug",
  september: "Sep",
  october: "Oct",
  november: "Nov",
  december: "Dec",
};

export function monthShortLabels(history) {
  return (Array.isArray(history) ? history : [])
    .map((item) => {
      const raw = String(item?.month ?? item?.label ?? "").trim().toLowerCase();
      if (MONTH_SHORT_LABELS[raw]) return MONTH_SHORT_LABELS[raw];
      return String(item?.month ?? item?.label ?? "").trim();
    })
    .filter(Boolean);
}

export function getHistoricalBaselineWarning(monthlyCount, history = []) {
  const count = toCount(monthlyCount);
  if (count === 0) return null;
  const records = Math.floor(count / 6);
  if (records >= 2) return null;
  const labels = monthShortLabels(history);
  const recorded = labels.length > 0 ? ` (${labels.join(", ")})` : "";
  if (records < 1) {
    const missing = MIN_BASELINE_MONTHS - count;
    return {
      title: "Historical baseline not completed",
      message: `Only ${count} of ${MIN_BASELINE_MONTHS} months recorded${recorded}. Add ${missing} more month${missing === 1 ? "" : "s"} to complete 1 historical record.`,
    };
  }
  const missing = MIN_BASELINE_MONTHS * 2 - count;
  return {
    title: "1 historical baseline is not enough",
    message: `${count} months with records${recorded}. Add ${missing} more month${missing === 1 ? "" : "s"} to complete 2 historical records.`,
  };
}
export function getYearlyBaselineStatus(count, history = [], context = "prediction") {
  const yearlyCount = Array.isArray(history) && history.length > 0 ? history.length : toCount(count);
  const isComplete = yearlyCount >= MIN_BASELINE_YEARS;
  if (isComplete) return { count: yearlyCount, isComplete, message: null, title: null };
  const scopeNoun = context === "recommendation" ? "recommendation" : "yearly forecast";
  return {
    count: yearlyCount,
    isComplete,
    title: context === "recommendation" ? "Recommendation — low confidence" : "Yearly forecast — low confidence",
    message: yearlyCount === 0
      ? `No yearly history recorded yet. ${context === "recommendation" ? "Yearly recommendations" : "Yearly forecasts"} need ${MIN_BASELINE_YEARS} years of readings before they are reliable.`
      : `Only ${yearlyCount} of the required ${MIN_BASELINE_YEARS} years has recorded data. Add historical records from another year to improve ${scopeNoun} reliability.`,
  };
}
