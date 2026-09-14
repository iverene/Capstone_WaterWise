import { isSecureRequest, readCookie } from "./trustedDeviceModels.js";

const SESSION_COOKIE = "waterwise_session";

export const getSessionCookieName = () => SESSION_COOKIE;

export function readSessionToken(req) {
  return readCookie(req, SESSION_COOKIE) || "";
}

export function sessionCookieOptions(req) {
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
  // Session cookie only: no maxAge/expires so it dies with the browser session.
  return options;
}
