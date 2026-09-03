import axios from "axios";
import { clearSession, getAccessToken, getStoredAccount } from "./authToken";
import { clearApiCache, readCachedResponse, writeCachedResponse } from "./apiCache";
import { getDeviceFingerprint } from "../utils/deviceFingerprint";

const configuredBaseUrl =
  import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL;

function resolveApiBaseUrl(value) {
  const baseUrl = (value || "/api").trim().replace(/\/+$/, "");

  // Accept either the Render service root or its complete /api URL.
  if (baseUrl === "/api" || /\/api$/i.test(baseUrl)) {
    return baseUrl;
  }

  return `${baseUrl}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl(configuredBaseUrl);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: "application/json" },
  // Admin trusted-device verification uses a secure cross-origin cookie.
  withCredentials: true,
});

const networkAdapter = axios.getAdapter(apiClient.defaults.adapter);
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
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  try {
    const fingerprint = await getDeviceFingerprint();
    config.headers["X-Device-Fingerprint"] = fingerprint;
  } catch {}
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (!["get", "head"].includes(response.config.method?.toLowerCase())) clearApiCache();
    return response;
  },
  (error) => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      if (window.location.pathname === "/login") {
        return Promise.reject(error);
      }
      const storedToken = getAccessToken();
      if (!storedToken) {
        window.location.assign("/login");
      }
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
      data = undefined;
    }
  }
  const response = await apiClient.request({
    url: path,
    method: options.method ?? "GET",
    data,
    headers: options.headers,
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
