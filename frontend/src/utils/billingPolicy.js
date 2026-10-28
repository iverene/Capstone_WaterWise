const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function manilaToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Manila",
      year: "numeric",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function manilaTimeNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: "Asia/Manila",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.hour}:${parts.minute}`;
}

export function addCalendarDays(dateKey, days) {
  if (!DATE_PATTERN.test(String(dateKey))) return null;
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarDaysBetween(from, to) {
  if (!DATE_PATTERN.test(String(from)) || !DATE_PATTERN.test(String(to))) return 0;
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

export function isOverdueBilling(record, today = manilaToday()) {
  const dueDate = record?.dueDate ?? record?.raw?.due_date;
  return Number(record?.outstandingBalance ?? record?.remaining_balance ?? 0) > 0
    && DATE_PATTERN.test(String(dueDate))
    && dueDate < today;
}

export function disconnectionGrace(thirdOverdueDueDate, today = manilaToday()) {
  // The due date is payable through the end of that day. Three complete grace
  // days follow, so a November 10 bill is disconnect-eligible on November 14.
  const eligibleDate = addCalendarDays(thirdOverdueDueDate, 4);
  const daysRemaining = eligibleDate ? Math.max(calendarDaysBetween(today, eligibleDate), 0) : 0;
  return {
    daysRemaining,
    eligibleDate,
    isEligible: Boolean(eligibleDate) && today >= eligibleDate,
  };
}
