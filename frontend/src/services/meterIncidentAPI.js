import apiClient from "./apiClient";
import { withDataChangeClient } from "./dataChangeClient";

const client = {
  get: (path, options) => apiClient.get(`/meter-incidents${path}`, options),
  post: (path, payload, options) => apiClient.post(`/meter-incidents${path}`, payload, options),
  patch: (path, payload, options) => apiClient.patch(`/meter-incidents${path}`, payload, options),
};

function normalizeIncident(incident) {
  if (!incident) return null;
  return {
    id: incident.id,
    consumerId: incident.consumerId,
    consumerName: incident.consumerName ?? null,
    incidentType: incident.incidentType,
    effectiveDate: incident.effectiveDate,
    oldMeterSerial: incident.oldMeterSerial ?? "",
    oldFinalReading: incident.oldFinalReading == null ? null : Number(incident.oldFinalReading),
    priorUsage: Number(incident.priorUsage ?? 0),
    priorUsageBasis: incident.priorUsageBasis,
    averageWindow: incident.averageWindow ?? null,
    averageValue: incident.averageValue == null ? null : Number(incident.averageValue),
    newMeterSerial: incident.newMeterSerial ?? "",
    newBaseline: Number(incident.newBaseline ?? 0),
    status: incident.status,
    source: incident.source,
    recordedById: incident.recordedById,
    recordedByRole: incident.recordedByRole,
    notes: incident.notes ?? "",
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    // Present only when the incident was logged after this month's reading.
    warning: incident.warning ?? null,
  };
}

export async function fetchMeterIncidents({ status, consumerId, limit } = {}, options = {}) {
  const response = await client.get("", {
    ...options,
    params: {
      ...(status ? { status } : {}),
      ...(consumerId ? { consumerId } : {}),
      ...(limit ? { limit } : {}),
    },
  });
  return Array.isArray(response.data?.data) ? response.data.data.map(normalizeIncident) : [];
}

export async function fetchConsumerMeterIncidents(consumerId, options = {}) {
  const response = await client.get(`/consumer/${consumerId}`, options);
  return Array.isArray(response.data?.data) ? response.data.data.map(normalizeIncident) : [];
}

const toOptionalNumber = (value) =>
  value === "" || value == null ? undefined : Number(value);

const buildIncidentPayload = (payload) => ({
  consumerId: payload.consumerId == null ? undefined : Number(payload.consumerId),
  incidentType: "replacement",
  effectiveDate: payload.effectiveDate || undefined,
  oldMeterSerial: payload.oldMeterSerial || undefined,
  oldFinalReading: toOptionalNumber(payload.oldFinalReading),
  newMeterSerial: payload.newMeterSerial || undefined,
  newBaseline: payload.newBaseline === "" || payload.newBaseline == null
    ? 0
    : Number(payload.newBaseline),
  notes: payload.notes || undefined,
  idempotencyKey: payload.idempotencyKey || undefined,
});

export async function logMeterIncident(payload, options = {}) {
  const response = await client.post(
    "",
    buildIncidentPayload(payload),
    withDataChangeClient(options),
  );
  return normalizeIncident(response.data?.data);
}

export async function correctMeterIncident(id, payload, options = {}) {
  const closingReading =
    payload.oldFinalReading === "" || payload.oldFinalReading == null
      ? null
      : Number(payload.oldFinalReading);

  const response = await client.patch(
    `/${id}`,
    {
      oldFinalReading: closingReading,
      newMeterSerial: payload.newMeterSerial === "" ? null : payload.newMeterSerial,
      newBaseline:
        payload.newBaseline === "" || payload.newBaseline == null
          ? 0
          : Number(payload.newBaseline),
    },
    withDataChangeClient(options),
  );
  return normalizeIncident(response.data?.data);
}
