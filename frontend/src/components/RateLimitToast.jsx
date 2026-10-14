import { useEffect, useRef } from "react";
import { useToast } from "./Toast";

function formatRetry(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0
    ? `${minutes}m`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function classify(message) {
  const isAuth = /login attempts|verification code|incorrect attempts/i.test(message);
  return {
    isAuth,
    title: isAuth ? "Sign-in slowed down" : "Too many requests",
    base: message || "Please slow down and try again shortly.",
  };
}

// Global 429 -> sticky toast with live 1s countdown. Listens for the event
// dispatched by apiClient so both AUTH (RATE_LIMIT_AUTH_MAX) and GLOBAL
// (RATE_LIMIT_GLOBAL_MAX) limits pop a warning that stays until the timer
// ends. Fixed dedupe key + single interval collapses spam into one toast.
export default function RateLimitToast() {
  const toast = useToast();
  const toastIdRef = useRef(null);
  const expiryRef = useRef(0);
  const intervalRef = useRef(null);
  const metaRef = useRef({ title: "Too many requests", base: "" });
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const clearTimer = () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const dismissNow = () => {
      clearTimer();
      if (toastIdRef.current) {
        toastRef.current.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      expiryRef.current = 0;
    };

    const tick = () => {
      if (!toastIdRef.current) {
        clearTimer();
        return;
      }
      const remaining = Math.max(
        0,
        Math.ceil((expiryRef.current - Date.now()) / 1000),
      );
      if (remaining <= 0) {
        dismissNow();
        return;
      }
      const { base } = metaRef.current;
      toastRef.current.update(toastIdRef.current, {
        message: `${base} Retry in ${formatRetry(remaining)}.`,
      });
    };

    const ensureTimer = () => {
      if (!intervalRef.current) {
        intervalRef.current = window.setInterval(tick, 1000);
      }
    };

    const handler = (event) => {
      const detail = event?.detail ?? {};
      const retry = Math.max(0, Math.ceil(Number(detail.retryAfterSeconds) || 0));
      const serverMessage = String(detail.message ?? "").trim();
      const { title, base } = classify(serverMessage);
      metaRef.current = { title, base };

      // No server timer: plain 5s warning, no sticky state.
      if (retry <= 0) {
        toastRef.current.warning(title, base, { key: "waterwise-rate-limit" });
        return;
      }

      expiryRef.current = Date.now() + retry * 1000;
      const message = `${base} Retry in ${formatRetry(retry)}.`;

      if (!toastIdRef.current) {
        toastIdRef.current = toastRef.current.warning(title, message, {
          duration: 0,
          key: "waterwise-rate-limit",
          actions: [{ label: "Dismiss", onClick: dismissNow }],
        });
      } else {
        toastRef.current.update(toastIdRef.current, { title, message });
      }
      ensureTimer();
      tick();
    };

    window.addEventListener("waterwise:rate-limited", handler);
    return () => {
      window.removeEventListener("waterwise:rate-limited", handler);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      toastIdRef.current = null;
      expiryRef.current = 0;
    };
  }, []);

  return null;
}
