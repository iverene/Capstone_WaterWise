import { getAccessToken } from "./authToken";
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

export function subscribeToDataChanges(onChange) {
  const controller = new AbortController();
  let retryTimer;

  const connect = async () => {
    const token = getAccessToken();
    if (controller.signal.aborted) return;
    if (!token) {
      retryTimer = window.setTimeout(connect, RETRY_DELAY_MS);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/changes/stream`, {
        headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
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
    } catch {
      if (!controller.signal.aborted) retryTimer = window.setTimeout(connect, RETRY_DELAY_MS);
    }
  };

  connect();
  return () => {
    window.clearTimeout(retryTimer);
    controller.abort();
  };
}
