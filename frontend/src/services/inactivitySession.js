import { apiRequest } from "./apiClient";
import { clearSession, getAccessToken } from "./authToken";

export const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
// Backwards-compatible static export; prefer getInactivityTimeoutMs() which
// returns the backend-fetched value once loaded.
export const INACTIVITY_TIMEOUT_MS = DEFAULT_INACTIVITY_TIMEOUT_MS;
const TIMEOUT_STORAGE_KEY = "waterwise:inactivity-timeout-ms";
const LAST_ACTIVITY_KEY = "waterwise:last-activity-at";
const INACTIVE_FLAG_KEY = "waterwise:session-inactive";
const ACTIVITY_BROADCAST_KEY = "waterwise:activity-broadcast";

let cachedTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS;
let configFetchInFlight = null;
let lastPingAt = 0;
let pingInFlight = null;

function sanitizeTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 10 * 1000 || parsed > 12 * 60 * 60 * 1000) return null;
  return Math.floor(parsed);
}

try {
  const stored = sanitizeTimeout(window.sessionStorage.getItem(TIMEOUT_STORAGE_KEY));
  if (stored) cachedTimeoutMs = stored;
} catch {
  // Storage unavailable; keep the default until the backend config loads.
}

export function getInactivityTimeoutMs() {
  return cachedTimeoutMs;
}

export function formatInactivityDuration(timeoutMs = cachedTimeoutMs) {
  const minutes = Math.round(timeoutMs / 60000);
  if (minutes < 1) return `${Math.round(timeoutMs / 1000)} seconds`;
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function rememberTimeout(timeoutMs) {
  cachedTimeoutMs = timeoutMs;
  try {
    window.sessionStorage.setItem(TIMEOUT_STORAGE_KEY, String(timeoutMs));
  } catch {
    // Best-effort cache only.
  }
}

export function fetchInactivityTimeout() {
  if (configFetchInFlight) return configFetchInFlight;
  configFetchInFlight = (async () => {
    try {
      const result = await apiRequest("/auth/session-config", { method: "GET" });
      const timeout = sanitizeTimeout(result?.inactivityTimeoutMs);
      if (timeout) rememberTimeout(timeout);
    } catch {
      // Offline or backend unavailable: keep the cached/default timeout.
      // Backend 401 enforcement still applies with the server-side value.
    } finally {
      configFetchInFlight = null;
    }
    return cachedTimeoutMs;
  })();
  return configFetchInFlight;
}

export function getLastLocalActivity() {
  try {
    const stored = Number(window.sessionStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function initLocalActivity(timestamp = Date.now()) {
  try {
    if (!window.sessionStorage.getItem(LAST_ACTIVITY_KEY)) {
      window.sessionStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
    }
  } catch {
    // Storage unavailable; the guard falls back to backend 401 enforcement.
  }
  return getLastLocalActivity() ?? timestamp;
}

export function clearLocalActivity() {
  try {
    window.sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Ignore storage failures during logout.
  }
  lastPingAt = 0;
  pingInFlight = null;
}

export function markInactiveSession() {
  try {
    window.sessionStorage.setItem(INACTIVE_FLAG_KEY, "1");
    window.sessionStorage.setItem("waterwise:session-expired", "1");
  } catch {
    // Storage may be disabled; the login page still loads without the notice.
  }
}

export function consumeInactiveFlag() {
  try {
    const flag = window.sessionStorage.getItem(INACTIVE_FLAG_KEY) === "1";
    if (flag) {
      window.sessionStorage.removeItem(INACTIVE_FLAG_KEY);
      window.sessionStorage.removeItem("waterwise:session-expired");
    }
    return flag;
  } catch {
    return false;
  }
}

function broadcastActivity(timestamp) {
  try {
    window.localStorage.setItem(ACTIVITY_BROADCAST_KEY, String(timestamp));
  } catch {
    // Broadcast is best-effort across tabs.
  }
}

function getPingThrottleMs() {
  return Math.min(60 * 1000, Math.max(10 * 1000, Math.floor(cachedTimeoutMs / 3)));
}

async function pingBackendActivity() {
  if (!getAccessToken()) return;
  const now = Date.now();
  if (now - lastPingAt < getPingThrottleMs()) return;
  if (pingInFlight) return;
  lastPingAt = now;
  pingInFlight = (async () => {
    try {
      await apiRequest("/auth/activity", { method: "POST" });
    } catch {
      // A failed ping must not log the user out; the next authenticated
      // request either succeeds (session alive) or returns 401 (idle).
      lastPingAt = 0;
    } finally {
      pingInFlight = null;
    }
  })();
  return pingInFlight;
}

export function touchLocalActivity(timestamp = Date.now()) {
  if (!getAccessToken()) return timestamp;
  try {
    window.sessionStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  } catch {
    // Ignore storage failures; backend enforcement still applies.
  }
  broadcastActivity(timestamp);
  void pingBackendActivity();
  window.dispatchEvent(new CustomEvent("waterwise:activity", { detail: timestamp }));
  return timestamp;
}

export function getIdleMs(now = Date.now()) {
  const last = getLastLocalActivity();
  if (!last) return 0;
  return Math.max(0, now - last);
}

export function handleInactivityLogout(reason = "inactivity") {
  if (reason === "inactivity") markInactiveSession();
  else {
    try {
      window.sessionStorage.setItem("waterwise:session-expired", "1");
    } catch {
      // Ignore.
    }
  }
  clearLocalActivity();
  clearSession();
  window.location.assign("/login");
}
