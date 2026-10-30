// backend/models/consumption.model.js

import { supabase } from "../config/supabase.js";
import { fetchAllPages } from "../utils/supabasePagination.js";
import { composeFullName } from "./consumerModels.js";
import {
  getAverageWindowMonths,
  listOpenIncidents,
  normalizeIncident,
  resolveIncidentPriorUsage,
} from "./meterIncidentModels.js";

const consumerDisplayName = (consumer, fallback = "Unknown consumer") => {
  if (!consumer) return fallback;
  return (
    composeFullName(consumer.first_name, consumer.middle_name, consumer.last_name) ||
    consumer.full_name ||
    fallback
  );
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const toNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
};

const formatPurok = (purokNo) => {
  return `Purok ${purokNo}`;
};

// Common consumption query
const fetchConsumptionRecords = async () => {
  const { data, error } = await fetchAllPages(() =>
    supabase
      .from("consumption")
      .select(`
        id,
        consumer_id,
        reading_date,
        previous_reading,
        present_reading,
        consumption,
        reading_source,
        carried_consumption,
        prior_usage_basis,
        new_baseline,
        meter_incident_id,
        consumers!consumption_consumer_id_fkey (
          id,
          first_name,
          middle_name,
          last_name,
          purok_no
        )
      `)
      .order("reading_date", { ascending: true })
      .order("id", { ascending: true }),
  );

  if (error) {
    throw new Error(`Failed to retrieve consumption records: ${error.message}`);
  }

  return data ?? [];
};

// Used by:
// getOverallMonthlyHistory
// getOverallYearlyHistory
// getPerPurokMonthlyHistory
// getPerPurokYearlyHistory
// getAllPuroksMonthlyHistory
// getAllPuroksYearlyHistory
export const getPurokPredictionData =
  async () => {
    const records =
      await fetchConsumptionRecords();

    const groupedRecords =
      new Map();

    records.forEach((record) => {
      const purokNo =
        record.consumers?.purok_no;

      if (
        purokNo === null ||
        purokNo === undefined ||
        !record.reading_date
      ) {
        return;
      }

      const date =
        new Date(
          record.reading_date
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return;
      }

      const year =
        date.getUTCFullYear();

      const monthIndex =
        date.getUTCMonth();

      const month =
        MONTHS[monthIndex];

      if (!month) {
        return;
      }

      const key =
        `${purokNo}-${year}`;

      if (
        !groupedRecords.has(
          key
        )
      ) {
        groupedRecords.set(
          key,
          {
            purok:
              formatPurok(
                purokNo
              ),
            year,
            january: 0,
            february: 0,
            march: 0,
            april: 0,
            may: 0,
            june: 0,
            july: 0,
            august: 0,
            september: 0,
            october: 0,
            november: 0,
            december: 0,
            recordedMonths: [],
          }
        );
      }

      const groupedRecord =
        groupedRecords.get(
          key
        );

      groupedRecord[month] +=
        toNumber(
          record.consumption
        );

      if (
        !groupedRecord.recordedMonths.includes(
          month
        )
      ) {
        groupedRecord.recordedMonths.push(
          month
        );
      }
    });

    return [
      ...groupedRecords.values(),
    ].sort((a, b) => {
      if (
        a.year !== b.year
      ) {
        return (
          a.year - b.year
        );
      }

      return a.purok.localeCompare(
        b.purok,
        undefined,
        {
          numeric: true,
        }
      );
    });
  };

// Used by getConsumptionRanking
export const getPurokConsumptionRanking =
  async () => {
    const records =
      await fetchConsumptionRecords();

    const purokTotals =
      new Map();

    records.forEach(
      (record) => {
        const purokNo =
          record.consumers
            ?.purok_no;

        if (
          purokNo === null ||
          purokNo ===
            undefined
        ) {
          return;
        }

        const purok =
          formatPurok(
            purokNo
          );

        const currentTotal =
          purokTotals.get(
            purok
          ) ?? 0;

        purokTotals.set(
          purok,
          currentTotal +
            toNumber(
              record.consumption
            )
        );
      }
    );

    return [
      ...purokTotals.entries(),
    ].map(
      ([
        purok,
        consumption,
      ]) => ({
        purok,
        consumption:
          toNumber(
            consumption
          ),
      })
    );
  };

const readingError = (message, statusCode = 400, code = null) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const parseReadingDate = (readingDate) => {
  if (
    typeof readingDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(readingDate) ||
    Number.isNaN(Date.parse(`${readingDate}T00:00:00Z`)) ||
    new Date(`${readingDate}T00:00:00Z`).toISOString().slice(0, 10) !== readingDate
  ) {
    throw readingError("Reading date must use the YYYY-MM-DD format.");
  }

  return readingDate;
};

const monthKey = (date) => String(date ?? "").slice(0, 7);

const currentReadingDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const calculateArrears = (billings, currentBillingId, readingDate) => {
  const readingTime = Date.parse(`${readingDate}T00:00:00Z`);
  return billings.reduce((totals, billing) => {
    const balance = Number(billing.remaining_balance ?? 0);
    if (
      billing.id === currentBillingId ||
      billing.status === "Paid" ||
      !billing.due_date ||
      !Number.isFinite(balance) ||
      balance <= 0
    ) return totals;

    const overdueDays = Math.floor(
      (readingTime - Date.parse(`${billing.due_date}T00:00:00Z`)) / 86_400_000,
    );
    if (overdueDays >= 90) totals.over_90_days += balance;
    else if (overdueDays >= 60) totals.over_60_days += balance;
    else if (overdueDays >= 30) totals.over_30_days += balance;
    return totals;
  }, { over_30_days: 0, over_60_days: 0, over_90_days: 0 });
};

const buildReadingContext = (consumer, records, billings, readingDate, options = {}) => {
  const { openIncident = null, averageWindow = 3 } = options;
  const billingByConsumption = new Map(
    billings.map((billing) => [billing.consumption_id, billing]),
  );
  const latest = records[0] ?? null;
  const selectedMonthReading = records.find(
    (record) => monthKey(record.reading_date) === monthKey(readingDate),
  ) ?? null;
  const selectedMonthBilling = selectedMonthReading
    ? billingByConsumption.get(selectedMonthReading.id) ?? null
    : null;
  const latestBilling = latest ? billingByConsumption.get(latest.id) ?? null : null;
  const arrears = calculateArrears(billings, selectedMonthBilling?.id, readingDate);
  const currentMonth = monthKey(readingDate);
  const recentConsumptions = records
    .filter((record) => (record.reading_source ?? "actual") === "actual")
    .filter((record) => Number(record.carried_consumption ?? 0) === 0)
    .filter((record) => monthKey(record.reading_date) !== currentMonth)
    .slice(0, averageWindow)
    .map((record) => Number(record.consumption))
    // A month with no usage says nothing about typical usage, and including it
    // drags the average down (0, 22 and 20 would average 14 instead of 21).
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageConsumption = recentConsumptions.length
    ? recentConsumptions.reduce((total, value) => total + value, 0) / recentConsumptions.length
    : null;
  const hasReadingInSelectedMonth = Boolean(selectedMonthReading);
  const hasReadingTodayOrLater = Boolean(
    latest?.reading_date && latest.reading_date >= readingDate,
  );
  const canRecord = consumer.status === "active"
    && consumer.purok_no != null
    && !hasReadingInSelectedMonth
    && !hasReadingTodayOrLater;
  const recordingBlockReason = hasReadingInSelectedMonth
    ? "A reading is already recorded for the current month."
    : hasReadingTodayOrLater
      ? `The latest reading is dated ${latest.reading_date}; another reading cannot be recorded today.`
      : consumer.status !== "active"
        ? "The consumer account is inactive."
        : consumer.purok_no == null
          ? "Assign the consumer to a purok before recording."
          : null;

  return {
    consumer_id: consumer.id,
    consumer_name: consumerDisplayName(consumer),
    purok_no: consumer.purok_no,
    status: consumer.status,
    has_previous_record: Boolean(latest),
    latest_reading_id: latest?.id ?? null,
    latest_reading_date: latest?.reading_date ?? null,
    latest_reading_source: latest?.reading_source ?? "actual",
    latest_created_at: latest?.created_at ?? latestBilling?.created_at ?? null,
    latest_previous_reading: latest ? Number(latest.previous_reading) : null,
    latest_present_reading: latest ? Number(latest.present_reading) : null,
    latest_consumption: latest ? Number(latest.consumption) : null,
    latest_carried_consumption: latest ? Number(latest.carried_consumption ?? 0) : null,
    average_recent_consumption: averageConsumption == null
      ? null
      : Number(averageConsumption.toFixed(2)),
    average_window: averageWindow,
    average_sample_count: recentConsumptions.length,
    open_incident: openIncident
      ? {
          id: openIncident.id,
          incident_type: openIncident.incidentType,
          effective_date: openIncident.effectiveDate,
          prior_usage: openIncident.priorUsage,
          prior_usage_basis: openIncident.priorUsageBasis,
          new_baseline: openIncident.newBaseline,
          new_meter_serial: openIncident.newMeterSerial,
          expires_at: openIncident.expiresAt,
          status: openIncident.status,
        }
      : null,
    has_reading_in_selected_month: hasReadingInSelectedMonth,
    can_record: canRecord,
    recording_block_reason: recordingBlockReason,
    current_month_receipt: selectedMonthReading ? {
      reading_id: selectedMonthReading.id,
      reading_date: selectedMonthReading.reading_date,
      created_at: selectedMonthReading.created_at ?? selectedMonthBilling?.created_at ?? null,
      previous_reading: Number(selectedMonthReading.previous_reading),
      present_reading: Number(selectedMonthReading.present_reading),
      consumption: Number(selectedMonthReading.consumption),
      reading_source: selectedMonthReading.reading_source ?? "actual",
      carried_consumption: Number(selectedMonthReading.carried_consumption ?? 0),
      new_baseline: selectedMonthReading.new_baseline == null ? null : Number(selectedMonthReading.new_baseline),
      meter_incident_id: selectedMonthReading.meter_incident_id ?? null,
      baseline_bill: Number(selectedMonthBilling?.total_bill ?? 0),
      billing_id: selectedMonthBilling?.id ?? null,
      due_date: selectedMonthBilling?.due_date ?? null,
      ...arrears,
    } : null,
  };
};

export const getConsumptionRecordingContexts = async () => {
  const normalizedDate = parseReadingDate(currentReadingDate());
  const [
    { data: consumers, error: consumerError },
    { data: readings, error: readingQueryError },
    { data: billings, error: billingQueryError },
    openIncidents,
    averageWindow,
  ] =
    await Promise.all([
      fetchAllPages(() => supabase
        .from("consumers")
        .select("id, first_name, middle_name, last_name, purok_no, status")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .order("id", { ascending: true })),
      fetchAllPages(() => supabase
        .from("consumption")
        .select("id, consumer_id, reading_date, previous_reading, present_reading, consumption, reading_source, carried_consumption, prior_usage_basis, new_baseline, meter_incident_id, created_at")
        .order("reading_date", { ascending: false })
        .order("id", { ascending: false })),
      fetchAllPages(() => supabase
        .from("billing")
        .select("id, consumption_id, user_id, total_bill, remaining_balance, status, due_date, created_at")
        .order("id", { ascending: true })),
      listOpenIncidents(),
      getAverageWindowMonths(),
    ]);

  if (consumerError) {
    throw readingError(`Failed to retrieve consumers: ${consumerError.message}`, 500);
  }
  if (readingQueryError) {
    throw readingError(`Failed to retrieve reading contexts: ${readingQueryError.message}`, 500);
  }
  if (billingQueryError) {
    throw readingError(`Failed to retrieve reading billings: ${billingQueryError.message}`, 500);
  }

  const readingsByConsumer = new Map();
  (readings ?? []).forEach((record) => {
    const records = readingsByConsumer.get(record.consumer_id) ?? [];
    records.push(record);
    readingsByConsumer.set(record.consumer_id, records);
  });
  const billingsByConsumer = new Map();
  (billings ?? []).forEach((billing) => {
    const records = billingsByConsumer.get(billing.user_id) ?? [];
    records.push(billing);
    billingsByConsumer.set(billing.user_id, records);
  });
  const openIncidentByConsumer = new Map(
    (openIncidents ?? []).map((incident) => [incident.consumerId, incident]),
  );

  return (consumers ?? []).map((consumer) =>
    buildReadingContext(
      consumer,
      readingsByConsumer.get(consumer.id) ?? [],
      billingsByConsumer.get(consumer.id) ?? [],
      normalizedDate,
      {
        openIncident: openIncidentByConsumer.get(consumer.id) ?? null,
        averageWindow,
      },
    ));
};

export const getConsumptionRecordingContext = async (consumerId) => {
  const parsedConsumerId = Number(consumerId);
  const normalizedDate = parseReadingDate(currentReadingDate());
  if (!Number.isInteger(parsedConsumerId) || parsedConsumerId < 1) {
    throw readingError("A valid consumer ID is required.");
  }

  const [
    { data: consumer, error: consumerError },
    { data: readings, error: readingQueryError },
    { data: billings, error: billingQueryError },
    openIncidents,
    averageWindow,
  ] =
    await Promise.all([
      supabase
        .from("consumers")
        .select("id, first_name, middle_name, last_name, purok_no, status")
        .eq("id", parsedConsumerId)
        .maybeSingle(),
      fetchAllPages(() => supabase
        .from("consumption")
        .select("id, consumer_id, reading_date, previous_reading, present_reading, consumption, reading_source, carried_consumption, prior_usage_basis, new_baseline, meter_incident_id, created_at")
        .eq("consumer_id", parsedConsumerId)
        .order("reading_date", { ascending: false })
        .order("id", { ascending: false })),
      fetchAllPages(() => supabase
        .from("billing")
        .select("id, consumption_id, user_id, total_bill, remaining_balance, status, due_date, created_at")
        .eq("user_id", parsedConsumerId)
        .order("id", { ascending: true })),
      listOpenIncidents(),
      getAverageWindowMonths(),
    ]);

  if (consumerError || readingQueryError || billingQueryError) {
    throw readingError(
      `Failed to retrieve recording context: ${(consumerError ?? readingQueryError ?? billingQueryError).message}`,
      500,
    );
  }
  if (!consumer) throw readingError("Consumer account not found.", 404);

  return buildReadingContext(
    consumer,
    readings ?? [],
    billings ?? [],
    normalizedDate,
    {
      openIncident: (openIncidents ?? []).find((incident) => incident.consumerId === parsedConsumerId) ?? null,
      averageWindow,
    },
  );
};

export const getAllConsumptionReadings = async () => {
  const records = await fetchConsumptionRecords();

  return records
    .map((record) => {
      const consumer = Array.isArray(record.consumers)
        ? record.consumers[0]
        : record.consumers;

      return {
        id: record.id,
        consumer_id: record.consumer_id,
        consumer_name: consumerDisplayName(consumer),
        purok_no: consumer?.purok_no ?? null,
        reading_date: record.reading_date,
        previous_reading: record.previous_reading,
        present_reading: record.present_reading,
        consumption: record.consumption,
        reading_source: record.reading_source ?? "actual",
        carried_consumption: record.carried_consumption ?? 0,
        prior_usage_basis: record.prior_usage_basis ?? null,
        new_baseline: record.new_baseline ?? null,
        meter_incident_id: record.meter_incident_id ?? null,
      };
    })
    .sort((a, b) => {
      const dateComparison = String(b.reading_date).localeCompare(
        String(a.reading_date),
      );
      return dateComparison || Number(b.id) - Number(a.id);
    });
};

export const getConsumptionByConsumer = async (consumerId) => {
  const parsedConsumerId = Number(consumerId);
  if (!Number.isInteger(parsedConsumerId) || parsedConsumerId < 1) {
    throw readingError("A valid consumer ID is required.");
  }

  const { data, error } = await supabase
    .from("consumption")
    .select(
      "id, consumer_id, reading_date, previous_reading, present_reading, consumption, reading_source, carried_consumption, prior_usage_basis, new_baseline, meter_incident_id, created_at, updated_at"
    )
    .eq("consumer_id", parsedConsumerId)
    .order("reading_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw readingError(
      `Failed to retrieve consumer consumption: ${error.message}`,
      500
    );
  }

  return data ?? [];
};

export const getConsumerPurok = async (consumerId) => {
  const { data, error } = await supabase
    .from("consumers")
    .select("purok_no")
    .eq("id", Number(consumerId))
    .maybeSingle();

  if (error) {
    console.warn("Failed to identify the consumer purok for cache invalidation:", error.message);
    return null;
  }

  return data?.purok_no == null ? null : formatPurok(data.purok_no);
};

export const createConsumptionReading = async ({
  consumerId,
  idempotencyKey,
  initialPreviousReading,
  presentReading,
  readingSource = "actual",
  estimateValue,
  incident,
  recordedById,
  recordedByRole,
}) => {
  const parsedConsumerId = Number(consumerId);
  const source = readingSource === "estimated" ? "estimated" : "actual";

  if (!Number.isInteger(parsedConsumerId) || parsedConsumerId < 1) {
    throw readingError("A valid consumer ID is required.");
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 100) {
    throw readingError("A valid reading request key is required.");
  }

  const parsedPresentReading = presentReading == null || presentReading === ""
    ? null
    : Number(presentReading);
  const parsedInitialPreviousReading = initialPreviousReading == null
    ? null
    : Number(initialPreviousReading);
  const parsedEstimate = estimateValue == null || estimateValue === ""
    ? null
    : Number(estimateValue);

  if (
    source === "actual" &&
    (parsedPresentReading == null || !Number.isFinite(parsedPresentReading) || parsedPresentReading < 0)
  ) {
    throw readingError("Meter readings must be non-negative numbers.");
  }

  if (
    parsedInitialPreviousReading != null &&
    (!Number.isFinite(parsedInitialPreviousReading) || parsedInitialPreviousReading < 0)
  ) {
    throw readingError("Meter readings must be non-negative numbers.");
  }

  if (
    source === "estimated" &&
    (parsedEstimate == null || !Number.isFinite(parsedEstimate) || parsedEstimate <= 0)
  ) {
    throw readingError("An estimate value greater than zero is required.");
  }

  if (
    incident == null &&
    parsedInitialPreviousReading != null &&
    parsedPresentReading != null &&
    parsedPresentReading < parsedInitialPreviousReading
  ) {
    throw readingError("Present reading cannot be lower than the previous reading.");
  }

  let incidentPayload = null;
  if (incident && typeof incident === "object") {
    if (incident.id != null) {
      incidentPayload = {
        id: Number(incident.id),
      };
    } else if (incident.oldFinalReading != null) {
      const recorderId = recordedById ?? incident.recordedById;
      if (!Number.isInteger(Number(recorderId)) || Number(recorderId) < 1) {
        throw readingError("The meter incident must be recorded by an authenticated user.", 401);
      }
      // Re-derive on the server so a tampered field payload cannot change the bill.
      const resolved = await resolveIncidentPriorUsage(parsedConsumerId, {
        oldFinalReading: incident.oldFinalReading == null
          ? null
          : Number(incident.oldFinalReading),
      });
      incidentPayload = {
        incidentType: incident.incidentType ?? "replacement",
        effectiveDate: incident.effectiveDate ?? null,
        oldMeterSerial: incident.oldMeterSerial ?? null,
        oldFinalReading: incident.oldFinalReading ?? null,
        priorUsage: resolved.priorUsage,
        priorUsageBasis: resolved.basis,
        averageWindow: resolved.window,
        averageValue: resolved.averageValue,
        newMeterSerial: incident.newMeterSerial ?? null,
        newBaseline: incident.newBaseline ?? 0,
        notes: incident.notes ?? null,
        idempotencyKey: incident.idempotencyKey ?? `${idempotencyKey.trim()}-incident`,
        recordedById: Number(recorderId),
        recordedByRole: recordedByRole ?? incident.recordedByRole ?? "meter-reader",
      };
    }
  }

  const { data, error } = await supabase.rpc("record_consumption_and_billing", {
    p_consumer_id: parsedConsumerId,
    p_present_reading: source === "estimated" ? null : parsedPresentReading,
    p_initial_previous_reading: parsedInitialPreviousReading,
    p_idempotency_key: idempotencyKey.trim(),
    p_reading_source: source,
    p_estimate_value: source === "estimated" ? parsedEstimate : null,
    p_incident: incidentPayload,
  });

  if (error) {
    const message = error.message ?? "Failed to create meter reading.";
    if (
      error.hint === "METER_RESET_REQUIRED" ||
      /below the previous baseline|meter incident is required/i.test(message)
    ) {
      throw readingError(message, 409, "METER_RESET_REQUIRED");
    }
    const statusCode = error.code === "23505" || /already has|already used|open meter incident/i.test(message)
      ? 409
      : error.code === "23503" || /not found/i.test(message)
        ? 404
        : /required|cannot|inactive|assign the consumer|later than|only be supplied|negative|not valid|requires at least/i.test(message)
          ? 400
          : 500;
    throw readingError(message, statusCode);
  }

  return data;
};
