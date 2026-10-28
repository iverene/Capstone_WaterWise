import { clearAnalyticsBaselineWarningSession } from "../utils/analyticsBaselineToastSession";

export const ACCOUNT_STORAGE_KEY = "user";
let logoutInProgress = false;
export const isLoggingOut = () => logoutInProgress;
export function beginLogout() {
  logoutInProgress = true;
}
// Legacy key kept only to scrub pre-cookie sessions. No new tokens are stored;
// auth is HttpOnly cookie-only (waterwise_session set by backend).
export const TOKEN_STORAGE_KEY = "accessToken";
const PERSISTENT_METER_READER_KEY = "waterwiseMeterReaderSession";
const PERSISTENT_CONSUMER_KEY = "waterwiseConsumerPushSession";
// 90-day absolute consumer session: minimal identity to restore the tab
// session after close/relaunch so the 5min background refresh can renew the
// 15m access cookie. No token/password stored; refresh cookie proves it.
const CONSUMER_SESSION_KEY = "waterwiseConsumerSession";
const CONSUMER_SESSION_GRACE_MS = 90 * 24 * 60 * 60 * 1000;
const CONSUMER_PUSH_SESSION_ENABLED_KEY = "waterwiseConsumerPushSessionEnabled";
// Offline grace for meter-reader PWA: how long a closed tab / offline relaunch
// may reopen the readings workspace without re-login. No password or token is
// stored here — only a minimal identity {id, role, username} used to scope
// IndexedDB caches and allow offline UI. Server sync still needs the HttpOnly
// cookie session; when online and expired the backend 401 forces re-login.
const METER_READER_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function sanitizeMeterReaderUser(user) {
  if (!user || user.role !== "meter-reader" || user.id == null) return null;
  return { id: user.id, role: "meter-reader" };
}

function writePersistentMeterReader(user) {
  try {
    const safe = sanitizeMeterReaderUser(user);
    if (!safe) {
      window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
      return;
    }
    const now = Date.now();
    window.localStorage.setItem(
      PERSISTENT_METER_READER_KEY,
      JSON.stringify({
        user: safe,
        loginAt: now,
        offlineGraceUntil: now + METER_READER_OFFLINE_GRACE_MS,
      }),
    );
  } catch {
    // Persistence is best-effort; sessionStorage session still works for the tab.
  }
}

export function refreshMeterReaderPersistence(user) {
  if (user?.role === "meter-reader") writePersistentMeterReader(user);
}

export function getPersistentMeterReaderUser() {
  try {
    const raw = window.localStorage.getItem(PERSISTENT_METER_READER_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    const safe = sanitizeMeterReaderUser(session?.user);
    if (!safe) {
      window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
      return null;
    }
    if (JSON.stringify(session.user) !== JSON.stringify(safe)) {
      window.localStorage.setItem(PERSISTENT_METER_READER_KEY, JSON.stringify({ ...session, user: safe }));
    }
    const graceUntil = Number(session?.offlineGraceUntil);
    if (!Number.isFinite(graceUntil) || Date.now() >= graceUntil) {
      window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
      return null;
    }
    return safe;
  } catch {
    return null;
  }
}

function getPersistentMeterReaderSession() {
  const user = getPersistentMeterReaderUser();
  return user ? { user } : null;
}

function sanitizeConsumerUser(user) {
  if (!user || user.role !== "consumer" || user.id == null) return null;
  return { id: user.id, role: "consumer" };
}

function writePersistentConsumer(user) {
  try {
    const safe = sanitizeConsumerUser(user);
    if (!safe) {
      window.localStorage.removeItem(CONSUMER_SESSION_KEY);
      return;
    }
    const now = Date.now();
    window.localStorage.setItem(
      CONSUMER_SESSION_KEY,
      JSON.stringify({ user: safe, loginAt: now, graceUntil: now + CONSUMER_SESSION_GRACE_MS }),
    );
  } catch {
    // Best-effort only.
  }
}

export function getPersistentConsumerUser() {
  try {
    const raw = window.localStorage.getItem(CONSUMER_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    const safe = sanitizeConsumerUser(session?.user);
    if (!safe) {
      window.localStorage.removeItem(CONSUMER_SESSION_KEY);
      return null;
    }
    if (JSON.stringify(session.user) !== JSON.stringify(safe)) {
      window.localStorage.setItem(CONSUMER_SESSION_KEY, JSON.stringify({ ...session, user: safe }));
    }
    const graceUntil = Number(session?.graceUntil);
    if (!Number.isFinite(graceUntil) || Date.now() >= graceUntil) {
      window.localStorage.removeItem(CONSUMER_SESSION_KEY);
      return null;
    }
    return safe;
  } catch {
    return null;
  }
}

export function sanitizeStoredAccount(user) {
  if (!user?.id || !user?.role) return null;
  const safe = { id: user.id, role: user.role };
  if (user.status !== undefined && user.status !== null && user.status !== "") {
    safe.status = user.status;
  }
  return safe;
}

export function storeAccountIdentity(user) {
  const safe = sanitizeStoredAccount(user);
  if (!safe) return null;
  window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(safe));
  return safe;
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
  logoutInProgress = false;
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
  storeAccountIdentity(user);
  try {
    window.sessionStorage.setItem("waterwise:last-activity-at", String(Date.now()));
    window.sessionStorage.removeItem("waterwise:session-inactive");
  } catch {
    // Activity tracking is best-effort; backend idle enforcement still applies.
  }
  // Meter-reader PWA: persist minimal identity (no token/password) so closing
  // the tab / reopening the installed PWA offline restores the workspace.
  // Consumers persist the same minimal identity for the 90-day absolute
  // session so the background refresh can renew access after relaunch.
  // Other roles stay session-only.
  if (user?.role === "meter-reader") {
    writePersistentMeterReader(user);
  } else {
    try {
      window.localStorage.removeItem(PERSISTENT_METER_READER_KEY);
    } catch {
      // Ignore.
    }
  }
  if (user?.role === "consumer") {
    writePersistentConsumer(user);
  } else {
    try {
      window.localStorage.removeItem(CONSUMER_SESSION_KEY);
    } catch {
      // Ignore.
    }
  }
  try {
    window.localStorage.removeItem(PERSISTENT_CONSUMER_KEY);
  } catch {
    // Ignore.
  }
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
    window.localStorage.getItem(CONSUMER_SESSION_KEY) ||
    window.localStorage.getItem(PERSISTENT_CONSUMER_KEY),
  );
  clearStoredApiCache();
  clearAnalyticsBaselineWarningSession();
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
  try {
    window.localStorage.removeItem(CONSUMER_SESSION_KEY);
  } catch {
    // Ignore.
  }
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
  // NOTE: do NOT scrub the meter-reader persistent identity here — it must
  // survive tab close / PWA relaunch for offline recording.
  try {
    if (window.sessionStorage.getItem(TOKEN_STORAGE_KEY)) {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    // This obsolete format could contain a readable token and a full
    // consumer profile. Current cookie-based sessions never use it.
    window.localStorage.removeItem(PERSISTENT_CONSUMER_KEY);
  } catch {
    // Ignore storage failures.
  }
  try {
    const live = window.sessionStorage.getItem(ACCOUNT_STORAGE_KEY);
    const account = live ? JSON.parse(live) : null;
    const safe = sanitizeStoredAccount(account);
    if (safe) {
      if (JSON.stringify(account) !== JSON.stringify(safe)) {
        window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(safe));
      }
      return safe;
    }
  } catch {
    // A damaged tab cache must not block restoration from localStorage.
  }
  // Tab was closed / PWA relaunched: restore meter-reader tab session from
  // the persistent minimal identity (if within 7-day offline grace) so guards
  // and IndexedDB scopes see the same account id.
  const persistent = getPersistentMeterReaderSession();
  if (persistent?.user) {
    try {
      storeAccountIdentity(persistent.user);
    } catch {
      // Best-effort restore; callers still get the user below.
    }
    return persistent.user;
  }
  const persistentConsumer = getPersistentConsumerUser();
  if (persistentConsumer) {
    try {
      storeAccountIdentity(persistentConsumer);
    } catch {
      // Best-effort restore.
    }
    return persistentConsumer;
  }
  return null;
}

export function hasAuthenticatedSession() {
  // Cookie-only: stored account presence = session. Backend 401 handles
  // expiry/inactivity/password-change/deactivation.
  return Boolean(getStoredAccount());
}
