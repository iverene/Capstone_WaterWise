import { supabase } from "../config/supabase.js";

const SETTINGS_FIELDS = "id, setting_key, setting_value, description, created_at, updated_at";

export async function getSystemSetting(key) {
  const { data, error } = await supabase
    .from("system_settings")
    .select(SETTINGS_FIELDS)
    .eq("setting_key", key)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const notFound = new Error("Setting not found.");
    notFound.statusCode = 404;
    throw notFound;
  }
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

export async function getWaterRateSettings() {
  const { data, error } = await supabase
    .from("system_settings")
    .select("setting_key, setting_value")
    .in("setting_key", TIER_SETTING_KEYS);

  if (error) throw error;

  return (data ?? []).reduce((settings, setting) => {
    settings[setting.setting_key] = Number(setting.setting_value);
    return settings;
  }, {});
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

export const TIER_SETTING_KEYS = [
  "minimum_charge",
  "minimum_m3",
  "rate_6_15",
  "rate_16_25",
  "rate_26_50",
  "rate_51_up",
];
