import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import SessionExpiredModal from "./SessionExpiredModal";
import { useToast } from "./Toast";
import { clearSession, getAccessToken } from "../services/authToken";
import {
  clearLocalActivity,
  fetchInactivityTimeout,
  formatInactivityDuration,
  getIdleMs,
  getInactivityTimeoutMs,
  getLastLocalActivity,
  initLocalActivity,
  markInactiveSession,
  touchLocalActivity,
} from "../services/inactivitySession";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];
const PUBLIC_ROUTES = ["/login", "/forgot-password", "/reset-password"];
const WARNING_TOAST_DURATION_MS = 10 * 1000;

function getWarningLeadMs() {
  return Math.min(60 * 1000, Math.max(15 * 1000, Math.floor(getInactivityTimeoutMs() / 3)));
}

export default function SessionInactivityGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [isInactive, setIsInactive] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(getInactivityTimeoutMs());
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
    if (isInactive) return undefined;
    if (!getAccessToken()) return undefined;
    if (PUBLIC_ROUTES.includes(location.pathname)) return undefined;

    let cancelled = false;
    let warningToastId = null;
    let warnedForCycle = false;
    initLocalActivity();

    // Backend is the source of truth for the timeout; fall back to the
    // cached/default value if the fetch fails (offline backend).
    fetchInactivityTimeout().then((fetched) => {
      if (!cancelled) setTimeoutMs(fetched);
    });

    const dismissWarning = () => {
      if (warningToastId !== null) {
        toastRef.current.dismiss(warningToastId);
        warningToastId = null;
      }
    };

    let timer;
    const schedule = () => {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      const timeout = getInactivityTimeoutMs();
      const remaining = timeout - getIdleMs();
      if (remaining <= 0) {
        dismissWarning();
        warnedForCycle = false;
        markInactiveSession();
        clearLocalActivity();
        clearSession();
        setIsInactive(true);
        return;
      }
      const warningLead = getWarningLeadMs();
      if (remaining <= warningLead && !warnedForCycle) {
        warnedForCycle = true;
        const secondsLeft = Math.max(1, Math.round(remaining / 1000));
        warningToastId = toastRef.current.warning(
          "Still there?",
          `You'll be signed out in about ${secondsLeft} seconds due to inactivity. Move your mouse or press any key to stay signed in.`,
          { duration: WARNING_TOAST_DURATION_MS },
        );
      }
      if (remaining > warningLead && warnedForCycle) {
        warnedForCycle = false;
        dismissWarning();
      }
      timer = window.setTimeout(schedule, Math.min(remaining, warningLead, 30 * 1000));
    };

    let throttleAt = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - throttleAt < 1000) return;
      throttleAt = now;
      touchLocalActivity(now);
      schedule();
    };

    const handleBroadcast = (event) => {
      if (event.key !== "waterwise:activity-broadcast") return;
      const broadcasted = Number(event.newValue);
      if (!Number.isFinite(broadcasted)) return;
      const local = getLastLocalActivity() ?? 0;
      if (broadcasted > local) {
        try {
          window.sessionStorage.setItem("waterwise:last-activity-at", String(broadcasted));
        } catch {
          // Ignore storage failures.
        }
        schedule();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && getAccessToken()) {
        schedule();
      }
    };

    const handleCustomActivity = () => schedule();

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, handleActivity, { passive: true });
    }
    window.addEventListener("storage", handleBroadcast);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("waterwise:activity", handleCustomActivity);
    schedule();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      dismissWarning();
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, handleActivity);
      }
      window.removeEventListener("storage", handleBroadcast);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("waterwise:activity", handleCustomActivity);
    };
    // `toast` is a stable context value (memoized in ToastProvider); the
    // live reference is read via toastRef to avoid re-subscribing listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInactive, location.pathname]);

  const handleConfirm = () => {
    setIsInactive(false);
    navigate("/login", { replace: true, state: { sessionInactive: true } });
  };

  return (
    <SessionExpiredModal
      isOpen={isInactive}
      onConfirm={handleConfirm}
      reason="inactivity"
      durationLabel={formatInactivityDuration(timeoutMs)}
    />
  );
}
