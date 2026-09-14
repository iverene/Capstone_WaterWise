export const ALL_MONTHS_VALUE = "all";

export const MONTH_OPTIONS = [
  { label: "All months", value: ALL_MONTHS_VALUE },
  { label: "January", value: "january" },
  { label: "February", value: "february" },
  { label: "March", value: "march" },
  { label: "April", value: "april" },
  { label: "May", value: "may" },
  { label: "June", value: "june" },
  { label: "July", value: "july" },
  { label: "August", value: "august" },
  { label: "September", value: "september" },
  { label: "October", value: "october" },
  { label: "November", value: "november" },
  { label: "December", value: "december" },
];

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

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month name, abbreviation, or number → 0-based month index, or -1. */
export function parseMonthIndex(value) {
  const parsed = parseYearMonth(value, null);
  return parsed ? parsed.monthIndex : -1;
}

/**
 * Read a calendar position from the shapes backends actually send:
 * "2026-08", "08/2026", "August 2026", "september", "Sep", 8, "08".
 * Returns { year: number|null, monthIndex } or null.
 */
export function parseYearMonth(value, fallbackYear = null) {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return null;
    if (value >= 1 && value <= 12) return { monthIndex: value - 1, year: fallbackYear };
    if (value >= 0 && value <= 11) return { monthIndex: value, year: fallbackYear };
    if (value >= 1000 && value <= 9999) return null;
    return null;
  }
  const text = String(value).trim();
  if (!text) return null;

  // "2026-08", "2026/08", "2026-8".
  let match = text.match(/^(19|20)\d{2}\s*[-/]\s*(\d{1,2})$/);
  if (match) {
    const year = Number(text.slice(0, 4));
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { monthIndex: month - 1, year };
    return null;
  }
  // "08/2026", "8-2026".
  match = text.match(/^(\d{1,2})\s*[-/]\s*((19|20)\d{2})$/);
  if (match) {
    const month = Number(match[1]);
    if (month >= 1 && month <= 12) return { monthIndex: month - 1, year: Number(match[2]) };
    return null;
  }
  // Month name, optionally followed by a year: "August 2026", "Sep", "september".
  const lowered = text.toLowerCase();
  const nameIndex = MONTH_ORDER.findIndex(
    (name) =>
      lowered === name ||
      lowered === name.slice(0, 3) ||
      name.startsWith(lowered) ||
      lowered.startsWith(`${name.slice(0, 3)} `),
  );
  if (nameIndex >= 0) {
    const yearMatch = text.match(/(19|20)\d{2}/);
    return { monthIndex: nameIndex, year: yearMatch ? Number(yearMatch[0]) : fallbackYear };
  }
  // Bare month number: "8", "08".
  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return { monthIndex: numeric - 1, year: fallbackYear };
  }
  return null;
}

/** Title Case 3-letter label: "Sep". Falls back to the raw value. */
export function shortMonthLabel(value) {
  const index = parseMonthIndex(value);
  if (index >= 0) return MONTH_LABELS[index];
  return String(value ?? "Unknown");
}

/** Current calendar position in Asia/Manila. */
export function manilaCalendar() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  return { year: Number(parts.year), monthIndex: Number(parts.month) - 1 };
}

/**
 * Calendar month buckets: full Jan–Dec of `year`, or the trailing `count`
 * months ending with the current Manila month. Labels are Title Case.
 */
export function monthBuckets({ count = 12, year = null } = {}) {
  if (year) {
    const fullYear = Number(year);
    return MONTH_LABELS.map((label, monthIndex) => ({
      key: `${fullYear}-${String(monthIndex + 1).padStart(2, "0")}`,
      label,
      monthIndex,
      year: fullYear,
    }));
  }
  const { year: currentYear, monthIndex: currentMonth } = manilaCalendar();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(currentYear, currentMonth - (count - 1 - offset), 1));
    const bucketYear = date.getUTCFullYear();
    const bucketMonth = date.getUTCMonth();
    return {
      key: `${bucketYear}-${String(bucketMonth + 1).padStart(2, "0")}`,
      label: MONTH_LABELS[bucketMonth],
      monthIndex: bucketMonth,
      year: bucketYear,
    };
  });
}

/** Trailing calendar years ending with the current Manila year. */
export function yearBuckets(count) {
  const { year } = manilaCalendar();
  return Array.from({ length: count }, (_, offset) => {
    const bucketYear = year - (count - 1 - offset);
    return { key: String(bucketYear), label: String(bucketYear), year: bucketYear };
  });
}

/**
 * Continuous month buckets spanning parsed entries (each {year, monthIndex}).
 * Labels gain a year suffix when the range crosses calendar years.
 */
export function rangeMonthBuckets(parsed) {
  const keys = (parsed ?? [])
    .filter((entry) => entry && Number.isInteger(entry.year) && entry.monthIndex >= 0 && entry.monthIndex <= 11)
    .map((entry) => entry.year * 12 + entry.monthIndex);
  if (!keys.length) return [];
  const min = Math.min(...keys);
  const max = Math.max(...keys);
  const multiYear = Math.floor(min / 12) !== Math.floor(max / 12);
  const buckets = [];
  for (let key = min; key <= max; key += 1) {
    const year = Math.floor(key / 12);
    const monthIndex = key % 12;
    buckets.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      label: multiYear ? `${MONTH_LABELS[monthIndex]} '${String(year).slice(2)}` : MONTH_LABELS[monthIndex],
      monthIndex,
      year,
    });
  }
  return buckets;
}

/** Extract a calendar position from a loosely-shaped history record. */
export function recordYearMonth(record, fallbackYear = null) {
  if (!record) return null;
  const parsed = parseYearMonth(record.month ?? record.monthIndex ?? record.period, null);
  if (!parsed || parsed.monthIndex < 0) return null;
  const year = parsed.year ?? Number(record.year ?? record.Year ?? fallbackYear);
  if (!Number.isInteger(year)) return null;
  return { monthIndex: parsed.monthIndex, year, key: `${year}-${String(parsed.monthIndex + 1).padStart(2, "0")}` };
}

/**
 * Sum `valueOf(record)` into calendar buckets. Buckets with no records keep
 * zero so empty months render as gaps at zero instead of vanishing.
 */
export function fillMonthlyBuckets(records, buckets, valueOf, fallbackYear = null) {
  const currentYear = fallbackYear ?? manilaCalendar().year;
  const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));
  for (const record of records ?? []) {
    const position = recordYearMonth(record, currentYear);
    if (!position || !totals.has(position.key)) continue;
    const amount = Number(valueOf(record));
    totals.set(position.key, totals.get(position.key) + (Number.isFinite(amount) ? amount : 0));
  }
  return buckets.map((bucket) => ({ ...bucket, consumption: totals.get(bucket.key) }));
}

/** Drop trailing all-zero buckets: months/years that never occurred render
 *  as nothing, not as zero. Interior zeros (gaps between real data) stay. */
export function trimTrailingEmpty(buckets) {
  let end = (buckets ?? []).length;
  while (end > 0 && Number(buckets[end - 1]?.consumption ?? 0) === 0) end -= 1;
  return (buckets ?? []).slice(0, end);
}

/** Fill a trailing year range with zeros where records are missing. */
export function fillYearlyBuckets(records, buckets, valueOf, yearOf) {
  const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));
  for (const record of records ?? []) {
    const year = Number(yearOf(record));
    if (!Number.isInteger(year)) continue;
    const key = String(year);
    if (!totals.has(key)) continue;
    const amount = Number(valueOf(record));
    totals.set(key, totals.get(key) + (Number.isFinite(amount) ? amount : 0));
  }
  return buckets.map((bucket) => ({ ...bucket, consumption: totals.get(bucket.key) }));
}
