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

export async function getAuthorizationDays() {
  try {
    const setting = await getSystemSetting("incident_authorization_days");
    const days = Number(setting?.setting_value);
    return Number.isInteger(days) && days > 0 ? days : 30;
  } catch {
    return 30;
  }
}

/**
 * Average prior usage from the consumer's most recent ACTUAL readings.
 * Estimated and incident rows are excluded so the average cannot feed on itself.
 */
export async function getAveragePriorUsage(consumerId, window = 3) {
  const { data, error } = await supabase
    .from("consumption")
    .select("consumption, reading_date, reading_source, carried_consumption")
    .eq("consumer_id", Number(consumerId))
    .order("reading_date", { ascending: false })
    .limit(Math.max(window * 3, 12));

  if (error) {
    throw createError(`Failed to load consumption history: ${error.message}`, 500);
  }

  const currentMonth = manilaMonthKey();
  const rows = (data ?? []).filter((row) => {
    if ((row.reading_source ?? "actual") !== "actual") return false;
    if (Number(row.carried_consumption ?? 0) > 0) return false;
    if (manilaMonthKey(row.reading_date) === currentMonth) return false;
    const value = Number(row.consumption);
    // A month with no usage says nothing about typical usage, and including it
    // drags the average down (0, 22 and 20 would average 14 instead of 21).
    return Number.isFinite(value) && value > 0;
  });

  const sample = rows.slice(0, window);
  const average = sample.length
    ? round2(sample.reduce((total, row) => total + Number(row.consumption), 0) / sample.length)
    : null;

  return { average, sampleCount: sample.length, window };
}

export async function listMeterIncidents({ status, reviewStatus, consumerId, limit = 200 } = {}) {
  let query = supabase
    .from("meter_incidents")
    .select(INCIDENT_FIELDS)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 200, 500));

  if (status) query = query.eq("status", status);
  if (reviewStatus) query = query.eq("review_status", reviewStatus);
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
    .neq("review_status", "rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve the open meter incident: ${error.message}`, 500);
  }
  return normalizeIncident(data);
}

/**
 * Payment hold: true while a field-declared incident still needs review.
 * Admin-created incidents are approved on creation, so they never hold payment.
 */
export async function hasPendingIncident(consumerId) {
  const { data, error } = await supabase
    .from("meter_incidents")
    .select("id")
    .eq("consumer_id", Number(consumerId))
    .eq("review_status", "pending")
    .in("status", ["pending", "authorized", "consumed"])
    .limit(1);

  if (error) {
    throw createError(`Failed to verify meter incidents: ${error.message}`, 500);
  }
  return Boolean(data?.length);
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
    .select("present_reading")
    .eq("consumer_id", Number(consumerId))
    .order("reading_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to load the previous reading: ${error.message}`, 500);
  }
  return data ? Number(data.present_reading) : null;
};

/**
 * Resolve the old-meter usage carried into the next reading.
 *
 * The closing reading always wins because it is the only measured value. The
 * system average is the default when the meter was replaced without one, and a
 * reported volume is the last resort. Callers cannot invent a number while an
 * authoritative source exists, so the API and the field reader share one rule.
 */
export async function resolveIncidentPriorUsage(
  consumerId,
  { oldFinalReading = null, priorUsageBasis = "average", suppliedUsage = null, allowOverride = true } = {},
) {
  const window = await getAverageWindowMonths();
  const basis = ["final_reading", "reported", "average"].includes(priorUsageBasis)
    ? priorUsageBasis
    : "average";

  if (oldFinalReading != null) {
    const latest = await latestRecordedReading(consumerId);
    if (latest == null) {
      // First digital record: the closing reading is the whole carried volume.
      return {
        priorUsage: round2(oldFinalReading),
        basis: "final_reading",
        averageValue: null,
        window,
        lastRecordedReading: null,
      };
    }
    const derived = round2(oldFinalReading - latest);
    if (derived < 0) {
      throw createError(
        "The old meter final reading cannot be lower than the last recorded reading.",
      );
    }
    return {
      priorUsage: derived,
      basis: "final_reading",
      averageValue: null,
      window,
      lastRecordedReading: latest,
    };
  }

  if (basis === "reported") {
    if (suppliedUsage == null || suppliedUsage < 0) {
      throw createError("Enter the volume reported by the resident or the field staff.");
    }
    return {
      priorUsage: round2(suppliedUsage),
      basis,
      averageValue: null,
      window,
      lastRecordedReading: null,
    };
  }

  const computed = await getAveragePriorUsage(consumerId, window);

  if (basis === "average") {
    if (computed.average != null) {
      if (allowOverride && suppliedUsage != null) {
        // An explicit override is allowed for admins, but the system average is
        // still stored so auto-authorization can prove the value was untouched.
        return {
          priorUsage: round2(suppliedUsage),
          basis,
          averageValue: computed.average,
          window,
          lastRecordedReading: null,
        };
      }
      return {
        priorUsage: computed.average,
        basis,
        averageValue: computed.average,
        window,
        lastRecordedReading: null,
      };
    }
    if (suppliedUsage != null) {
      // Fewer than two actual readings: treat the typed volume as reported.
      return {
        priorUsage: round2(suppliedUsage),
        basis: "reported",
        averageValue: null,
        window,
        lastRecordedReading: null,
      };
    }
    throw createError(
      "Not enough actual readings to compute an average. Enter the old meter closing reading or the reported volume.",
    );
  }

  // basis === "final_reading" but no closing reading was supplied.
  if (suppliedUsage != null) {
    return {
      priorUsage: round2(suppliedUsage),
      basis: "reported",
      averageValue: null,
      window,
      lastRecordedReading: null,
    };
  }
  throw createError("Enter the old meter closing reading.");
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
    priorUsageBasis: payload.priorUsageBasis,
    suppliedUsage: toNumberOrNull(payload.priorUsage),
    allowOverride: isAdminActor(actor),
  });

  if (resolved.priorUsage == null || resolved.priorUsage < 0) {
    throw createError(
      "Prior usage is required. Enter the closing reading or record enough actual readings for an average.",
    );
  }

  const isField = !isAdminActor(actor);
  // Strict policy: anything a field declaration carries is money the resident
  // will be billed for, so an admin reviews it and payments stay on hold. Only a
  // declaration that carries nothing is approved on the spot.
  const nothingCarried = round2(resolved.priorUsage) === 0 && round2(newBaseline) === 0;
  const approved = !isField || nothingCarried;
  const authorizationDays = await getAuthorizationDays();

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
      status: approved ? "authorized" : "pending",
      review_status: approved ? "approved" : "pending",
      source: isField ? "meter_reader" : "admin",
      recorded_by_id: actor.id,
      recorded_by_role: actor.role,
      approved_by_id: isField ? null : actor.id,
      approved_at: approved ? new Date().toISOString() : null,
      // An approved incident is a fact about the meter: it stays usable until a
      // reading consumes it, no matter how late the next scheduled visit is.
      // Only an unreviewed incident expires.
      expires_at: approved
        ? null
        : new Date(Date.now() + authorizationDays * 86_400_000).toISOString(),
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
 * Update an open incident. This is how the same household moves from
 * "defective / stalled" (no meter swap yet) to "replacement" (swap done) without
 * logging a second incident and breaking the one-open-incident rule.
 */
export async function updateMeterIncident(id, payload, actor) {
  const incident = await getMeterIncident(id);

  if (!["pending", "authorized"].includes(incident.status)) {
    throw createError(
      "Only an open incident can be updated. A consumed incident is already part of a bill.",
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
    priorUsageBasis: payload.priorUsageBasis ?? incident.priorUsageBasis,
    suppliedUsage: toNumberOrNull(payload.priorUsage),
    allowOverride: !isField,
  });

  // A reader edit that changes what will be billed goes back to the admin.
  const billChanging =
    round2(resolved.priorUsage) !== round2(incident.priorUsage) ||
    round2(newBaseline) !== round2(incident.newBaseline);
  const nothingCarried = round2(resolved.priorUsage) === 0 && round2(newBaseline) === 0;
  const approved = isField
    ? nothingCarried || (incident.reviewStatus === "approved" && !billChanging)
    : true;

  const authorizationDays = await getAuthorizationDays();

  const { data, error } = await supabase
    .from("meter_incidents")
    .update({
      incident_type: incidentType,
      effective_date: payload.effectiveDate || incident.effectiveDate,
      old_meter_serial: payload.oldMeterSerial ?? incident.oldMeterSerial,
      old_final_reading: oldFinalReading,
      prior_usage: round2(resolved.priorUsage),
      prior_usage_basis: resolved.basis,
      average_window: resolved.window,
      average_value: resolved.averageValue,
      new_meter_serial: payload.newMeterSerial ?? incident.newMeterSerial,
      new_baseline: round2(newBaseline),
      status: approved ? "authorized" : "pending",
      review_status: approved ? "approved" : "pending",
      approved_by_id: approved ? incident.approvedById : null,
      approved_at: approved ? incident.approvedAt : null,
      expires_at: approved
        ? null
        : new Date(Date.now() + authorizationDays * 86_400_000).toISOString(),
      notes: payload.notes ?? incident.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select(INCIDENT_FIELDS)
    .single();

  if (error) {
    throw createError(`Failed to update the meter incident: ${error.message}`, 500);
  }
  const updated = normalizeIncident(data);
  if (round2(resolved.priorUsage) > 0 && await readingAlreadyRecordedThisMonth(consumerId)) {
    updated.warning = lateIncidentWarning;
  }
  return updated;
}

export async function approveMeterIncident(id, actor) {
  const incident = await getMeterIncident(id);
  if (incident.reviewStatus === "approved") return incident;
  if (incident.reviewStatus === "rejected") {
    throw createError("A rejected incident cannot be approved.", 409);
  }

  const { data, error } = await supabase
    .from("meter_incidents")
    .update({
      review_status: "approved",
      status: incident.status === "pending" ? "authorized" : incident.status,
      approved_by_id: actor.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select(INCIDENT_FIELDS)
    .single();

  if (error) {
    throw createError(`Failed to approve the meter incident: ${error.message}`, 500);
  }
  return normalizeIncident(data);
}

export async function rejectMeterIncident(id, actor, reason) {
  const incident = await getMeterIncident(id);
  if (incident.status === "consumed") {
    throw createError(
      "This incident already produced a reading. Void the unpaid bill first, then re-record the reading.",
      409,
    );
  }
  if (incident.reviewStatus === "rejected") return incident;

  const { data, error } = await supabase
    .from("meter_incidents")
    .update({
      review_status: "rejected",
      status: "rejected",
      rejected_reason: reason || null,
      approved_by_id: actor.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select(INCIDENT_FIELDS)
    .single();

  if (error) {
    throw createError(`Failed to reject the meter incident: ${error.message}`, 500);
  }
  return normalizeIncident(data);
}

export async function expireMeterIncidents() {
  const { data, error } = await supabase
    .from("meter_incidents")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .in("status", ["pending", "authorized"])
    // Only incidents nobody reviewed expire. An approved incident is a fact
    // about the meter and must survive until a reading consumes it, otherwise
    // a pre-authorized replacement silently dies before the next scheduled visit.
    .eq("review_status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) return { expired: 0, error: error.message };
  return { expired: data?.length ?? 0 };
}

export async function countPendingIncidents() {
  const { count, error } = await supabase
    .from("meter_incidents")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "pending");

  if (error) return 0;
  return count ?? 0;
}

/** Open (not yet applied) incidents for every consumer, for the bulk recording context. */
export async function listOpenIncidents() {
  const { data, error } = await supabase
    .from("meter_incidents")
    .select(INCIDENT_FIELDS)
    .in("status", ["pending", "authorized"])
    .neq("review_status", "rejected")
    .order("created_at", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve open meter incidents: ${error.message}`, 500);
  }
  return (data ?? []).map(normalizeIncident);
}

/** Consumer IDs whose field-declared incident still needs review (payment hold). */
export async function listPendingReviewConsumerIds() {
  const { data, error } = await supabase
    .from("meter_incidents")
    .select("consumer_id")
    .eq("review_status", "pending")
    .in("status", ["pending", "authorized", "consumed"]);

  if (error) {
    throw createError(`Failed to retrieve pending meter incidents: ${error.message}`, 500);
  }
  return [...new Set((data ?? []).map((row) => row.consumer_id))];
}
