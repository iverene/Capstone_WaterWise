const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function dateAtUtcMidnight(value) {
  if (!DATE_PATTERN.test(String(value))) {
    throw new TypeError("Date must use the YYYY-MM-DD format.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new TypeError("Invalid calendar date.");
  return date;
}

export const toDateString = (date) => date.toISOString().slice(0, 10);

export function currentManilaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(value, days) {
  const date = dateAtUtcMidnight(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

export const daysBetween = (from, to) =>
  Math.round(
    (dateAtUtcMidnight(to).getTime() - dateAtUtcMidnight(from).getTime()) /
      86_400_000,
  );

export function followingMonthTenth(billingDate) {
  const date = dateAtUtcMidnight(billingDate);
  return toDateString(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 10)));
}

export function disconnectionGrace(thirdOverdueDueDate, today = currentManilaDate()) {
  const eligibleDate = addDays(thirdOverdueDueDate, 4);
  return {
    daysRemaining: Math.max(daysBetween(today, eligibleDate), 0),
    eligibleDate,
    isEligible: today >= eligibleDate,
  };
}
