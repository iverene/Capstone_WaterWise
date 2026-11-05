import {
  getAllSystemSettings,
  getSystemSetting,
  getWaterRateSettings,
  updateSystemSetting,
} from "../models/systemSettingsModels.js";

export async function listSystemSettings(req, res) {
  try {
    const settings = await getAllSystemSettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("Failed to fetch system settings:", error);
    return res.status(500).json({ success: false, message: "Unable to load system settings." });
  }
}

export async function getSystemSettingByKey(req, res) {
  try {
    const { key } = req.params;
    const setting = await getSystemSetting(key);
    return res.status(200).json({ success: true, data: setting });
  } catch (error) {
    console.error("Failed to fetch system setting:", error);
    const notFound = error.statusCode === 404;
    return res.status(notFound ? 404 : 500).json({
      success: false,
      message: notFound ? "Setting not found." : "Unable to load the setting.",
    });
  }
}

export async function getWaterRateSettingsValues(req, res) {
  try {
    const settings = await getWaterRateSettings();
    return res.status(200).json({
      success: true,
      data: {
        minimumCharge: settings.minimum_charge,
        minimumM3: settings.minimum_m3,
        rate6_15: settings.rate_6_15,
        rate16_25: settings.rate_16_25,
        rate26_50: settings.rate_26_50,
        rate51Up: settings.rate_51_up,
      },
    });
  } catch (error) {
    console.error("Failed to fetch water rate settings:", error);
    return res.status(500).json({ success: false, message: "Unable to load water rate settings." });
  }
}

export async function updateSystemSettingByKey(req, res) {
  try {
    const { key } = req.params;
    const { value } = req.body ?? {};

    if (value === undefined || value === null || value === "") {
      return res.status(400).json({ success: false, message: "A value is required." });
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return res.status(400).json({ success: false, message: "The value must be a non-negative number." });
    }

    const setting = await getSystemSetting(key);
    if (!setting) {
      return res.status(404).json({ success: false, message: "Setting not found." });
    }

    const updated = await updateSystemSetting(key, numericValue, req.user.id);
    return res.status(200).json({ success: true, data: updated, message: `"${key}" updated successfully.` });
  } catch (error) {
    console.error("Failed to update system setting:", error);
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: "Setting not found." });
    }
    return res.status(500).json({ success: false, message: "Unable to update the setting." });
  }
}
