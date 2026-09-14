import { clearSession, getStoredAccount } from "./authToken";
import { getDeviceFingerprint } from "../utils/deviceFingerprint";
import { API_BASE_URL } from "./apiClient";

const RETRY_DELAY_MS = 3_000;
const VERSION_KEY = "waterwise-data-change-version";

function parseEventBlock(block) {
  let eventName = "message";
  const data = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { eventName, payload: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

function handleStreamUnauthorized() {
  // Mirror apiClient 401 handling so an expired/revoked/mismatched SSE
  // session ends the session instead of retrying every 3s forever.
  try {
    window.sessionStorage.setItem("waterwise:session-expired", "1");
    window.sessionStorage.removeItem("waterwise:last-activity-at");
  } catch {
    // Storage may be disabled; the login page still loads without the notice.
  }
  clearSession();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export function subscribeToDataChanges(onChange) {
  const controller = new AbortController();
  let retryTimer;

  const connect = async () => {
    const account = getStoredAccount();
    if (controller.signal.aborted) return;
    if (!account) {
      // No session (logged out / login page): don't spam retries. A new
      // subscription is created on `waterwise-session-changed` after login.
      return;
    }
    try {
      const headers = { Accept: "text/event-stream" };
      try {
        const fingerprint = await getDeviceFingerprint();
        if (fingerprint) headers["X-Device-Fingerprint"] = fingerprint;
      } catch {
        // Fingerprint is best-effort for Bearer; mandatory for cookie auth
        // (backend enforces it as CSRF protection).
      }
      const response = await fetch(`${API_BASE_URL}/changes/stream`, {
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.status === 401) {
        handleStreamUnauthorized();
        return;
      }
      if (!response.ok || !response.body) throw new Error("Change stream unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const event = parseEventBlock(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          if (event?.eventName === "connected") {
            const previousVersion = window.sessionStorage.getItem(VERSION_KEY);
            const currentVersion = String(event.payload.version ?? "");
            if (previousVersion && currentVersion && previousVersion !== currentVersion) {
              onChange({ reason: "reconnected", version: event.payload.version });
            }
            if (currentVersion) window.sessionStorage.setItem(VERSION_KEY, currentVersion);
          }
          if (event?.eventName === "data-change") {
            if (event.payload.version != null) {
              window.sessionStorage.setItem(VERSION_KEY, String(event.payload.version));
            }
            onChange(event.payload);
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      if (!controller.signal.aborted) retryTimer = window.setTimeout(connect, RETRY_DELAY_MS);
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (!controller.signal.aborted) retryTimer = window.setTimeout(connect, RETRY_DELAY_MS);
    }
  };

  connect();
  return () => {
    window.clearTimeout(retryTimer);
    controller.abort();
  };
}
