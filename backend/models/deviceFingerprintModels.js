import { supabase } from "../config/supabase.js";

const TABLE = "user_device_sessions";

export async function addDeviceFingerprint(userId, role, fingerprintHash, deviceInfo = {}, expiresAt = null) {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: userId, role, fingerprint_hash: fingerprintHash, device_info: deviceInfo, last_used_at: new Date().toISOString(), ...(expiresAt ? { expires_at: expiresAt } : {}) },
      { onConflict: "user_id,role,fingerprint_hash", ignoreDuplicates: false },
    );
  if (error) throw error;
}

export async function getDeviceFingerprints(userId, role) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("fingerprint_hash, last_used_at")
    .eq("user_id", userId)
    .eq("role", role)
    // Expired (or never-enrolled-expiry) rows are not trusted devices.
    // NULL expires_at never satisfies gt(), so legacy rows fail closed.
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return data || [];
}

export async function hasDeviceFingerprint(userId, role, fingerprintHash) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("role", role)
    .eq("fingerprint_hash", fingerprintHash)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function touchDeviceFingerprint(userId, role, fingerprintHash) {
  const { error } = await supabase
    .from(TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("role", role)
    .eq("fingerprint_hash", fingerprintHash);
  if (error) throw error;
}

export async function removeDeviceFingerprint(userId, role, fingerprintHash) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("role", role)
    .eq("fingerprint_hash", fingerprintHash);
  if (error) throw error;
}

export async function removeAllDeviceFingerprints(userId, role) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  if (error) throw error;
}

// Daily janitor: permanently remove rows whose device trust already
// expired. Auth already rejects these rows via the expires_at filter, so
// deletion only reclaims storage — it never changes an auth decision.
export async function deleteExpiredDeviceFingerprints() {
  const { error, count } = await supabase
    .from(TABLE)
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}
