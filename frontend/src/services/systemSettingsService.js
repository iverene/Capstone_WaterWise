import { apiRequest } from "./apiClient";
import { withDataChangeClient } from "./dataChangeClient";

export async function fetchSystemSettings(authorizationToken) {
  try {
    return await apiRequest("/system-settings", {
      headers: authorizationToken ? { "X-Staff-Authorization": authorizationToken } : undefined,
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to load system settings.", { cause: error });
  }
}

export async function fetchSystemSetting(key) {
  try {
    return await apiRequest(`/system-settings/${key}`);
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to load the setting.", { cause: error });
  }
}

export async function fetchWaterRateSettings() {
  try {
    const response = await apiRequest("/system-settings/rates");
    return response.data ?? response;
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to load water rate settings.", { cause: error });
  }
}

export async function requestSettingsChangeOtp() {
  try {
    return await apiRequest("/auth/admin/staff-action/otp", {
      method: "POST",
      body: JSON.stringify({ action: "update-system-settings" }),
    });
  } catch (error) {
    const requestError = new Error(error.response?.data?.message ?? "Unable to send the verification code.", { cause: error });
    const retryAfter = Number(error.response?.headers?.["retry-after"] ?? error.response?.data?.retryAfterSeconds);
    if (Number.isFinite(retryAfter) && retryAfter > 0) requestError.retryAfterSeconds = Math.ceil(retryAfter);
    throw requestError;
  }
}

export async function verifySettingsChangeOtp(challengeToken, otp) {
  try {
    return await apiRequest("/auth/admin/staff-action/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, otp }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to verify the code.", { cause: error });
  }
}

export async function updateSystemSetting(key, value, authorizationToken, settingsPermissionToken) {
  try {
    return await apiRequest(`/system-settings/${key}`, withDataChangeClient({
      method: "PATCH",
      body: JSON.stringify({ value }),
      headers: {
        "X-Staff-Authorization": authorizationToken,
        "X-Settings-Permission": settingsPermissionToken,
      },
    }));
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to update the setting.", { cause: error });
  }
}
