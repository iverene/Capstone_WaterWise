export const ACCOUNT_STORAGE_KEY = "user";
// Legacy key kept only to scrub pre-cookie sessions. No new tokens are stored;
// auth is HttpOnly cookie-only (waterwise_session set by backend).
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
  // Cookie-only: never expose a readable token. Return null so callers rely
  // on HttpOnly cookie. Legacy stored tokens are ignored (scrubbed on write).
  return null;
}

export function getAccessTokenExpiresAt() {
  // No readable JWT in cookie-only mode — backend 401 handles expiry.
  return null;
}

export function storeSession({ user }) {
  const previousUser = getStoredAccount();
  if (previousUser && (previousUser.id !== user?.id || previousUser.role !== user?.role)) {
    clearStoredApiCache();
    // A different account must never inherit the previous account's pending
    // OTP challenges or staff permissions (same-tab login switching).
    clearStoredOtpState();
  }
  // Cookie-only: backend Set-Cookie carries the session. Scrub any legacy
  // readable token so Session Storage never holds accessToken again.
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore.
  }
  window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(user));
  try {
    window.sessionStorage.setItem("waterwise:last-activity-at", String(Date.now()));
    window.sessionStorage.removeItem("waterwise:session-inactive");
  } catch {
    // Activity tracking is best-effort; backend idle enforcement still applies.
  }
  window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
  window.localStorage.removeItem(PERSISTENT_CONSUMER_KEY);
  window.dispatchEvent(new Event("waterwise-session-changed"));
}

export function enableConsumerPushSessionPersistence() {
  // Session-cookie-only: persistence disabled. Kept as no-op for compat.
  // Push subscriptions remain stored server-side; session still ends on tab close.
  try {
    window.localStorage.setItem(CONSUMER_PUSH_SESSION_ENABLED_KEY, "true");
  } catch {
    // Ignore.
  }
  return Boolean(getStoredAccount()?.role === "consumer");
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
  // Pending OTP challenges and staff permissions are bound to the signed-in
  // account. They must not survive logout, otherwise the next login on the
  // same tab restores the previous account's OTP modal state.
  clearStoredOtpState();
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

// OTP challenges and staff permissions persisted for page reloads. Every key
// listed here is bound to the account that requested it.
const OTP_SESSION_KEYS = [
  "waterwise:password-otp-challenge",
  "waterwise:email-change-otp-challenge",
  "waterwise:super-admin-staff-otp",
  "waterwise:super-admin-settings-otp",
  "waterwise:super-admin-staff-permission",
  "waterwise:super-admin-settings-permission",
];

export function clearStoredOtpState() {
  for (const key of OTP_SESSION_KEYS) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Storage failures must not block logout or account switching.
    }
  }
}

export function getStoredAccount() {
  // One-time scrub: remove legacy readable tokens from pre-cookie sessions.
  try {
    if (window.sessionStorage.getItem(TOKEN_STORAGE_KEY)) {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
    window.localStorage.removeItem(PERSISTENT_CONSUMER_KEY);
  } catch {
    // Ignore storage failures.
  }
  try {
    return JSON.parse(window.sessionStorage.getItem(ACCOUNT_STORAGE_KEY)) ?? getPersistentSession()?.user ?? null;
  } catch {
    return null;
  }
}

export function hasAuthenticatedSession() {
  // Cookie-only: stored account presence = session. Backend 401 handles
  // expiry/inactivity/password-change/deactivation.
  return Boolean(getStoredAccount());
}
