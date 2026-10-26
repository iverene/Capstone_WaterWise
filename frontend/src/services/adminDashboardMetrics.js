import { fetchBillingHistory } from "./billingAPI";
import { fetchConsumerDirectory } from "./consumerDirectoryAPI";
import { fetchPaymentHistory } from "./paymentAPI";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PUROK_NAMES = Array.from({ length: 6 }, (_, index) => `Purok ${index + 1}`);

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

// Calendar months from January through the current month in Manila time.
function yearToDateMonths() {
  const { year, month } = manilaNowParts();
  return Array.from({ length: month }, (_, index) => {
    const monthNumber = index + 1;
    return {
      key: `${year}-${String(monthNumber).padStart(2, "0")}`,
      label: MONTH_LABELS[index],
    };
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

  const months = yearToDateMonths();
  const keys = new Set(months.map((entry) => entry.key));
  const currentKey = months[months.length - 1].key;
  const { year: currentYear, month: currentMonth } = manilaNowParts();
  const previousDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const previousKey = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;

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
  let collectedPrevious = 0;
  for (const payment of payments) {
    const key = monthKeyOf(payment.paymentDate);
    if (key === previousKey) collectedPrevious += Number(payment.amountPaid ?? 0);
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

  const purokTop = PUROK_NAMES.map((purok) => ({
    purok,
    cubicMeters: Math.round((purokUsage.get(purok) ?? 0) * 10) / 10,
    hasRecords: purokUsage.has(purok),
  }));

  const currentMonthLabel = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date());

  return {
    currentMonthLabel,
    previousMonthLabel: MONTH_NAMES[previousDate.getUTCMonth()],
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
