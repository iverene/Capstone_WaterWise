import apiClient from "./apiClient";

const client = {
  get: (path, options) => apiClient.get(`/consumers${path}`, options),
  post: (path, payload, options) =>
    apiClient.post(`/consumers${path}`, payload, options),
  patch: (path, payload, options) =>
    apiClient.patch(`/consumers${path}`, payload, options),
};

function composeDisplayName(firstName, middleName, lastName, fallback = "") {
  return [firstName, middleName, lastName]
    .map((part) => String(part ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ") || fallback;
}

function splitLegacyFullName(fullName) {
  const parts = String(fullName ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
}

function normalizeConsumer(consumer) {
  if (!consumer) return null;
  const split = {
    firstName: consumer.first_name ?? "",
    middleName: consumer.middle_name ?? "",
    lastName: consumer.last_name ?? "",
  };
  const legacy = consumer.first_name === undefined ? splitLegacyFullName(consumer.full_name) : null;
  const firstName = legacy?.firstName ?? split.firstName;
  const middleName = legacy?.middleName ?? split.middleName;
  const lastName = legacy?.lastName ?? split.lastName;
  const displayName = composeDisplayName(firstName, middleName, lastName, consumer.full_name ?? "");
  return {
    ...consumer,
    firstName,
    middleName,
    lastName,
    accountName: consumer.username ?? "",
    consumerName: displayName,
    consumerNo: String(consumer.id ?? ""),
    fullName: displayName,
    contactNumber: consumer.contact_number ?? "",
    purok: consumer.purok_no != null ? `Purok ${consumer.purok_no}` : "Unassigned",
    status: consumer.status ?? "active",
  };
}

function toConsumerPayload(consumer, includePassword = false, includeStatus = false) {
  const purokNo = Number(String(consumer.purok ?? "").replace(/\D/g, ""));
  const legacy = consumer.firstName === undefined ? splitLegacyFullName(consumer.fullName) : null;
  return {
    username: consumer.accountName,
    firstName: String(legacy?.firstName ?? consumer.firstName ?? "").trim(),
    middleName: String(legacy?.middleName ?? consumer.middleName ?? "").trim(),
    lastName: String(legacy?.lastName ?? consumer.lastName ?? "").trim(),
    email: consumer.email,
    contactNumber: consumer.contactNumber,
    purokNo: Number.isInteger(purokNo) && purokNo > 0 ? purokNo : null,
    ...(includePassword && consumer.password ? { password: consumer.password } : {}),
    ...(includeStatus ? { status: consumer.status } : {}),
  };
}

export async function fetchConsumerDirectory(options = {}) {
  const response = await client.get("/", options);
  const records = Array.isArray(response.data?.data)
    ? response.data.data
    : Array.isArray(response.data)
      ? response.data
      : [];
  return records.map(normalizeConsumer).filter(Boolean);
}

export async function createConsumer(consumer, options = {}) {
  const response = await client.post("/", toConsumerPayload(consumer, true), options);

  return response.data?.data ? normalizeConsumer(response.data.data) : null;
}

export async function updateConsumer(id, consumer, options = {}) {
  const { passwordAuthorization, ...requestOptions } = options;
  const response = await client.patch(`/${id}`, toConsumerPayload(consumer, true, true), {
    ...requestOptions,
    headers: {
      ...requestOptions.headers,
      ...(passwordAuthorization ? { "X-Consumer-Password-Authorization": passwordAuthorization } : {}),
    },
  });
  return response.data?.data ? normalizeConsumer(response.data.data) : null;
}

export async function disconnectFlaggedConsumer(id, options = {}) {
  const response = await client.post(`/${id}/disconnect`, {}, options);
  return response.data?.data ? normalizeConsumer(response.data.data) : null;
}

export async function requestConsumerPasswordOtp(consumerId) {
  const response = await apiClient.post("/auth/admin/consumer-password/otp", { consumerId });
  return response.data;
}

export async function verifyConsumerPasswordOtp(challengeToken, otp) {
  const response = await apiClient.post("/auth/admin/consumer-password/verify", { challengeToken, otp });
  return response.data;
}
