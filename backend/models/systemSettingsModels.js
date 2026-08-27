import { supabase } from "../config/supabase.js";

const SETTINGS_FIELDS = "id, setting_key, setting_value, description, created_at, updated_at";

export async function getSystemSetting(key) {
  const { data, error } = await supabase
    .from("system_settings")
    .select(SETTINGS_FIELDS)
    .eq("setting_key", key)
    .single();

  if (error) throw error;
  return data;
}

export async function getAllSystemSettings() {
  const { data, error } = await supabase
    .from("system_settings")
    .select(SETTINGS_FIELDS)
    .order("setting_key");

  if (error) throw error;
  return data;
}

export async function updateSystemSetting(key, value, updatedBy) {
  const { data, error } = await supabase
    .from("system_settings")
    .update({ setting_value: value, updated_at: new Date().toISOString() })
    .eq("setting_key", key)
    .select(SETTINGS_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function getRatePerCubicMeter() {
  const setting = await getSystemSetting("rate_per_cubic_meter");
  return Number(setting.setting_value);
}
