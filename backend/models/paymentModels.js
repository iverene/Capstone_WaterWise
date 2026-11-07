import { supabase } from "../config/supabase.js";
import { randomUUID } from "node:crypto";
import { fetchAllPages } from "../utils/supabasePagination.js";

const PAYMENT_FIELDS =
  "id, billing_id, total_paid, amount_tendered, change_given, remaining_balance, payment_date, payment_method, reference_number, idempotency_key, created_at, updated_at";

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

const parsePositiveId = (value, fieldName) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw createError(`A valid ${fieldName} is required.`);
  }
  return id;
};

const parsePaymentAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError("Payment amount must be greater than zero.");
  }
  const roundedAmount = Number(amount.toFixed(2));
  if (roundedAmount <= 0) {
    throw createError("Payment amount must be at least 0.01.");
  }
  return roundedAmount;
};

const parsePaymentDate = (value) => {
  const date = value ?? new Date().toISOString().slice(0, 10);
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw createError("A valid payment date is required.");
  }
  return date;
};

const parsePaymentMethod = (value) => {
  const method = String(value ?? "Cash").trim();
  if (!["Cash", "GCash"].includes(method)) {
    throw createError("Unsupported payment method.");
  }
  return method;
};

const parseOptionalReference = (value) => {
  const reference = String(value ?? "").trim();
  if (reference.length > 100) {
    throw createError("Reference number cannot exceed 100 characters.");
  }
  return reference || null;
};

const paymentErrorStatus = (message) => {
  if (message.includes("not found")) return 404;
  if (message.includes("already fully paid")) return 409;
  if (message.includes("No outstanding bills")) return 409;
  return 400;
};

const toPaymentError = (message, fallback) => {
  const text = message || fallback;
  return createError(text, paymentErrorStatus(text));
};

export async function createPayment({
  billingId,
  totalPaid,
  amount,
  amountTendered,
  paymentDate,
  paymentMethod,
  referenceNumber,
  idempotencyKey,
}) {
  const normalizedBillingId = parsePositiveId(billingId, "billing ID");
  const paymentAmount = parsePaymentAmount(totalPaid ?? amount);
  const normalizedAmountTendered = parsePaymentAmount(amountTendered ?? paymentAmount);
  const normalizedDate = parsePaymentDate(paymentDate);
  const normalizedMethod = parsePaymentMethod(paymentMethod);
  const normalizedReference = parseOptionalReference(referenceNumber);
  const normalizedIdempotencyKey = String(idempotencyKey ?? randomUUID()).trim();

  if (normalizedMethod !== "Cash" && !normalizedReference) {
    throw createError("An electronic payment reference number is required.");
  }

  if (normalizedMethod === "Cash" && normalizedAmountTendered < paymentAmount) {
    throw createError("Cash received cannot be lower than the amount applied.");
  }

  if (normalizedMethod !== "Cash" && normalizedAmountTendered !== paymentAmount) {
    throw createError("Electronic payment must equal the amount applied to the bill.");
  }

  if (!normalizedIdempotencyKey || normalizedIdempotencyKey.length > 200) {
    throw createError("A valid payment idempotency key is required.");
  }

  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from("payments")
    .select("id")
    .eq("idempotency_key", normalizedIdempotencyKey)
    .maybeSingle();

  if (existingPaymentError) {
    throw createError(`Failed to validate payment request: ${existingPaymentError.message}`, 500);
  }

  if (!existingPayment) {
    const { data: targetBilling, error: targetBillingError } = await supabase
      .from("billing")
      .select("id, user_id, billing_date, remaining_balance, status")
      .eq("id", normalizedBillingId)
      .maybeSingle();

    if (targetBillingError) {
      throw createError(`Failed to validate billing payment order: ${targetBillingError.message}`, 500);
    }
    if (!targetBilling) {
      throw createError("Billing record not found.", 404);
    }

    const { data: oldestUnpaidBills, error: oldestUnpaidError } = await supabase
      .from("billing")
      .select("id")
      .eq("user_id", targetBilling.user_id)
      .gt("remaining_balance", 0)
      .order("billing_date", { ascending: true })
      .order("id", { ascending: true })
      .limit(1);

    if (oldestUnpaidError) {
      throw createError(`Failed to validate billing payment order: ${oldestUnpaidError.message}`, 500);
    }
    if (oldestUnpaidBills[0]?.id !== normalizedBillingId) {
      throw createError("The resident's oldest outstanding bill must be paid first.", 409);
    }
  }

  const { data, error } = await supabase.rpc("record_payment_transaction", {
    p_amount: paymentAmount,
    p_amount_tendered: normalizedAmountTendered,
    p_billing_id: normalizedBillingId,
    p_idempotency_key: normalizedIdempotencyKey,
    p_payment_date: normalizedDate,
    p_payment_method: normalizedMethod,
    p_reference_number: normalizedReference,
  });

  if (error) {
    throw toPaymentError(error.message, "Failed to record payment.");
  }

  if (!data?.id || !data?.billing) {
    throw createError("The payment transaction returned an invalid result.", 500);
  }

  return data;
}

// Allocation rows contain the amount applied to one bill. Receipt cash
// belongs to the whole allocation and must come from the original request.
export async function attachAllocationReceiptDetails(records) {
  const requestKey = (record) => {
    const key = record.idempotency_key;
    const suffix = `:${record.billing_id}`;
    return typeof key === "string" && key.endsWith(suffix) ? key.slice(0, -suffix.length) : null;
  };
  const keys = [...new Set(records.map(requestKey).filter(Boolean))];
  const requests = new Map();
  for (let offset = 0; offset < keys.length; offset += 100) {
    const chunk = keys.slice(offset, offset + 100);
    const { data, error } = await fetchAllPages(() => supabase
      .from("payment_waterfall_requests")
      .select("request_key, request_data, result_data")
      .in("request_key", chunk)
      .order("request_key", { ascending: true }));
    if (error) throw createError("Unable to retrieve original payment receipt details.", 503);
    for (const request of data ?? []) requests.set(request.request_key, request);
  }
  return records.map((record) => {
    const key = requestKey(record);
    const { idempotency_key: internalKey, billing: ownerJoin, ...payment } = record;
    void internalKey; void ownerJoin;
    if (!key) return payment;
    const request = requests.get(key);
    return { ...payment,
      allocation_cash_received: request?.request_data?.amount_tendered ?? null,
      allocation_change_given: request?.result_data?.change_given ?? null,
      allocation_total_applied: request?.result_data?.total_applied ?? null,
      cash_received_unavailable: !request,
    };
  });
}

export async function getPayments() {
  const { data, error } = await fetchAllPages(() => supabase
    .from("payments")
    .select(PAYMENT_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }));

  if (error) {
    throw createError(`Failed to retrieve payments: ${error.message}`, 500);
  }
  return attachAllocationReceiptDetails(data ?? []);
}

export async function getPaymentById(id) {
  const paymentId = parsePositiveId(id, "payment ID");
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_FIELDS)
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve payment: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Payment record not found.", 404);
  }
  return (await attachAllocationReceiptDetails([data]))[0];
}

export async function getPaymentsByBilling(billingId) {
  const normalizedBillingId = parsePositiveId(billingId, "billing ID");
  const { data, error } = await fetchAllPages(() => supabase
    .from("payments")
    .select(PAYMENT_FIELDS)
    .eq("billing_id", normalizedBillingId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }));

  if (error) {
    throw createError(`Failed to retrieve billing payments: ${error.message}`, 500);
  }
  return attachAllocationReceiptDetails(data ?? []);
}

export async function getPaymentsByConsumer(consumerId) {
  const userId = parsePositiveId(consumerId, "consumer ID");
  const { data, error } = await fetchAllPages(() => supabase
    .from("payments")
    .select(`${PAYMENT_FIELDS}, billing!inner(user_id)`)
    .eq("billing.user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }));
  if (error) throw createError(`Failed to retrieve consumer payments: ${error.message}`, 500);
  return attachAllocationReceiptDetails(data ?? []);
}

export async function createWaterfallPayment({
  consumerId,
  totalApplied,
  amount,
  amountTendered,
  paymentDate,
  paymentMethod,
  referenceNumber,
  idempotencyKey,
}) {
  const userId = parsePositiveId(consumerId, "consumer ID");

  const applied = parsePaymentAmount(totalApplied ?? amount);
  const tendered = parsePaymentAmount(amountTendered ?? applied);
  const normalizedDate = parsePaymentDate(paymentDate);
  const normalizedMethod = parsePaymentMethod(paymentMethod);
  const normalizedReference = parseOptionalReference(referenceNumber);
  const normalizedKey = String(idempotencyKey ?? randomUUID()).trim();
  if (!normalizedKey || normalizedKey.length > 200) {
    throw createError("A valid payment idempotency key is required.");
  }
  if (normalizedMethod !== "Cash" && !normalizedReference) {
    throw createError("An electronic payment reference number is required.");
  }
  if (normalizedMethod === "Cash" && tendered < applied) {
    throw createError("Cash received cannot be lower than the amount applied.");
  }
  if (normalizedMethod !== "Cash" && tendered !== applied) {
    throw createError("Electronic payment must equal the amount applied.");
  }
  // The transaction records and validates the original request before reading
  // balances. Never cap the amount here: doing so changes a retry's identity.
  const { data, error } = await supabase.rpc("record_payment_waterfall", {
    p_amount_tendered: tendered,
    p_applied: applied,
    p_consumer_id: userId,
    p_idempotency_key: normalizedKey,
    p_payment_date: normalizedDate,
    p_payment_method: normalizedMethod,
    p_reference_number: normalizedReference,
  });
  if (error) throw toPaymentError(error.message, "Failed to record payment.");
  const receiptPayments = (data?.payments ?? []).map((payment) => ({ ...payment,
    allocation_cash_received: tendered,
    allocation_change_given: Number(data?.change_given ?? 0),
    allocation_total_applied: Number(data?.total_applied ?? 0),
    cash_received_unavailable: false,
  }));
  return { ...data, payments: receiptPayments, changeGiven: Number(data?.change_given ?? Math.max(tendered - applied, 0)), totalApplied: Number(data?.total_applied ?? applied) };
}
