import { isSecureRequest, readCookie } from "./trustedDeviceModels.js";

const SESSION_COOKIE = "waterwise_session";
const REFRESH_COOKIE = "waterwise_refresh";

export const getSessionCookieName = () => SESSION_COOKIE;
export const getRefreshCookieName = () => REFRESH_COOKIE;

export function readSessionToken(req) {
  return readCookie(req, SESSION_COOKIE) || "";
}

export function readRefreshToken(req) {
  return readCookie(req, REFRESH_COOKIE) || "";
}

export function refreshCookieOptions(req, maxAgeMs) {
  return sessionCookieOptions(req, maxAgeMs);
}

export function sessionCookieOptions(req, maxAgeMs) {
  const secure = isSecureRequest(req);
  const options = {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
  };
  // CHIPS partitioned to match trusted-device cookie on cross-site HTTPS.
  // Plain HTTP localhost ignores it; HTTPS browsers enforce Secure + SameSite=None with it.
  if (secure) options.partitioned = true;
  // Meter-reader PWA: persistent cookie so closing/clearing the tab does not
  // drop the session. Bounded by the 8h JWT expiry. Other roles stay
  // session-only (no maxAge/expires).
  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
    options.maxAge = Math.floor(maxAgeMs);
    options.expires = new Date(Date.now() + Math.floor(maxAgeMs));
  }
  return options;
}

// A browser only honours a clear whose attributes match the ones used when
// the cookie was set, so each cookie is cleared twice: once with the current
// request flavour and once with the secure/sameSite pair flipped. That covers
// the CHIPS partitioned variant and the plain HTTP one.
export function clearRefreshCookie(res, req) {
  const options = sessionCookieOptions(req);
  res.clearCookie(REFRESH_COOKIE, options);
  const flipped = { ...options, secure: !options.secure, sameSite: options.secure ? "lax" : "none" };
  if (flipped.secure) flipped.partitioned = true;
  else delete flipped.partitioned;
  res.clearCookie(REFRESH_COOKIE, flipped);
}

export function clearSessionCookie(res, req) {
  const options = sessionCookieOptions(req);
  res.clearCookie(SESSION_COOKIE, options);
  const flipped = { ...options, secure: !options.secure, sameSite: options.secure ? "lax" : "none" };
  if (flipped.secure) flipped.partitioned = true;
  else delete flipped.partitioned;
  res.clearCookie(SESSION_COOKIE, flipped);
}
