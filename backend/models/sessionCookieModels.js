import { isSecureRequest, readCookie } from "./trustedDeviceModels.js";

const SESSION_COOKIE = "waterwise_session";

export const getSessionCookieName = () => SESSION_COOKIE;

export function readSessionToken(req) {
  return readCookie(req, SESSION_COOKIE) || "";
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
