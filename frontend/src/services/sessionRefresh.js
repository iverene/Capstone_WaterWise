import { refreshSession } from "./auth.service";
import { getStoredAccount, isLoggingOut } from "./authToken";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let timer = null;
let inFlight = null;
let started = false;

async function doRefresh() {
  const account = getStoredAccount();
  if (!account || isLoggingOut()) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await refreshSession();
    } catch {
      // Terminal refresh failure (day-90, password change, deactivation):
      // leave logout to apiClient/SSE 401 handling to avoid double redirect.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function handleVisibility() {
  if (document.visibilityState === "visible") void doRefresh();
}

export function startSessionRefresh() {
  if (started) return () => stopSessionRefresh();
  started = true;
  void doRefresh();
  timer = window.setInterval(() => {
    void doRefresh();
  }, REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", handleVisibility);
  return () => stopSessionRefresh();
}

export function stopSessionRefresh() {
  started = false;
  if (timer) window.clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", handleVisibility);
}
