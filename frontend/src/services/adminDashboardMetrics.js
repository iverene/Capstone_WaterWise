import { fetchBillingHistory } from "./billingAPI";
import { fetchConsumerDirectory } from "./consumerDirectoryAPI";
import { fetchPaymentHistory } from "./paymentAPI";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function manilaNowParts() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  return { year: Number(parts.year), month: Number(parts.month) };
}

// Last `count` calendar months (Manila) ending with the current one, oldest
// first: [{ key: "2026-09", label: "Sep" }].
function lastMonths(count) {
  const { year, month } = manilaNowParts();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - offset), 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, label: MONTH_LABELS[date.getUTCMonth()] };
  });
}

// Records carry plain "YYYY-MM-DD" calendar dates (payments normalized to
// Asia/Manila on fetch). Compare the YYYY-MM prefix directly instead of
// parsing Dates, which would reintroduce timezone shifts.
function monthKeyOf(value) {
  const text = String(value ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

function residentKeyOf(record) {
  return String(record.raw?.user_id ?? record.consumerName ?? "unknown");
}

export const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value ?? 0));

export async function fetchAdminDashboardMetrics() {
  const [billings, payments, residents] = await Promise.all([
    fetchBillingHistory(),
    fetchPaymentHistory(),
    fetchConsumerDirectory(),
  ]);

  const months = lastMonths(6);
  const keys = new Set(months.map((entry) => entry.key));
  const currentKey = months[months.length - 1].key;
  const previousKey = months[months.length - 2].key;

  const activeResidents = residents.filter(
    (resident) => String(resident.status ?? "active").toLowerCase() === "active",
  );

  // --- KPI: outstanding balance + debtors + flagged accounts ----------------
  let outstandingTotal = 0;
  let paidThisMonthTotal = 0;
  let unpaidOutstanding = 0;
  let partialOutstanding = 0;
  const debtors = new Set();
  const outstandingByResident = new Map();
  const purokUsage = new Map();
  const readingsThisMonth = new Set();

  for (const record of billings) {
    const balance = Number(record.outstandingBalance ?? 0);
    const due = Number(record.amountDue ?? 0);
    const key = residentKeyOf(record);
    if (balance > 0) {
      outstandingTotal += balance;
      debtors.add(key);
      outstandingByResident.set(key, (outstandingByResident.get(key) ?? 0) + 1);
      if (balance < due) partialOutstanding += balance;
      else unpaidOutstanding += balance;
    }

    const billingMonth = monthKeyOf(record.raw?.billing_date ?? record.readingDate);
    if (billingMonth === currentKey) {
      readingsThisMonth.add(key);
      const purok = record.purok ?? "Unassigned";
      purokUsage.set(purok, (purokUsage.get(purok) ?? 0) + Number(record.cubicMetersConsumed ?? 0));
    }
  }

  const flaggedCount = [...outstandingByResident.values()].filter((count) => count >= 3).length;

  // --- KPI + graph: collections --------------------------------------------
  const collectedByMonth = new Map(months.map((entry) => [entry.key, 0]));
  for (const payment of payments) {
    const key = monthKeyOf(payment.paymentDate);
    if (key && keys.has(key)) {
      const amount = Number(payment.amountPaid ?? 0);
      collectedByMonth.set(key, collectedByMonth.get(key) + amount);
      if (key === currentKey) paidThisMonthTotal += amount;
    }
  }
  const collectionsSeries = months.map((entry) => ({
    month: entry.label,
    amount: Math.round(collectedByMonth.get(entry.key) * 100) / 100,
  }));
  const collectedMonth = collectedByMonth.get(currentKey) ?? 0;
  const collectedPrevious = collectedByMonth.get(previousKey) ?? 0;

  // --- Graph: consumption ----------------------------------------------------
  const consumptionByMonth = new Map(months.map((entry) => [entry.key, 0]));
  for (const record of billings) {
    const key = monthKeyOf(record.raw?.billing_date ?? record.readingDate);
    if (key && keys.has(key)) {
      consumptionByMonth.set(key, consumptionByMonth.get(key) + Number(record.cubicMetersConsumed ?? 0));
    }
  }
  const consumptionSeries = months.map((entry) => ({
    month: entry.label,
    cubicMeters: Math.round(consumptionByMonth.get(entry.key) * 10) / 10,
  }));

  const purokTop = [...purokUsage.entries()]
    .map(([purok, cubicMeters]) => ({ purok, cubicMeters: Math.round(cubicMeters * 10) / 10 }))
    .sort((a, b) => b.cubicMeters - a.cubicMeters);

  const currentMonthLabel = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date());

  return {
    currentMonthLabel,
    previousMonthLabel: MONTH_NAMES[Number(months[months.length - 2].key.slice(5, 7)) - 1],
    outstandingTotal,
    debtorCount: debtors.size,
    collectedMonth,
    collectedPrevious,
    readingsDone: readingsThisMonth.size,
    residentsActive: activeResidents.length,
    flaggedCount,
    collectionsSeries,
    consumptionSeries,
    billingStatus: [
      { name: "Paid This Month", value: Math.round(paidThisMonthTotal * 100) / 100 },
      { name: "Unpaid", value: Math.round(unpaidOutstanding * 100) / 100 },
      { name: "Partially Paid", value: Math.round(partialOutstanding * 100) / 100 },
    ],
    purokTop,
  };
}
