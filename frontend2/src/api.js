import { getDeviceFingerprint } from "./fingerprint.js";

// Minimal same-origin API client (relies on vite proxy /api -> backend).
// Cookie session is HttpOnly; fingerprint header is the CSRF protection.
export async function api(path, { method = "GET", body } = {}) {
  let fingerprint = "";
  try {
    fingerprint = await getDeviceFingerprint();
  } catch {
    // Best-effort; backend enforces only when a fingerprint is enrolled.
  }
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(fingerprint ? { "X-Device-Fingerprint": fingerprint } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.message ?? `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
