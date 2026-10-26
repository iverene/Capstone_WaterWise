import apiClient from "./apiClient";

const client = {
  get: (path, options) => apiClient.get(`/consumption${path}`, options),
  post: (path, payload, options) =>
    apiClient.post(`/consumption${path}`, payload, options),
};

function normalizeMeterReadings(records) {
  return Array.isArray(records)
    ? records.map((record) => ({
        id: record.id,
        consumerNo: String(record.consumer_id ?? ""),
        consumerName: record.consumer_name ?? "Unknown consumer",
        purok:
          record.purok_no != null
            ? `Purok ${record.purok_no}`
            : "Unassigned",
        previousReading: Number(record.previous_reading ?? 0),
        currentReading: Number(record.present_reading ?? 0),
        consumption: Number(record.consumption ?? 0),
        readingSource: record.reading_source ?? "actual",
        carriedConsumption: Number(record.carried_consumption ?? 0),
        readingDate: record.reading_date,
        status: "Recorded",
      }))
    : [];
}

function normalizeRecordingContext(record) {
  const receipt = record.current_month_receipt;
  const todayParts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(new Date());
  const todayValue = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const today = `${todayValue.year}-${todayValue.month}-${todayValue.day}`;
  const hasReadingInSelectedMonth = Boolean(record.has_reading_in_selected_month);
  const latestReadingDate = record.latest_reading_date ?? null;
  const fallbackBlockedByDate = Boolean(latestReadingDate && latestReadingDate >= today);
  const openIncident = record.open_incident
    ? {
        id: record.open_incident.id,
        incidentType: record.open_incident.incident_type,
        effectiveDate: record.open_incident.effective_date,
        priorUsage: Number(record.open_incident.prior_usage ?? 0),
        priorUsageBasis: record.open_incident.prior_usage_basis,
        newBaseline: Number(record.open_incident.new_baseline ?? 0),
        newMeterSerial: record.open_incident.new_meter_serial ?? "",
        status: record.open_incident.status,
      }
    : null;
  const canRecord = record.can_record == null
    ? record.status === "active" && record.purok_no != null && !hasReadingInSelectedMonth && !fallbackBlockedByDate
    : Boolean(record.can_record);
  return {
    id: record.consumer_id,
    consumerNo: String(record.consumer_id ?? ""),
    consumerName: record.consumer_name ?? "Unknown consumer",
    purok: record.purok_no != null ? `Purok ${record.purok_no}` : "Unassigned",
    status: record.status ?? "active",
    hasPreviousRecord: Boolean(record.has_previous_record),
    latestReadingId: record.latest_reading_id ?? null,
    latestReadingDate,
    latestCreatedAt: record.latest_created_at ?? null,
    latestPreviousReading: record.latest_previous_reading == null ? null : Number(record.latest_previous_reading),
    latestPresentReading: record.latest_present_reading == null ? null : Number(record.latest_present_reading),
    latestConsumption: record.latest_consumption == null ? null : Number(record.latest_consumption),
    latestReadingSource: record.latest_reading_source ?? "actual",
    averageRecentConsumption: record.average_recent_consumption == null ? null : Number(record.average_recent_consumption),
    averageWindow: Number(record.average_window ?? 3),
    averageSampleCount: Number(record.average_sample_count ?? 0),
    openIncident,
    hasReadingInSelectedMonth,
    canRecord,
    recordingBlockReason: record.recording_block_reason ?? (
      fallbackBlockedByDate
        ? `Latest reading is dated ${latestReadingDate}; recording is unavailable today.`
        : null
    ),
    currentMonthReceipt: receipt ? {
      readingId: receipt.reading_id,
      readingDate: receipt.reading_date,
      createdAt: receipt.created_at,
      previousReading: Number(receipt.previous_reading),
      currentReading: Number(receipt.present_reading),
      consumption: Number(receipt.consumption),
      readingSource: receipt.reading_source ?? "actual",
      carriedConsumption: Number(receipt.carried_consumption ?? 0),
      newBaseline: receipt.new_baseline == null ? null : Number(receipt.new_baseline),
      baselineBill: Number(receipt.baseline_bill),
      billingId: receipt.billing_id,
      dueDate: receipt.due_date,
      arrears30Days: Number(receipt.over_30_days ?? 0),
      arrears60Days: Number(receipt.over_60_days ?? 0),
      arrears90Days: Number(receipt.over_90_days ?? 0),
    } : null,
  };
}

function normalizeCreatedReading(record) {
  return {
    id: record.id,
    consumerId: record.consumer_id,
    createdAt: record.created_at,
    readingDate: record.reading_date,
    previousReading: Number(record.previous_reading),
    currentReading: Number(record.present_reading),
    consumption: Number(record.consumption),
    readingSource: record.reading_source ?? "actual",
    carriedConsumption: Number(record.carried_consumption ?? 0),
    meterIncidentId: record.meter_incident_id ?? null,
    incident: record.incident ?? null,
    billing: record.billing ? {
      ...record.billing,
      totalBill: Number(record.billing.total_bill),
      dueDate: record.billing.due_date,
    } : null,
  };
}

export async function fetchMeterReadings(options = {}) {
  const response = await client.get("/readings", options);
  return normalizeMeterReadings(response.data?.data ?? []);
}

export async function fetchAdminMeterReadings(options = {}) {
  const response = await client.get("/admin/readings", options);
  return normalizeMeterReadings(response.data?.data ?? []);
}

export async function createMeterReading(payload, options = {}) {
  const response = await client.post("/readings", {
    consumerId: Number(payload.consumerId),
    idempotencyKey: payload.idempotencyKey,
    readingSource: payload.readingSource === "estimated" ? "estimated" : "actual",
    presentReading: payload.currentReading == null || payload.currentReading === ""
      ? null
      : Number(payload.currentReading),
    ...(payload.estimateValue != null ? { estimateValue: Number(payload.estimateValue) } : {}),
    ...(payload.initialPreviousReading != null ? { initialPreviousReading: Number(payload.initialPreviousReading) } : {}),
    ...(payload.incident ? { incident: payload.incident } : {}),
  }, options);
  return normalizeCreatedReading(response.data?.data ?? response.data);
}

export async function fetchRecordingContexts(options = {}) {
  const response = await client.get("/readings/contexts", options);
  return Array.isArray(response.data?.data) ? response.data.data.map(normalizeRecordingContext) : [];
}

export async function fetchRecordingContext(consumerId, options = {}) {
  const response = await client.get(`/readings/context/${consumerId}`, options);
  return normalizeRecordingContext(response.data?.data ?? {});
}

export default client;
