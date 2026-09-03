import { createHash, randomBytes } from "node:crypto";
import { supabase } from "../config/supabase.js";

const TRUSTED_DEVICE_COOKIE = "waterwise_admin_device";
const ROLE_TRUST_DAYS = {
  "super-admin": 7,
  admin: 15,
};

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export const getTrustedDeviceCookieName = () => TRUSTED_DEVICE_COOKIE;

export const getTrustedDeviceLifetimeMs = (role) =>
  (ROLE_TRUST_DAYS[role] ?? 0) * 24 * 60 * 60 * 1000;

export function readCookie(req, name) {
  const header = req.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return "";
}

export function trustedDeviceCookieOptions(role) {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: getTrustedDeviceLifetimeMs(role),
    path: "/api/auth",
  };
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
