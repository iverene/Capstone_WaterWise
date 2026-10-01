import { supabase } from "../config/supabase.js";

const TABLE = "user_device_sessions";

export async function addDeviceFingerprint(userId, role, fingerprintHash, deviceInfo = {}) {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { user_id: userId, role, fingerprint_hash: fingerprintHash, device_info: deviceInfo, last_used_at: new Date().toISOString() },
      { onConflict: "user_id,role,fingerprint_hash", ignoreDuplicates: false },
    );
  if (error) throw error;
}

export async function getDeviceFingerprints(userId, role) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("fingerprint_hash, last_used_at")
    .eq("user_id", userId)
    .eq("role", role);
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
