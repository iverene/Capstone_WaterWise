import { getDeviceFingerprint } from "./fingerprint.js";

// Mirror of the main frontend's base-URL logic (apiClient.js):
// relative "/api" by default (dev proxy / Vercel rewrite), absolute Render
// URL when VITE_API_URL is set (direct cross-origin, SameSite=None cookies).
function resolveApiBaseUrl(value) {
  const baseUrl = (value || "/api").trim().replace(/\/+$/, "");

  // Accept either the Render service root or its complete /api URL.
  if (baseUrl === "/api" || /\/api$/i.test(baseUrl)) {
    return baseUrl;
  }

  return `${baseUrl}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL,
);

// Minimal same-origin API client (relies on vite proxy /api -> backend).
// Cookie session is HttpOnly; fingerprint header is the CSRF protection.
export async function api(path, { method = "GET", body } = {}) {
  let fingerprint = "";
  try {
    fingerprint = await getDeviceFingerprint();
  } catch {
    // Best-effort; backend enforces only when a fingerprint is enrolled.
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
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
