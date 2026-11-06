import { deleteCacheByPrefix, readCache, writeCache } from "../config/redis.js";
import { getBillings } from "../models/billingModels.js";
import { getConsumers } from "../models/consumerModels.js";
import { getPayments } from "../models/paymentModels.js";
import { currentManilaDate } from "../utils/billingPolicy.js";

const CACHE_PREFIX = "waterwise:admin-dashboard:metrics";
const CACHE_TTL_SECONDS = 8 * 60 * 60;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PUROK_NAMES = Array.from({ length: 6 }, (_, index) => `Purok ${index + 1}`);

function manilaNowParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return { year: Number(parts.year), month: Number(parts.month) };
}

function yearToDateMonths(now = new Date()) {
  const { year, month } = manilaNowParts(now);
  return Array.from({ length: month }, (_, index) => ({
    key: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: MONTH_LABELS[index],
  }));
}

function monthKeyOf(value, timeZone = null) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}/.test(text) && !timeZone) return text.slice(0, 7);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? "UTC",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(date)
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.year}-${parts.month}`;
}

function consumerOf(record) {
  return Array.isArray(record?.consumers) ? record.consumers[0] : record?.consumers;
}

function consumptionOf(record) {
  return Array.isArray(record?.consumption) ? record.consumption[0] : record?.consumption;
}

function purokOf(record) {
  const purokNumber = consumerOf(record)?.purok_no;
  return purokNumber == null ? "Unassigned" : `Purok ${purokNumber}`;
}

function isOverdue(record, today) {
  const dueDate = String(record?.due_date ?? "");
  return Number(record?.remaining_balance ?? 0) > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    && dueDate < today;
}

async function buildAdminDashboardMetrics(now = new Date()) {
  const [billings, payments, residents] = await Promise.all([
    getBillings(),
    getPayments(),
    getConsumers(),
  ]);

  const months = yearToDateMonths(now);
  const monthKeys = new Set(months.map(({ key }) => key));
  const currentKey = months.at(-1).key;
  const { year: currentYear, month: currentMonth } = manilaNowParts(now);
  const previousDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const previousKey = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const today = currentManilaDate(now);

  const activeResidents = residents.filter(
    (resident) => String(resident?.status ?? "active").toLowerCase() === "active",
  );
  const collectionsByMonth = new Map(months.map(({ key }) => [key, 0]));
  const consumptionByMonth = new Map(months.map(({ key }) => [key, 0]));
  const purokUsage = new Map();
  const readingsThisMonth = new Set();
  const debtors = new Set();
  const overdueByResident = new Map();

  let outstandingTotal = 0;
  let paidThisMonthTotal = 0;
  let unpaidOutstanding = 0;
  let partialOutstanding = 0;
  let collectedPrevious = 0;

  for (const billing of billings) {
    const residentKey = String(billing?.user_id ?? "unknown");
    const balance = Number(billing?.remaining_balance ?? 0);
    const amountDue = Number(billing?.total_bill ?? 0);

    if (balance > 0) {
      outstandingTotal += balance;
      debtors.add(residentKey);
      if (isOverdue(billing, today)) {
        overdueByResident.set(residentKey, (overdueByResident.get(residentKey) ?? 0) + 1);
      }
      if (balance < amountDue) partialOutstanding += balance;
      else unpaidOutstanding += balance;
    }

    const consumption = consumptionOf(billing);
    const billingMonth = monthKeyOf(billing?.billing_date ?? consumption?.reading_date);
    const cubicMeters = Number(consumption?.consumption ?? 0);
    if (billingMonth && monthKeys.has(billingMonth)) {
      consumptionByMonth.set(billingMonth, consumptionByMonth.get(billingMonth) + cubicMeters);
    }
    if (billingMonth === currentKey) {
      readingsThisMonth.add(residentKey);
      const purok = purokOf(billing);
      purokUsage.set(purok, (purokUsage.get(purok) ?? 0) + cubicMeters);
    }
  }

  for (const payment of payments) {
    const paymentMonth = monthKeyOf(payment?.payment_date ?? payment?.created_at, "Asia/Manila");
    const amount = Number(payment?.total_paid ?? 0);
    if (paymentMonth === previousKey) collectedPrevious += amount;
    if (paymentMonth && monthKeys.has(paymentMonth)) {
      collectionsByMonth.set(paymentMonth, collectionsByMonth.get(paymentMonth) + amount);
      if (paymentMonth === currentKey) paidThisMonthTotal += amount;
    }
  }

  const collectedMonth = collectionsByMonth.get(currentKey) ?? 0;
  return {
    currentMonthLabel: new Intl.DateTimeFormat("en-PH", {
      month: "long",
      timeZone: "Asia/Manila",
      year: "numeric",
    }).format(now),
    previousMonthLabel: MONTH_NAMES[previousDate.getUTCMonth()],
    outstandingTotal,
    debtorCount: debtors.size,
    collectedMonth,
    collectedPrevious,
    readingsDone: readingsThisMonth.size,
    residentsActive: activeResidents.length,
    flaggedCount: [...overdueByResident.values()].filter((count) => count >= 3).length,
    collectionsSeries: months.map(({ key, label }) => ({
      month: label,
      amount: Math.round(collectionsByMonth.get(key) * 100) / 100,
    })),
    consumptionSeries: months.map(({ key, label }) => ({
      month: label,
      cubicMeters: Math.round(consumptionByMonth.get(key) * 10) / 10,
    })),
    billingStatus: [
      { name: "Paid This Month", value: Math.round(paidThisMonthTotal * 100) / 100 },
      { name: "Unpaid", value: Math.round(unpaidOutstanding * 100) / 100 },
      { name: "Partially Paid", value: Math.round(partialOutstanding * 100) / 100 },
    ],
    purokTop: PUROK_NAMES.map((purok) => ({
      purok,
      cubicMeters: Math.round((purokUsage.get(purok) ?? 0) * 10) / 10,
      hasRecords: purokUsage.has(purok),
    })),
  };
}

export async function getAdminDashboardMetrics(now = new Date()) {
  const key = `${CACHE_PREFIX}:${currentManilaDate(now)}`;
  const cached = await readCache(key);
  if (cached !== null) return cached;

  const metrics = await buildAdminDashboardMetrics(now);
  await writeCache(key, metrics, CACHE_TTL_SECONDS);
  return metrics;
}

export async function invalidateAdminDashboardCache() {
  return deleteCacheByPrefix(`${CACHE_PREFIX}:`);
}

