import { supabase } from "../config/supabase.js";
import { randomUUID } from "node:crypto";

const PAYMENT_FIELDS =
  "id, billing_id, total_paid, amount_tendered, change_given, remaining_balance, payment_date, payment_method, reference_number, created_at, updated_at";

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

const currentManilaMonth = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      timeZone: "Asia/Manila",
      year: "numeric",
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}`;
};

const paymentErrorStatus = (message) => {
  if (message.includes("not found")) return 404;
  if (message.includes("already fully paid")) return 409;
  return 400;
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
    if (
      targetBilling.status === "Partially Paid" &&
      paymentAmount < Number(targetBilling.remaining_balance)
    ) {
      throw createError(
        "This bill already has a partial payment. The next payment must settle the full remaining balance.",
        400,
      );
    }
    if (
      String(targetBilling.billing_date).slice(0, 7) !== currentManilaMonth() &&
      paymentAmount < Number(targetBilling.remaining_balance)
    ) {
      throw createError(
        "Bills from previous months must be paid in full. Partial payments are allowed only for the current month's bill.",
        400,
      );
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
      throw createError("The resident's oldest outstanding bill must be paid in full first.", 409);
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
    const message = error.message || "Failed to record payment.";
    throw createError(message, paymentErrorStatus(message));
  }

  if (!data?.id || !data?.billing) {
    throw createError("The payment transaction returned an invalid result.", 500);
  }

  return data;
}

export async function getPayments() {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve payments: ${error.message}`, 500);
  }
  return data ?? [];
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
  return data;
}

export async function getPaymentsByBilling(billingId) {
  const normalizedBillingId = parsePositiveId(billingId, "billing ID");
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_FIELDS)
    .eq("billing_id", normalizedBillingId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve billing payments: ${error.message}`, 500);
  }
  return data ?? [];
}

export async function getPaymentsByConsumer(consumerId) {
  const userId = parsePositiveId(consumerId, "consumer ID");
  const { data: billings, error: billingError } = await supabase
    .from("billing")
    .select("id")
    .eq("user_id", userId);

  if (billingError) {
    throw createError(
      `Failed to retrieve consumer billings: ${billingError.message}`,
      500
    );
  }

  const billingIds = (billings ?? []).map((billing) => billing.id);
  if (billingIds.length === 0) return [];

  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_FIELDS)
    .in("billing_id", billingIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve consumer payments: ${error.message}`, 500);
  }
  return data ?? [];
}
