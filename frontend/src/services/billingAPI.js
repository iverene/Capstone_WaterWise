import apiClient from "./apiClient";

const billingClient = {
  get: (path, options) => apiClient.get(`/billing${path}`, options),
  post: (path, payload, options) =>
    apiClient.post(`/billing${path}`, payload, options),
};

function formatMonth(value) {
  if (!value) return "Unknown period";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function composeConsumerName(consumer, fallback = "") {
  const composed = [consumer.first_name, consumer.middle_name, consumer.last_name]
    .map((part) => String(part ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ");
  return composed || consumer.full_name || fallback;
}

export function normalizeBillingRecord(record) {
  const consumer = Array.isArray(record.consumers)
    ? record.consumers[0]
    : (record.consumers ?? record.consumer ?? {});
  const reading = Array.isArray(record.consumption)
    ? record.consumption[0]
    : (record.consumption ?? {});
  const purokNumber = consumer.purok_no ?? record.purok_no;
  const consumption = Number(
    reading.consumption ??
      record.monthly_consumption ??
      record.cubic_used ??
      0,
  );

  return {
    id: record.id,
    invoiceNumber: `INV-${record.id}`,
    consumerName:
      composeConsumerName(consumer) ||
      record.consumer_name ||
      `Consumer #${record.user_id}`,
    purok:
      consumer.purok ??
      (purokNumber != null ? `Purok ${purokNumber}` : record.purok) ??
      "Unassigned",
    billingPeriod: formatMonth(record.billing_date),
    readingDate: reading.reading_date ?? record.billing_date,
    cubicMetersConsumed: Number.isFinite(consumption) ? consumption : 0,
    amountDue: Number(record.total_bill ?? 0),
    outstandingBalance: Number(record.remaining_balance ?? 0),
    status: record.status ?? "Unpaid",
    address:
      consumer.purok ??
      (purokNumber != null ? `Purok ${purokNumber}` : record.address) ??
      "Address not available",
    previousReading: Number(reading.previous_reading ?? 0),
    currentReading: Number(reading.present_reading ?? 0),
    readingSource: reading.reading_source ?? "actual",
    carriedConsumption: Number(reading.carried_consumption ?? 0),
    newBaseline: reading.new_baseline == null ? null : Number(reading.new_baseline),
    dueDate: record.due_date,
    raw: record,
  };
}

export async function fetchBillingHistory(options = {}) {
  const response = await billingClient.get("/", options);
  const records = response.data?.data ?? [];
  return Array.isArray(records) ? records.map(normalizeBillingRecord) : [];
}

// Admin-only: GET /billing/:id rejects consumers (403). Consumer portals
// must use fetchConsumerBillings() (GET /billing/consumer/:consumerId, owner-checked).
export async function fetchBillingById(id, options = {}) {
  const response = await billingClient.get(`/${id}`, options);
  return response.data?.data ? normalizeBillingRecord(response.data.data) : null;
}

export async function fetchConsumerBillings(consumerId, options = {}) {
  const response = await billingClient.get(`/consumer/${consumerId}`, options);
  const records = response.data?.data ?? [];
  return Array.isArray(records) ? records.map(normalizeBillingRecord) : [];
}

export async function generateMonthlyBilling(payload, options = {}) {
  const response = await billingClient.post("/", payload, options);
  return response.data?.data ?? response.data;
}

export default billingClient;
