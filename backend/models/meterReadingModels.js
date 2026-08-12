import { supabase } from "../config/supabase.js";

const columns =
  "id, consumer_id, reading_date, previous_reading, present_reading, consumption, created_at, consumers(full_name, purok_no)";

export const WATER_RATE_PER_CUBIC_METER = 15;

function unwrap({ data, error }) {
  if (error) {
    throw error;
  }

  return data;
}

function formatReading(record) {
  const consumer = record.consumers ?? {};

  return {
    id: record.id,
    consumerId: record.consumer_id,
    consumerNo: `C-${String(record.consumer_id).padStart(4, "0")}`,
    consumerName:
      consumer.full_name ?? "Unknown consumer",
    purok:
      consumer.purok_no == null
        ? "Unassigned"
        : `Purok ${consumer.purok_no}`,
    previousReading: Number(record.previous_reading),
    currentReading: Number(record.present_reading),
    consumption: Number(record.consumption),
    billAmount:
      Number(record.consumption) *
      WATER_RATE_PER_CUBIC_METER,
    readingDate: record.reading_date,
    status: "Recorded",
  };
}

function endOfMonth(date) {
  const source = new Date(
    `${date}T00:00:00.000Z`
  );
  const value = new Date(
    Date.UTC(
      source.getUTCFullYear(),
      source.getUTCMonth() + 1,
      0
    )
  );

  return value
    .toISOString()
    .slice(0, 10);
}

async function assertReadingHasNoPayments(readingId) {
  const billing = unwrap(
    await supabase
      .from("billing")
      .select("id")
      .eq("consumption_id", readingId)
      .maybeSingle()
  );

  if (!billing) return;

  const payments = unwrap(
    await supabase
      .from("payments")
      .select("id")
      .eq("billing_id", billing.id)
      .limit(1)
  ) ?? [];

  if (payments.length > 0) {
    const error = new Error(
      "This meter reading cannot be changed because its bill already has a recorded payment. Use an audited billing adjustment instead."
    );
    error.status = 409;
    throw error;
  }
}

async function syncBilling(record) {
  const totalBill =
    Number(record.consumption) *
    WATER_RATE_PER_CUBIC_METER;

  const existing = unwrap(
    await supabase
      .from("billing")
      .select(
        "id, total_bill, remaining_balance"
      )
      .eq("consumption_id", record.id)
      .maybeSingle()
  );

  if (!existing) {
    unwrap(
      await supabase
        .from("billing")
        .insert({
          consumption_id: record.id,
          user_id: record.consumer_id,
          billing_date: record.reading_date,
          due_date: endOfMonth(record.reading_date),
          total_bill: totalBill,
          remaining_balance: totalBill,
          status: "Unpaid",
        })
    );

    return;
  }

  const amountAlreadyPaid = Math.max(
    Number(existing.total_bill) -
      Number(existing.remaining_balance),
    0
  );

  const remainingBalance = Math.max(
    totalBill - amountAlreadyPaid,
    0
  );

  let status = "Unpaid";

  if (remainingBalance === 0) {
    status = "Paid";
  } else if (amountAlreadyPaid > 0) {
    status = "Partially Paid";
  }

  unwrap(
    await supabase
      .from("billing")
      .update({
        user_id: record.consumer_id,
        billing_date: record.reading_date,
        due_date: endOfMonth(record.reading_date),
        total_bill: totalBill,
        remaining_balance: remainingBalance,
        status,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", existing.id)
  );
}

export async function getMeterReadings() {
  const records =
    unwrap(
      await supabase
        .from("consumption")
        .select(columns)
        .order("reading_date", {
          ascending: false,
        })
        .order("id", {
          ascending: false,
        })
    ) ?? [];

  return records.map(formatReading);
}

export async function getMeterReadingById(id) {
  const record = unwrap(
    await supabase
      .from("consumption")
      .select(columns)
      .eq("id", id)
      .maybeSingle()
  );

  return record
    ? formatReading(record)
    : null;
}

export async function createMeterReading(
  reading
) {
  const record = unwrap(
    await supabase
      .from("consumption")
      .insert({
        consumer_id:
          reading.consumerId,
        reading_date:
          reading.readingDate,
        previous_reading:
          reading.previousReading,
        present_reading:
          reading.currentReading,
      })
      .select(columns)
      .single()
  );

  await syncBilling(record);

  return formatReading(record);
}

export async function updateMeterReading(
  id,
  reading
) {
  await assertReadingHasNoPayments(id);

  const record = unwrap(
    await supabase
      .from("consumption")
      .update({
        reading_date:
          reading.readingDate,
        previous_reading:
          reading.previousReading,
        present_reading:
          reading.currentReading,
      })
      .eq("id", id)
      .select(columns)
      .maybeSingle()
  );

  if (!record) {
    return null;
  }

  await syncBilling(record);

  return formatReading(record);
}

export async function deleteMeterReading(id) {
  await assertReadingHasNoPayments(id);

  const { error } = await supabase
    .from("consumption")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
