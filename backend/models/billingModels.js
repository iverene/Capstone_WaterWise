import { supabase } from "../config/supabase.js";
import { getRatePerCubicMeter } from "./systemSettingsModels.js";

export const RATE_PER_CUBIC_METER = 15;

const BILLING_FIELDS = `
  id,
  consumption_id,
  user_id,
  billing_date,
  due_date,
  total_bill,
  remaining_balance,
  status,
  created_at,
  updated_at,
  consumers!billing_user_id_fkey (
    id,
    full_name,
    purok_no
  ),
  consumption!billing_consumption_id_fkey (
    id,
    consumer_id,
    reading_date,
    previous_reading,
    present_reading,
    consumption
  )
`;

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

const parsePositiveId = (id, fieldName) => {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId < 1) {
    throw createError(`A valid ${fieldName} is required.`);
  }
  return parsedId;
};

const parseDate = (date, fieldName) => {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw createError(`${fieldName} must use the YYYY-MM-DD format.`);
  }

  return date;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const getMonthRange = (billingDate) => {
  const date = new Date(`${billingDate}T00:00:00Z`);
  const monthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  );
  const nextMonthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  );

  return {
    monthStart: formatDate(monthStart),
    nextMonthStart: formatDate(nextMonthStart),
  };
};

const defaultDueDate = (billingDate) => {
  const billing = new Date(`${billingDate}T00:00:00Z`);
  const dueDate = new Date(Date.UTC(
    billing.getUTCFullYear(),
    billing.getUTCMonth() + 1,
    0,
  ));
  return formatDate(dueDate);
};

export const createMonthlyBilling = async ({
  consumerId,
  billingDate = formatDate(new Date()),
}) => {
  const userId = parsePositiveId(consumerId, "consumer ID");
  const normalizedBillingDate = parseDate(billingDate, "Billing date");
  const normalizedDueDate = defaultDueDate(normalizedBillingDate);

  const { monthStart, nextMonthStart } = getMonthRange(normalizedBillingDate);

  const { data: existingBills, error: existingBillError } = await supabase
    .from("billing")
    .select("id")
    .eq("user_id", userId)
    .gte("billing_date", monthStart)
    .lt("billing_date", nextMonthStart)
    .limit(1);

  if (existingBillError) {
    throw createError(
      `Failed to check existing billing: ${existingBillError.message}`,
      500
    );
  }

  if (existingBills.length > 0) {
    throw createError(
      "A billing record already exists for this consumer and month.",
      409
    );
  }

  const { data: readings, error: readingsError } = await supabase
    .from("consumption")
    .select("id, consumption, reading_date")
    .eq("consumer_id", userId)
    .gte("reading_date", monthStart)
    .lt("reading_date", nextMonthStart)
    .order("reading_date", { ascending: false })
    .order("id", { ascending: false });

  if (readingsError) {
    throw createError(
      `Failed to retrieve monthly consumption: ${readingsError.message}`,
      500
    );
  }

  if (!readings || readings.length === 0) {
    throw createError(
      "No consumption readings were found for this consumer and month.",
      404
    );
  }

  const monthlyConsumption = readings.reduce((total, reading) => {
    const consumption = Number(reading.consumption);
    return total + (Number.isFinite(consumption) ? consumption : 0);
  }, 0);

  const rate = await getRatePerCubicMeter();
  const totalBill = Number(
    (monthlyConsumption * rate).toFixed(2)
  );

  const { data, error } = await supabase
    .from("billing")
    .insert({
      consumption_id: readings[0].id,
      user_id: userId,
      billing_date: normalizedBillingDate,
      due_date: normalizedDueDate,
      total_bill: totalBill,
      remaining_balance: totalBill,
      status: "Unpaid",
    })
    .select(BILLING_FIELDS)
    .single();

  if (error) {
    if (error.code === "23503") {
      throw createError("Consumer or consumption record not found.", 404);
    }
    throw createError(`Failed to create billing record: ${error.message}`, 500);
  }

  return {
    ...data,
    monthly_consumption: Number(monthlyConsumption.toFixed(2)),
    rate_per_cubic_meter: rate,
  };
};

export const getBillings = async () => {
  const { data, error } = await supabase
    .from("billing")
    .select(BILLING_FIELDS)
    .order("billing_date", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve billing records: ${error.message}`, 500);
  }

  return data ?? [];
};

export const getBillingById = async (id) => {
  const billingId = parsePositiveId(id, "billing ID");
  const { data, error } = await supabase
    .from("billing")
    .select(BILLING_FIELDS)
    .eq("id", billingId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve billing record: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Billing record not found.", 404);
  }

  return data;
};

export const getBillingsByConsumer = async (consumerId) => {
  const userId = parsePositiveId(consumerId, "consumer ID");
  const { data, error } = await supabase
    .from("billing")
    .select(BILLING_FIELDS)
    .eq("user_id", userId)
    .order("billing_date", { ascending: false });

  if (error) {
    throw createError(
      `Failed to retrieve consumer billing records: ${error.message}`,
      500
    );
  }

  return data ?? [];
};
