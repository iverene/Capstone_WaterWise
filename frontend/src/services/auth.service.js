import { apiRequest } from "./apiClient";
import {
  ACCOUNT_STORAGE_KEY,
  clearSession,
  getStoredAccount,
  storeSession,
} from "./authToken";
import { disableCurrentPushNotifications } from "./pushNotifications";

export { ACCOUNT_STORAGE_KEY };

export async function login(credentials) {
  try {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (result.token && result.user) storeSession(result);
    return result;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ??
        error.message ??
        "Unable to sign in.",
      { cause: error },
    );
  }
}

export async function verifyAdminLoginOtp(challengeToken, otp) {
  try {
    const result = await apiRequest("/auth/admin/verify-login-otp", {
      method: "POST",
      body: JSON.stringify({ challengeToken, otp }),
    });
    storeSession(result);
    return result;
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to verify the admin sign-in code.", { cause: error });
  }
}

export async function requestPasswordReset(email) {
  try {
    return await apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    const requestError = new Error(error.response?.data?.message ?? "Unable to send the reset email.", { cause: error });
    const retryAfter = Number(error.response?.headers?.["retry-after"]);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      requestError.retryAfterSeconds = Math.ceil(retryAfter);
    }
    throw requestError;
  }
}

export async function verifyPasswordResetOtp(challengeToken, otp) {
  try {
    return await apiRequest("/auth/verify-reset-otp", {
      method: "POST",
      body: JSON.stringify({ challengeToken, otp }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to verify the code.", { cause: error });
  }
}

export async function changePasswordWithCurrent(currentPassword, newPassword) {
  try {
    return await apiRequest("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to change your password.", { cause: error });
  }
}

export async function requestAuthenticatedPasswordOtp() {
  try {
    return await apiRequest("/auth/change-password/email-otp", { method: "POST" });
  } catch (error) {
    const requestError = new Error(error.response?.data?.message ?? "Unable to send a verification code.", { cause: error });
    const retryAfter = Number(error.response?.headers?.["retry-after"]);
    if (Number.isFinite(retryAfter) && retryAfter > 0) requestError.retryAfterSeconds = Math.ceil(retryAfter);
    throw requestError;
  }
}

export async function requestConsumerEmailChangeOtp() {
  try {
    return await apiRequest("/auth/consumer/change-email/otp", { method: "POST" });
  } catch (error) {
    const requestError = new Error(error.response?.data?.message ?? "Unable to send the verification code.", { cause: error });
    const retryAfter = Number(error.response?.headers?.["retry-after"]);
    if (Number.isFinite(retryAfter) && retryAfter > 0) requestError.retryAfterSeconds = Math.ceil(retryAfter);
    throw requestError;
  }
}

export async function verifyConsumerEmailChangeOtp(challengeToken, otp) {
  try {
    return await apiRequest("/auth/consumer/change-email/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, otp }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to verify the code.", { cause: error });
  }
}

export async function completeConsumerEmailChange(emailChangeToken, newEmail) {
  try {
    return await apiRequest("/auth/consumer/change-email", {
      method: "POST",
      body: JSON.stringify({ emailChangeToken, newEmail }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to change your email.", { cause: error });
  }
}

export async function requestStaffActionOtp(action, targetId) {
  try {
    return await apiRequest("/auth/admin/staff-action/otp", { method: "POST", body: JSON.stringify({ action, targetId }) });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to send the Super Admin verification code.", { cause: error });
  }
}

export async function verifyStaffActionOtp(challengeToken, otp) {
  try {
    return await apiRequest("/auth/admin/staff-action/verify", { method: "POST", body: JSON.stringify({ challengeToken, otp }) });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to verify the Super Admin code.", { cause: error });
  }
}

export async function createStaffAccount(accountType, account, authorizationToken) {
  const endpoint = accountType === "admin" ? "/admins" : "/meter-readers";
  try {
    return await apiRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(account),
      headers: { "X-Staff-Authorization": authorizationToken },
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to create the staff account.", { cause: error });
  }
}

export async function fetchStaffAccounts(accountType, page = 1, pageSize = 5) {
  const endpoint = accountType === "admins" ? "/admins" : "/meter-readers";
  try {
    const result = await apiRequest(`${endpoint}?page=${page}&pageSize=${pageSize}`);
    return result.data;
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to load staff accounts.", { cause: error });
  }
}

export async function fetchTrustedDevices() {
  try {
    return await apiRequest("/auth/admin/trusted-devices");
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to load trusted devices.", { cause: error });
  }
}

export async function revokeTrustedDevice(deviceId) {
  try {
    return await apiRequest(`/auth/admin/trusted-devices/${deviceId}`, { method: "DELETE" });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to remove trusted device.", { cause: error });
  }
}

export async function revokeOtherTrustedDevices() {
  try {
    return await apiRequest("/auth/admin/trusted-devices/others", { method: "DELETE" });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to remove other trusted devices.", { cause: error });
  }
}

export async function updateMeterReaderAccount(meterReaderId, updates, authorizationToken) {
  try {
    return await apiRequest(`/meter-readers/${meterReaderId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
      headers: { "X-Staff-Authorization": authorizationToken },
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to update the meter reader.", { cause: error });
  }
}

export async function updateAdminAccount(adminId, updates, authorizationToken) {
  try {
    return await apiRequest(`/admins/${adminId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
      headers: { "X-Staff-Authorization": authorizationToken },
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to update the administrator.", { cause: error });
  }
}

export async function resetPassword(token, password) {
  try {
    return await apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to reset your password.", { cause: error });
  }
}

export async function getCurrentAccount(options) {
  const result = await apiRequest("/auth/me", options);
  const storedAccount = getStoredAccount();
  const user = { ...storedAccount, ...result.user };
  window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(user));
  return { user };
}

export async function logout() {
  const account = getStoredAccount();
  try {
    if (account?.role === "consumer") {
      await disableCurrentPushNotifications();
    }
  } finally {
    clearSession();
  }
}
