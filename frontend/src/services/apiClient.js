import axios from "axios";
import { clearSession, getStoredAccount, isLoggingOut } from "./authToken";
import { clearApiCache, readCachedResponse, writeCachedResponse } from "./apiCache";
import { getDeviceFingerprint } from "../utils/deviceFingerprint";

// Both Vercel and the Vite development server proxy this first-party path to
// the backend. The deployment origin therefore never enters browser code.
export const API_BASE_URL = "/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: "application/json" },
  // Admin trusted-device verification uses a secure cross-origin cookie.
  withCredentials: true,
});

const networkAdapter = axios.getAdapter(apiClient.defaults.adapter);
let refreshInFlight = null;

async function tryRefreshConsumerSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { refreshSession } = await import("./auth.service.js");
    return refreshSession();
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
const pendingGets = new Map();

function getRequestKey(config) {
  const url = new URL(config.url ?? "", "http://waterwise.local");
  const params = new URLSearchParams(config.params ?? {});
  for (const [key, value] of url.searchParams) params.append(key, value);
  const sortedParams = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  return `${url.pathname}?${new URLSearchParams(sortedParams)}`;
}

apiClient.defaults.adapter = async (config) => {
  if (config.method?.toLowerCase() !== "get" || config.responseType === "blob") {
    return networkAdapter(config);
  }

  const requestKey = getRequestKey(config);
  if (["/auth/me", "/auth/admin/trusted-devices"].includes(requestKey.split("?")[0])) {
    return networkAdapter(config);
  }
  const account = getStoredAccount();
  const pendingKey = `${account?.role ?? "anonymous"}:${account?.id ?? "anonymous"}:${requestKey}`;
  const cached = readCachedResponse(requestKey);
  if (cached) return { ...cached, config, request: null };

  if (pendingGets.has(pendingKey)) {
    const response = await pendingGets.get(pendingKey);
    return { ...response, config };
  }

  const request = networkAdapter(config).then((response) => {
    writeCachedResponse(requestKey, response);
    return response;
  }).finally(() => pendingGets.delete(pendingKey));
  pendingGets.set(pendingKey, request);
  return request;
};

apiClient.interceptors.request.use(async (config) => {
  // Cookie-only auth: HttpOnly waterwise_session is sent automatically via
  // withCredentials. Never attach a readable Bearer token. Fingerprint is
  // mandatory CSRF protection for cookie sessions (backend enforces it).
  try {
    const fingerprint = await getDeviceFingerprint();
    config.headers["X-Device-Fingerprint"] = fingerprint;
  } catch {
    // Fingerprint is best-effort; the backend enforces the check only when
    // a fingerprint is already enrolled for the account.
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (!["get", "head"].includes(response.config.method?.toLowerCase())) clearApiCache();
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    // Rate-limited (global/authStrict): never trigger silent refresh or
    // logout. Surface Retry-After so callers (e.g. Login.jsx) can countdown.
    if (status === 429) {
      const retryAfter = Number(
        error.response?.headers?.["retry-after"] ??
          error.response?.data?.retryAfterSeconds,
      );
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        error.retryAfterSeconds = Math.ceil(retryAfter);
      }
      // Notify the global toast listener (RateLimitToast). Login.jsx keeps
      // its own lock countdown; this toast is the visible warning for both
      // AUTH (10/15min) and GLOBAL (300/15min) limits on every other page.
      try {
        const serverMessage = String(error.response?.data?.message ?? "");
        const url = String(error.config?.url ?? "");
        window.dispatchEvent(
          new CustomEvent("waterwise:rate-limited", {
            detail: {
              message: serverMessage,
              retryAfterSeconds: error.retryAfterSeconds ?? 0,
              url,
            },
          }),
        );
      } catch {
        // Non-browser / disabled events must never break the request chain.
      }
      return Promise.reject(error);
    }
    const requestUrl = error.config?.url ?? "";
    const isPublicAuthRequest =
      requestUrl.startsWith("/auth/login") ||
      requestUrl.startsWith("/auth/refresh") ||
      requestUrl.startsWith("/auth/forgot-password") ||
      requestUrl.startsWith("/auth/verify-reset-otp") ||
      requestUrl.startsWith("/auth/reset-password") ||
      requestUrl.startsWith("/auth/admin/verify-login-otp") ||
      requestUrl.startsWith("/auth/admin/resend-login-otp");
    const isPublicAuthPage = ["/login", "/forgot-password", "/reset-password"].includes(
      window.location.pathname,
    );
    // Consumer/Admin/Super-admin silent refresh: a 15m access may expire
    // between the 5min timer ticks (closed laptop, throttled tab). Try one
    // refresh + retry before treating it as a logout. Terminal refresh
    // failures (absolute expiry, password change, deactivation, mismatch)
    // fall through to logout.
    if (
      status === 401 &&
      !isLoggingOut() &&
      !isPublicAuthPage &&
      !isPublicAuthRequest &&
      !error.config?._refreshRetried &&
      ["consumer", "admin", "super-admin"].includes(getStoredAccount()?.role)
    ) {
      try {
        await tryRefreshConsumerSession();
        error.config._refreshRetried = true;
        return apiClient.request(error.config);
      } catch {
        // Refresh failed: fall through to the logout handling below.
      }
    }
    if (status === 401 && !isLoggingOut() && !isPublicAuthPage && !isPublicAuthRequest) {
      // Expired, idle-timed-out, revoked (password change), deactivated, or
      // device-mismatch sessions must end here instead of leaving the user
      // stuck: the stored session is no longer valid server-side. The reason
      // is persisted so the login page can explain it (full reload drops
      // router state). Message-matched because the backend sends no stable
      // `code` for these reasons (only SESSION_INACTIVE has one).
      const responseMessage = String(error.response?.data?.message ?? "");
      const isInactive = error.response?.data?.code === "SESSION_INACTIVE";
      const isPasswordChanged = /password was changed/i.test(responseMessage);
      const isDeviceMismatch = /device (mismatch|verification)/i.test(responseMessage);
      const isDeactivated = /no longer active/i.test(responseMessage);
      try {
        window.sessionStorage.removeItem("waterwise:session-inactive");
        window.sessionStorage.removeItem("waterwise:session-expired");
        window.sessionStorage.removeItem("waterwise:password-changed");
        window.sessionStorage.removeItem("waterwise:device-mismatch");
        window.sessionStorage.removeItem("waterwise:account-inactive");
        if (isInactive) {
          window.sessionStorage.setItem("waterwise:session-inactive", "1");
        } else if (isPasswordChanged) {
          window.sessionStorage.setItem("waterwise:password-changed", "1");
        } else if (isDeviceMismatch) {
          window.sessionStorage.setItem("waterwise:device-mismatch", "1");
        } else if (isDeactivated) {
          window.sessionStorage.setItem("waterwise:account-inactive", "1");
        } else {
          window.sessionStorage.setItem("waterwise:session-expired", "1");
        }
        window.sessionStorage.removeItem("waterwise:last-activity-at");
      } catch {
        // Storage may be disabled; the login page still loads without the notice.
      }
      clearSession();
      window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

export async function apiRequest(path, options = {}) {
  let data = options.body;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      // Not JSON (e.g. a raw string payload): forward as-is instead of
      // silently dropping the body.
    }
  }
  const method = (options.method ?? "GET").toUpperCase();
  const headers = { ...(options.headers ?? {}) };
  // Mutations always imply real user action, so the backend refreshes the
  // 15-minute inactivity timestamp for them. Plain GET polls and the SSE
  // stream never touch it; explicit user activity travels via POST
  // /auth/activity instead.
  if (!["GET", "HEAD"].includes(method) && !headers["X-User-Activity"]) {
    headers["X-User-Activity"] = "1";
  }
  const response = await apiClient.request({
    url: path,
    method: options.method ?? "GET",
    data,
    params: options.params,
    responseType: options.responseType,
    headers,
    signal: options.signal,
  });
  return response.data;
}

export function isCanceledRequest(error) {
  return (
    axios.isCancel(error) ||
    error?.code === "ERR_CANCELED" ||
    error?.name === "AbortError"
  );
}

export default apiClient;
