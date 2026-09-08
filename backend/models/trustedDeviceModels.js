import { createHash, randomBytes } from "node:crypto";
import { supabase } from "../config/supabase.js";
import { getTrustedDeviceDays } from "../config/auth.js";

const TRUSTED_DEVICE_COOKIE = "waterwise_admin_device";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export const getTrustedDeviceCookieName = () => TRUSTED_DEVICE_COOKIE;

export const getTrustedDeviceLifetimeMs = (role) =>
  getTrustedDeviceDays(role) * 24 * 60 * 60 * 1000;

export function readCookie(req, name) {
  const header = req.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        // A damaged cookie should require OTP, not fail the login request.
        return "";
      }
    }
  }
  return "";
}

// Primary trust signal is the HttpOnly cookie; the X-Trusted-Device header
// is a fallback for browsers that refuse to persist cookies (blocked
// third-party/first-party cookies, aggressive extensions). Both carry the
// same opaque random token verified against the same hash column.
export function readDeviceToken(req) {
  return readCookie(req, getTrustedDeviceCookieName()) || req.get("x-trusted-device") || "";
}

export function isSecureRequest(req) {
  const forwardedProto = req?.get?.("x-forwarded-proto") ?? "";
  if (forwardedProto) return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
  if (typeof req?.secure === "boolean") return req.secure;
  if (typeof req?.protocol === "string") return req.protocol === "https";
  return process.env.NODE_ENV === "production";
}

export function trustedDeviceCookieOptions(role, req) {
  const secure = isSecureRequest(req);
  const options = {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: getTrustedDeviceLifetimeMs(role),
    path: "/",
  };
  // CHIPS: allow the cross-site (Vercel frontend -> hosted backend) trust
  // cookie to persist when third-party cookies are partitioned (Chrome).
  // Plain HTTP localhost ignores it; HTTPS browsers enforce Secure + SameSite=None with it.
  if (secure) options.partitioned = true;
  return options;
}

export async function createTrustedDevice({ adminId, role, userAgent }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + getTrustedDeviceLifetimeMs(role));
  const { error } = await supabase.from("admin_trusted_devices").insert({
    admin_id: adminId,
    token_hash: hashToken(token),
    role,
    user_agent: String(userAgent ?? "").slice(0, 500) || null,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw new Error(`Failed to trust this device: ${error.message}`);
  return { token, expiresAt };
}

export async function verifyTrustedDevice({ token, adminId, role }) {
  if (!token || !getTrustedDeviceLifetimeMs(role)) return false;

  const now = new Date();
  const { data, error } = await supabase
    .from("admin_trusted_devices")
    .select("id, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .eq("admin_id", adminId)
    .eq("role", role)
    .maybeSingle();

  if (error) throw new Error(`Failed to verify this device: ${error.message}`);
  if (!data || data.revoked_at || new Date(data.expires_at) <= now) return false;

  const { error: updateError } = await supabase
    .from("admin_trusted_devices")
    .update({ last_used_at: now.toISOString() })
    .eq("id", data.id);
  if (updateError) throw new Error(`Failed to update this device: ${updateError.message}`);
  return true;
}

export async function revokeAdminTrustedDevices(adminId) {
  const { error } = await supabase
    .from("admin_trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("admin_id", adminId)
    .is("revoked_at", null);
  if (error) throw new Error(`Failed to revoke trusted devices: ${error.message}`);
}

export async function listAdminTrustedDevices({ adminId, currentToken }) {
  const { data, error } = await supabase
    .from("admin_trusted_devices")
    .select("id, token_hash, user_agent, created_at, last_used_at, expires_at")
    .eq("admin_id", adminId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_used_at", { ascending: false });

  if (error) throw new Error(`Failed to load trusted devices: ${error.message}`);
  const currentHash = currentToken ? hashToken(currentToken) : "";
  return (data ?? []).map(({ token_hash: tokenHash, user_agent: userAgent, created_at: createdAt, last_used_at: lastUsedAt, expires_at: expiresAt, ...device }) => ({
    ...device,
    userAgent,
    createdAt,
    lastUsedAt,
    expiresAt,
    isCurrent: Boolean(currentHash) && tokenHash === currentHash,
  }));
}

export async function revokeTrustedDevice({ adminId, deviceId, currentToken }) {
  const { data, error } = await supabase
    .from("admin_trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", deviceId)
    .eq("admin_id", adminId)
    .is("revoked_at", null)
    .select("token_hash")
    .maybeSingle();

  if (error) throw new Error(`Failed to revoke trusted device: ${error.message}`);
  if (!data) {
    const error = new Error("Trusted device not found.");
    error.statusCode = 404;
    throw error;
  }
  return { revokedCurrentDevice: Boolean(currentToken) && data.token_hash === hashToken(currentToken) };
}

export async function revokeOtherTrustedDevices({ adminId, currentToken }) {
  if (!currentToken) {
    const error = new Error("This browser is not currently a trusted device.");
    error.statusCode = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from("admin_trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("admin_id", adminId)
    .is("revoked_at", null)
    .neq("token_hash", hashToken(currentToken))
    .select("id");
  if (error) throw new Error(`Failed to revoke other trusted devices: ${error.message}`);
  return data?.length ?? 0;
}
