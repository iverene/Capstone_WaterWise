import { supabase } from "../config/supabase.js";
import { getSystemSetting } from "./systemSettingsModels.js";

const INCIDENT_FIELDS = `
  id, consumer_id, incident_type, effective_date,
  old_meter_serial, old_final_reading,
  prior_usage, prior_usage_basis, average_window, average_value,
  new_meter_serial, new_baseline,
  status, review_status, source,
  recorded_by_id, recorded_by_role, approved_by_id, approved_at,
  rejected_reason, expires_at, notes, created_at, updated_at
`;

const createError = (message, statusCode = 400, code = null) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const toNumberOrNull = (value) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const round2 = (value) => Number(Number(value).toFixed(2));

export const normalizeIncident = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    consumerId: row.consumer_id,
    consumerName: row.consumer_name ?? null,
    incidentType: row.incident_type,
    effectiveDate: row.effective_date,
    oldMeterSerial: row.old_meter_serial,
    oldFinalReading: toNumberOrNull(row.old_final_reading),
    priorUsage: Number(row.prior_usage ?? 0),
    priorUsageBasis: row.prior_usage_basis,
    averageWindow: row.average_window ?? null,
    averageValue: toNumberOrNull(row.average_value),
    newMeterSerial: row.new_meter_serial,
    newBaseline: Number(row.new_baseline ?? 0),
    status: row.status,
    reviewStatus: row.review_status,
    source: row.source,
    recordedById: row.recorded_by_id,
    recordedByRole: row.recorded_by_role,
    approvedById: row.approved_by_id,
    approvedAt: row.approved_at,
    rejectedReason: row.rejected_reason,
    expiresAt: row.expires_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const manilaMonthKey = (value = new Date()) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 7);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}`;
};

/**
 * True when the consumer already has a reading for the current Manila month.
 * Logging an incident after that reading means its carried usage lands on the
 * NEXT bill, so the API warns instead of letting the value move silently.
 */
const readingAlreadyRecordedThisMonth = async (consumerId) => {
  const { data, error } = await supabase
    .from("consumption")
    .select("reading_date")
    .eq("consumer_id", consumerId)
    .order("reading_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.reading_date) return false;
  return manilaMonthKey(data.reading_date) === manilaMonthKey();
};

const lateIncidentWarning =
  "A reading is already recorded for this month, so the old meter's usage will be added to the next reading instead.";

export async function getAverageWindowMonths() {
  try {
    const setting = await getSystemSetting("average_window_months");
    const months = Number(setting?.setting_value);
    return Number.isInteger(months) && months > 0 ? months : 3;
  } catch {
    return 3;
  }
}

export async function listMeterIncidents({ status, consumerId, limit = 200 } = {}) {
  let query = supabase
    .from("meter_incidents")
    .select(INCIDENT_FIELDS)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 200, 500));

  if (status) query = query.eq("status", status);
  if (consumerId) query = query.eq("consumer_id", Number(consumerId));

  const { data, error } = await query;
  if (error) {
    throw createError(`Failed to retrieve meter incidents: ${error.message}`, 500);
  }
  return (data ?? []).map(normalizeIncident);
}

export async function getMeterIncident(id) {
  const incidentId = Number(id);
  if (!Number.isInteger(incidentId) || incidentId < 1) {
    throw createError("A valid meter incident ID is required.");
  }

  const { data, error } = await supabase
    .from("meter_incidents")
    .select(INCIDENT_FIELDS)
    .eq("id", incidentId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve the meter incident: ${error.message}`, 500);
  }
  if (!data) throw createError("Meter incident not found.", 404);
  return normalizeIncident(data);
}

export async function getConsumerIncidentHistory(consumerId) {
  const { data, error } = await supabase
    .from("meter_incidents")
    .select(INCIDENT_FIELDS)
    .eq("consumer_id", Number(consumerId))
    .order("effective_date", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve the meter history: ${error.message}`, 500);
  }
  return (data ?? []).map(normalizeIncident);
}

export async function getOpenIncidentForConsumer(consumerId) {
  const { data, error } = await supabase
    .from("meter_incidents")
    .select(INCIDENT_FIELDS)
    .eq("consumer_id", Number(consumerId))
    .in("status", ["pending", "authorized"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve the open meter incident: ${error.message}`, 500);
  }
  return normalizeIncident(data);
}

const assertConsumer = async (consumerId) => {
  const { data, error } = await supabase
    .from("consumers")
    .select("id, status, purok_no")
    .eq("id", consumerId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to load the consumer: ${error.message}`, 500);
  }
  if (!data) throw createError("Consumer account not found.", 404);
  if ((data.status ?? "active") !== "active") {
    throw createError("Meter incidents can only be logged for an active consumer.", 400);
  }
  return data;
};

const latestRecordedReading = async (consumerId) => {
  const { data, error } = await supabase
    .from("consumption")
    .select("present_reading, consumption")
    .eq("consumer_id", Number(consumerId))
    .order("reading_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to load the previous reading: ${error.message}`, 500);
  }
  return data
    ? {
        presentReading: Number(data.present_reading),
        consumption: round2(Math.max(Number(data.consumption ?? 0), 0)),
      }
    : null;
};

/**
 * Resolve the old-meter usage carried into the next reading.
 *
 * Positive movement uses the closing-reading difference. An unchanged or lower
 * closing value carries the consumer's latest completed consumption.
 */
export async function resolveIncidentPriorUsage(
  consumerId,
  { oldFinalReading = null } = {},
) {
  if (oldFinalReading == null) {
    throw createError("Enter the old meter closing reading.");
  }

  const latest = await latestRecordedReading(consumerId);
  if (latest == null) {
    return {
      priorUsage: round2(oldFinalReading),
      basis: "final_reading",
      averageValue: null,
      window: null,
      lastRecordedReading: null,
    };
  }

  const derived = round2(oldFinalReading - latest.presentReading);
  if (derived <= 0) {
    return {
      priorUsage: latest.consumption,
      basis: "previous_consumption",
      averageValue: null,
      window: null,
      lastRecordedReading: latest.presentReading,
    };
  }
  return {
    priorUsage: derived,
    basis: "final_reading",
    averageValue: null,
    window: null,
    lastRecordedReading: latest.presentReading,
  };
}

const normalizeIncidentType = (value, fallback = "replacement") => {
  const type = String(value ?? fallback);
  if (!["replacement", "reset", "defective"].includes(type)) {
    throw createError("Unsupported meter incident type.");
  }
  return type;
};

const isAdminActor = (actor) => actor?.role === "admin" || actor?.role === "super-admin";

export async function createMeterIncident(payload, actor) {
  const consumerId = Number(payload.consumerId);
  if (!Number.isInteger(consumerId) || consumerId < 1) {
    throw createError("A valid consumer ID is required.");
  }
  await assertConsumer(consumerId);

  const incidentType = normalizeIncidentType(payload.incidentType);

  const newBaseline = toNumberOrNull(payload.newBaseline);
  if (newBaseline == null || newBaseline < 0) {
    throw createError("A non-negative new meter baseline is required.");
  }

  const oldFinalReading = toNumberOrNull(payload.oldFinalReading);
  if (oldFinalReading != null && oldFinalReading < 0) {
    throw createError("The old meter final reading cannot be negative.");
  }

  const resolved = await resolveIncidentPriorUsage(consumerId, {
    oldFinalReading,
  });

  if (resolved.priorUsage == null || resolved.priorUsage < 0) {
    throw createError("Prior usage is required. Enter the old meter closing reading.");
  }

  const isField = !isAdminActor(actor);
  // A meter replacement is an inventory fact recorded by the office or the
  // field reader. There is no separate approval gate; the next reading applies it.
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("meter_incidents")
    .insert({
      consumer_id: consumerId,
      incident_type: incidentType,
      effective_date: payload.effectiveDate || new Date().toISOString().slice(0, 10),
      old_meter_serial: payload.oldMeterSerial || null,
      old_final_reading: oldFinalReading,
      prior_usage: round2(resolved.priorUsage),
      prior_usage_basis: resolved.basis,
      average_window: resolved.window,
      average_value: resolved.averageValue,
      new_meter_serial: payload.newMeterSerial || null,
      new_baseline: round2(newBaseline),
      status: "authorized",
      review_status: "approved",
      source: isField ? "meter_reader" : "admin",
      recorded_by_id: actor.id,
      recorded_by_role: actor.role,
      approved_by_id: isAdminActor(actor) ? actor.id : null,
      approved_at: isAdminActor(actor) ? now : null,
      // An authorized replacement stays usable until a reading consumes it,
      // no matter how late the next scheduled visit is.
      expires_at: null,
      notes: payload.notes || null,
      idempotency_key: payload.idempotencyKey || null,
    })
    .select(INCIDENT_FIELDS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError(
        "This consumer already has an open meter incident. Update or close it before logging another.",
        409,
        "INCIDENT_OPEN",
      );
    }
    throw createError(`Failed to log the meter incident: ${error.message}`, 500);
  }

  const incident = normalizeIncident(data);
  if (round2(resolved.priorUsage) > 0 && await readingAlreadyRecordedThisMonth(consumerId)) {
    incident.warning = lateIncidentWarning;
  }
  return incident;
}

/**
 * Correct an open incident. Admins use this to fix a meter reader's log before
 * the next reading consumes it. The conditional update below prevents a reading
 * that applies the incident at the same time from being overwritten.
 */
export async function updateMeterIncident(id, payload, actor) {
  const incident = await getMeterIncident(id);

  if (!["pending", "authorized"].includes(incident.status)) {
    throw createError(
      "Only an open incident can be corrected. A consumed incident is already part of a bill.",
      409,
    );
  }

  // A reading may have consumed the incident between the status check above and
  // the update below. The linked reading is the authoritative lock.
  const { data: appliedReading, error: appliedError } = await supabase
    .from("consumption")
    .select("id")
    .eq("meter_incident_id", incident.id)
    .maybeSingle();
  if (appliedError) {
    throw createError(`Failed to check the linked reading: ${appliedError.message}`, 500);
  }
  if (appliedReading) {
    throw createError(
      "This replacement is already part of a reading and can no longer be corrected.",
      409,
    );
  }

  const isField = !isAdminActor(actor);
  if (isField && incident.source !== "meter_reader") {
    throw createError("Only the reader who declared this incident can update it.", 403);
  }

  const consumerId = incident.consumerId;
  const incidentType = payload.incidentType
    ? normalizeIncidentType(payload.incidentType)
    : incident.incidentType;

  const oldFinalReading = payload.oldFinalReading === undefined
    ? incident.oldFinalReading
    : toNumberOrNull(payload.oldFinalReading);
  if (oldFinalReading != null && oldFinalReading < 0) {
    throw createError("The old meter final reading cannot be negative.");
  }

  const newBaseline = payload.newBaseline === undefined
    ? incident.newBaseline
    : toNumberOrNull(payload.newBaseline);
  if (newBaseline == null || newBaseline < 0) {
    throw createError("A non-negative new meter baseline is required.");
  }

  const resolved = await resolveIncidentPriorUsage(consumerId, {
    oldFinalReading,
  });

  // This is an inventory correction, not a new approval request. The next
  // reading still applies the latest values automatically.
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("meter_incidents")
    .update({
      incident_type: incidentType,
      effective_date: payload.effectiveDate || incident.effectiveDate,
      old_meter_serial: payload.oldMeterSerial === undefined
        ? incident.oldMeterSerial
        : (payload.oldMeterSerial || null),
      old_final_reading: oldFinalReading,
      prior_usage: round2(resolved.priorUsage),
      prior_usage_basis: resolved.basis,
      average_window: resolved.window,
      average_value: resolved.averageValue,
      new_meter_serial: payload.newMeterSerial === undefined
        ? incident.newMeterSerial
        : (payload.newMeterSerial || null),
      new_baseline: round2(newBaseline),
      status: "authorized",
      review_status: "approved",
      approved_by_id: incident.approvedById ?? (isAdminActor(actor) ? actor.id : null),
      approved_at: incident.approvedAt ?? (isAdminActor(actor) ? now : null),
      expires_at: null,
      notes: payload.notes ?? incident.notes,
      updated_at: now,
    })
    .eq("id", incident.id)
    .in("status", ["pending", "authorized"])
    .select(INCIDENT_FIELDS)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to correct the meter incident: ${error.message}`, 500);
  }
  if (!data) {
    throw createError(
      "This replacement is already part of a reading and can no longer be corrected.",
      409,
    );
  }
  const updated = normalizeIncident(data);
  if (round2(resolved.priorUsage) > 0 && await readingAlreadyRecordedThisMonth(consumerId)) {
    updated.warning = lateIncidentWarning;
  }
  return updated;
}

/** Open (not yet applied) incidents for every consumer, for the bulk recording context. */
export async function listOpenIncidents() {
  const { data, error } = await supabase
    .from("meter_incidents")
    .select(INCIDENT_FIELDS)
    .in("status", ["pending", "authorized"])
    .order("created_at", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve open meter incidents: ${error.message}`, 500);
  }
  return (data ?? []).map(normalizeIncident);
}
