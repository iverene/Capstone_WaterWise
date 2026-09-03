import { apiRequest } from "./apiClient";
import { getStoredAccount } from "./authToken";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

function formatDate(value) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : "";
}

export async function fetchMeterReaderProfile(options) {
  const user = getStoredAccount();
  if (!user || user.role !== "meter-reader") {
    throw new Error("An authenticated meter reader account is required.");
  }
  const payload = await apiRequest(`/meter-readers/${user.id}`, options);
  const reader = payload.data;

  return {
    accountId: reader.id,
    name: reader.username,
    username: reader.username,
    email: reader.email,
    status: reader.status,
    accountCreatedDate: formatDate(String(reader.created_at ?? "").slice(0, 10)),
  };
}
