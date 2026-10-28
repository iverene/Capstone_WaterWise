import { apiRequest } from "./apiClient";
import {
  ACCOUNT_STORAGE_KEY,
  beginLogout,
  isLoggingOut,
  clearSession,
  getPersistentMeterReaderUser,
  getStoredAccount,
  refreshMeterReaderPersistence,
  storeAccountIdentity,
  storeSession,
} from "./authToken";
import { disableCurrentPushNotifications } from "./pushNotifications";

export { ACCOUNT_STORAGE_KEY };

export async function login(credentials) {
  try {
    // No session write here: the caller (Login) validates the role has a
    // workspace destination first, then stores. Storing before validation
    // left stale sessions behind for unknown roles.
    return await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  } catch (error) {
    throw new Error(
      error.response?.data?.message ??
        error.message ??
        "Unable to sign in.",
      { cause: error },
    );
  }
}

export async function refreshSession() {
  // Consumer background refresh: renews the 15m access via the 90d refresh
  // cookie. Throws on 401 (day-90 expiry, password change, deactivation).
  return apiRequest("/auth/refresh", { method: "POST" });
}

export async function verifyAdminLoginOtp(challengeToken, otp) {
  try {
    // No session write here either (see login above): validated + stored by
    // the Login caller after the destination check.
    return await apiRequest("/auth/admin/verify-login-otp", {
      method: "POST",
      body: JSON.stringify({ challengeToken, otp }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to verify the admin sign-in code.", { cause: error });
  }
}

export async function resendAdminLoginOtp(challengeToken) {
  try {
    return await apiRequest("/auth/admin/resend-login-otp", {
      method: "POST",
      body: JSON.stringify({ challengeToken }),
    });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to resend the admin sign-in code.", { cause: error });
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
    const requestError = new Error(error.response?.data?.message ?? "Unable to send the Super Admin verification code.", { cause: error });
    const retryAfter = Number(error.response?.headers?.["retry-after"] ?? error.response?.data?.retryAfterSeconds);
    if (Number.isFinite(retryAfter) && retryAfter > 0) requestError.retryAfterSeconds = Math.ceil(retryAfter);
    throw requestError;
  }
}

export async function verifyStaffActionOtp(challengeToken, otp) {
  try {
    return await apiRequest("/auth/admin/staff-action/verify", { method: "POST", body: JSON.stringify({ challengeToken, otp }) });
  } catch (error) {
    throw new Error(error.response?.data?.message ?? "Unable to verify the Super Admin code.", { cause: error });
  }
}

export async function verifyStaffActionPassword(action, targetId, password) {
  try {
    return await apiRequest("/auth/admin/staff-action/verify-password", { method: "POST", body: JSON.stringify({ action, targetId, password }) });
  } catch (error) {
    const requestError = new Error(error.response?.data?.message ?? "Unable to verify the Super Admin password.", { cause: error });
    const retryAfter = Number(error.response?.headers?.["retry-after"] ?? error.response?.data?.retryAfterSeconds);
    if (Number.isFinite(retryAfter) && retryAfter > 0) requestError.retryAfterSeconds = Math.ceil(retryAfter);
    const remaining = Number(error.response?.data?.remainingAttempts);
    if (Number.isFinite(remaining)) requestError.remainingAttempts = remaining;
    requestError.status = error.response?.status;
    throw requestError;
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

export async function fetchStaffAccounts(accountType, page = 1, pageSize = 5, authorizationToken) {
  const endpoint = accountType === "admins" ? "/admins" : "/meter-readers";
  try {
    const result = await apiRequest(`${endpoint}?page=${page}&pageSize=${pageSize}`, {
      headers: authorizationToken ? { "X-Staff-Authorization": authorizationToken } : undefined,
    });
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
  if (isLoggingOut()) throw new Error("Sign-out is in progress.");
  const result = await apiRequest("/auth/me", options);
  if (isLoggingOut()) throw new Error("Sign-out is in progress.");
  const storedAccount = getStoredAccount() ?? {};
  const incoming = result.user;
  if (!incoming?.id || !incoming?.role) {
    throw new Error("The session response did not contain a valid account.");
  }
  // Defensive merge: never blank a stored name/username/email with
  // undefined/null from a sparse response. Backend now enriches /auth/me,
  // but this guards old sessions and partial payloads.
  const sameAccount = storedAccount.id === incoming.id && storedAccount.role === incoming.role;
  const user = sameAccount ? { ...storedAccount } : {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== null && value !== "") user[key] = value;
  }
  if (sameAccount) {
    storeAccountIdentity(user);
  } else {
    // Restart account-scoped listeners after cookie-only recovery and clear
    // stale account caches if another tab has changed the signed-in account.
    storeSession({ user });
  }
  // Keep the meter-reader offline identity fresh on every successful online
  // verify (rolling 7-day grace). No token/password is persisted.
  refreshMeterReaderPersistence(user);
  return { user };
}

// Cached async session verification for the cookie-only world. The sync
// hasAuthenticatedSession() trusts tab storage, so an expired/invalid
// HttpOnly cookie still bounced /login -> workspace -> 401 -> /login.
// Verify against GET /auth/me instead, memoized per account for 5 minutes
// (plus in-flight dedupe for StrictMode double-mounts).
const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000;
let verifiedSessionCache = { at: 0, userId: null, role: null, ok: false };
let verifyInFlight = null;

export function clearVerifiedSessionCache() {
  verifiedSessionCache = { at: 0, userId: null, role: null, ok: false };
  verifyInFlight = null;
}

export function noteSessionStored(user) {
  if (user?.id && user?.role) {
    // A fresh login just proved the session server-side; seed the cache so
    // the next guard check skips an extra /auth/me round trip.
    verifiedSessionCache = { at: Date.now(), userId: user.id, role: user.role, ok: true };
  } else {
    clearVerifiedSessionCache();
  }
  verifyInFlight = null;
}

export async function hasVerifiedSession() {
  if (isLoggingOut()) return false;
  const stored = getStoredAccount();
  const now = Date.now();
  if (
    verifiedSessionCache.ok &&
    verifiedSessionCache.userId === stored?.id &&
    verifiedSessionCache.role === stored?.role &&
    now - verifiedSessionCache.at < VERIFY_CACHE_TTL_MS
  ) {
    return true;
  }
  // Meter-reader PWA offline: allow reopened workspace without re-login when
  // within offline grace. Online sync still requires the HttpOnly cookie;
  // a real 401 later forces login. This restores the deployed behavior where
  // clearing the tab + tapping the PWA does not ask for login before recording.
  if (stored?.role === "meter-reader") {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (getPersistentMeterReaderUser()?.id === stored.id) return true;
    }
  }
  if (verifyInFlight) {
    try {
      return await verifyInFlight;
    } catch {
      return false;
    }
  }
  verifyInFlight = (async () => {
    try {
      const { user } = await getCurrentAccount();
      if (!user?.id) return false;
      verifiedSessionCache = { at: Date.now(), userId: user.id, role: user.role, ok: true };
      return true;
    } catch (error) {
      // Offline (no response) with a valid persistent meter-reader identity:
      // stay in the workspace and queue readings; sync when back online.
      if (isLoggingOut()) return false;
      const status = error?.response?.status;
      if ((!error?.response || status >= 500) && stored?.role === "meter-reader") {
        if (getPersistentMeterReaderUser()?.id === stored.id) return true;
      }
      if (status === 401) {
        clearVerifiedSessionCache();
        clearSession();
      }
      return false;
    } finally {
      verifyInFlight = null;
    }
  })();
  return verifyInFlight;
}

export async function logout() {
  const account = getStoredAccount();
  beginLogout();
  try {
    try {
      if (account?.role === "consumer") {
        // Subscription removal needs the cookie that /auth/logout clears.
        await disableCurrentPushNotifications();
      }
    } finally {
      // Always attempt server logout, even if push cleanup fails.
      await apiRequest("/auth/logout", { method: "POST" });
    }
  } finally {
    clearVerifiedSessionCache();
    clearSession();
  }
}
