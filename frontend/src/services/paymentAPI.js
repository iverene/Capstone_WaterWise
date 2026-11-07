import apiClient from "./apiClient";
import { withDataChangeClient } from "./dataChangeClient";

const paymentDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Manila",
  year: "numeric",
});

function formatPaymentDate(value) {
  if (!value) return "Not available";

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  const dateParts = Object.fromEntries(
    paymentDateFormatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

export function normalizePaymentRecord(record) {
  const remainingBalance = Number(record.remaining_balance ?? 0);
  const statusAfterPayment = remainingBalance === 0 ? "Paid" : "Partially Paid";
  return {
    id: record.id,
    billingId: record.billing_id,
    invoiceNumber: record.invoiceNumber ?? (record.billing_id ? `INV-${record.billing_id}` : "Not available"),
    consumerName: record.consumerName ?? `Billing #${record.billing_id}`,
    paymentDate: formatPaymentDate(record.payment_date ?? record.created_at),
    paymentMethod: record.payment_method ?? "Cash",
    referenceNumber: record.reference_number ?? "",
    amountPaid: Number(record.total_paid ?? 0),
    amountTendered: record.cash_received_unavailable ? null : Number(record.allocation_cash_received ?? record.amount_tendered ?? record.total_paid ?? 0),
    cashReceivedUnavailable: Boolean(record.cash_received_unavailable),
    allocationTotalApplied: record.allocation_total_applied == null ? null : Number(record.allocation_total_applied),
    changeGiven: Number(record.allocation_change_given ?? record.change_given ?? 0),
    remainingBalance,
    balanceAfterPayment: remainingBalance,
    paymentStatus: statusAfterPayment,
    statusAfterPayment,
    currentBillStatus: record.billing?.status ?? statusAfterPayment,
    currentBillRemainingBalance: Number(record.billing?.remaining_balance ?? remainingBalance),
    createdAt: record.created_at,
    raw: record,
  };
}

export async function fetchPaymentHistory(options = {}) {
  const response = await apiClient.get("/payments", options);
  const records = response.data?.data ?? [];
  return Array.isArray(records) ? records.map(normalizePaymentRecord) : [];
}

export async function fetchPaymentByBillingId(billingId, options = {}) {
  const response = await apiClient.get(`/payments/billing/${billingId}`, options);
  const records = response.data?.data ?? [];
  return Array.isArray(records) ? records.map(normalizePaymentRecord) : [];
}

export async function fetchConsumerPayments(consumerId, options = {}) {
  const response = await apiClient.get(`/payments/consumer/${consumerId}`, options);
  const records = response.data?.data ?? [];
  return Array.isArray(records) ? records.map(normalizePaymentRecord) : [];
}

export async function recordPayment(payload, options = {}) {
  const response = await apiClient.post("/payments", {
    billingId: payload.billingId,
    amountTendered: Number(payload.amountTendered ?? payload.amountPaid),
    idempotencyKey: payload.idempotencyKey,
    paymentDate: payload.paymentDate,
    paymentMethod: payload.paymentMethod,
    referenceNumber: payload.referenceNumber || null,
    totalPaid: Number(payload.amountPaid ?? payload.amount),
  }, options);
  const result = response.data?.data;
  return {
    billing: result.billing,
    payment: normalizePaymentRecord(result),
  };
}

export async function recordWaterfallPayment(payload, options = {}) {
  const response = await apiClient.post("/payments/allocate", {
    consumerId: Number(payload.consumerId),
    amountTendered: Number(payload.amountTendered ?? payload.totalApplied),
    idempotencyKey: payload.idempotencyKey,
    paymentDate: payload.paymentDate,
    paymentMethod: payload.paymentMethod,
    referenceNumber: payload.referenceNumber || null,
    totalApplied: Number(payload.totalApplied ?? payload.amount),
  }, withDataChangeClient(options));
  const result = response.data?.data ?? {};
  const raws = Array.isArray(result.payments) ? result.payments : [];
  return {
    billings: result.billings ?? [],
    changeGiven: Number(result.changeGiven ?? result.change_given ?? 0),
    payments: raws.map(normalizePaymentRecord),
    replayed: Boolean(result.replayed),
    totalApplied: Number(result.totalApplied ?? result.total_applied ?? 0),
  };
}
