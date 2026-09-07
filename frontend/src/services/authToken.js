export const ACCOUNT_STORAGE_KEY = "user";
export const TOKEN_STORAGE_KEY = "accessToken";
const PERSISTENT_METER_READER_KEY = "waterwiseMeterReaderSession";
const PERSISTENT_CONSUMER_KEY = "waterwiseConsumerPushSession";
const CONSUMER_PUSH_SESSION_ENABLED_KEY = "waterwiseConsumerPushSessionEnabled";

function getPersistentMeterReaderSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(PERSISTENT_METER_READER_KEY));
    return session?.user?.role === "meter-reader" && session.token ? session : null;
  } catch {
    return null;
  }
}

function getPersistentConsumerSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(PERSISTENT_CONSUMER_KEY));
    return session?.user?.role === "consumer" && session.token ? session : null;
  } catch {
    return null;
  }
}

function getPersistentSession() {
  return getPersistentMeterReaderSession() ?? getPersistentConsumerSession();
}

export function getAccessToken() {
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? getPersistentSession()?.token ?? null;
}

export function getAccessTokenExpiresAt(token = getAccessToken()) {
  try {
    if (!token) return null;
    const encodedPayload = token.split(".")[1];
    const normalizedPayload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(paddedPayload));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function storeSession({ token, user }) {
  const previousUser = getStoredAccount();
  if (previousUser && (previousUser.id !== user?.id || previousUser.role !== user?.role)) {
    clearStoredApiCache();
  }
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(user));
  try {
    window.sessionStorage.setItem("waterwise:last-activity-at", String(Date.now()));
    window.sessionStorage.removeItem("waterwise:session-inactive");
  } catch {
    // Activity tracking is best-effort; backend idle enforcement still applies.
  }
  if (user?.role === "meter-reader") {
    window.localStorage.setItem(PERSISTENT_METER_READER_KEY, JSON.stringify({ token, user }));
  } else {
    window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
  }
  if (user?.role === "consumer" && window.localStorage.getItem(CONSUMER_PUSH_SESSION_ENABLED_KEY) === "true") {
    window.localStorage.setItem(PERSISTENT_CONSUMER_KEY, JSON.stringify({ token, user }));
  } else {
    window.localStorage.removeItem(PERSISTENT_CONSUMER_KEY);
  }
  window.dispatchEvent(new Event("waterwise-session-changed"));
}

export function enableConsumerPushSessionPersistence() {
  const token = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  const user = JSON.parse(window.sessionStorage.getItem(ACCOUNT_STORAGE_KEY) ?? "null");
  if (!token || user?.role !== "consumer") return false;
  window.localStorage.setItem(CONSUMER_PUSH_SESSION_ENABLED_KEY, "true");
  window.localStorage.setItem(PERSISTENT_CONSUMER_KEY, JSON.stringify({ token, user }));
  return true;
}

export function disableConsumerPushSessionPersistence() {
  window.localStorage.removeItem(CONSUMER_PUSH_SESSION_ENABLED_KEY);
  window.localStorage.removeItem(PERSISTENT_CONSUMER_KEY);
}

export function clearSession() {
  const hadSession = Boolean(
    window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ||
    window.sessionStorage.getItem(ACCOUNT_STORAGE_KEY) ||
    window.localStorage.getItem(PERSISTENT_METER_READER_KEY) ||
    window.localStorage.getItem(PERSISTENT_CONSUMER_KEY),
  );
  clearStoredApiCache();
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(ACCOUNT_STORAGE_KEY);
  try {
    window.sessionStorage.removeItem("waterwise:last-activity-at");
  } catch {
    // Ignore storage failures during logout.
  }
  window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
  disableConsumerPushSessionPersistence();
  if (hadSession) {
    window.queueMicrotask(() => {
      window.dispatchEvent(new Event("waterwise-session-changed"));
    });
  }
}

function clearStoredApiCache() {
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith("waterwise-api-cache:")) window.sessionStorage.removeItem(key);
  }
}

export function getStoredAccount() {
  try {
    return JSON.parse(window.sessionStorage.getItem(ACCOUNT_STORAGE_KEY)) ?? getPersistentSession()?.user ?? null;
  } catch {
    return null;
  }
}

export function hasAuthenticatedSession() {
  const token = getAccessToken();
  const expiresAt = getAccessTokenExpiresAt(token);
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    clearSession();
    return false;
  }
  return Boolean(getStoredAccount());
}
