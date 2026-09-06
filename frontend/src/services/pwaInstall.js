// Shared PWA install-prompt store.
//
// `beforeinstallprompt` fires only once per page load (often before React
// mounts). Capturing it in a module-level listener guarantees every download
// icon / install card sees the same deferred prompt instead of racing each
// other. Clicking any download icon dispatches `waterwise:show-pwa-install`
// so the install card (notification) appears on demand.

export const SHOW_PWA_INSTALL_EVENT = "waterwise:show-pwa-install";

let deferredPrompt = null;
const listeners = new Set();
let isInstalled = false;
let initialized = false;

function detectInstalled() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return Boolean(window.navigator?.standalone);
}

function notify() {
  listeners.forEach((listener) => {
    try {
      listener({ deferredPrompt, isInstalled });
    } catch {
      // Ignore subscriber errors so one broken component cannot break installs.
    }
  });
}

export function initPWAInstallCapture() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  isInstalled = detectInstalled();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    isInstalled = true;
    try {
      window.sessionStorage.removeItem("waterwise-pwa-install-dismissed");
    } catch {
      // Storage may be unavailable in private mode.
    }
    notify();
  });

  const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
  mediaQuery?.addEventListener?.("change", (event) => {
    if (event.matches) {
      isInstalled = true;
      notify();
    }
  });
}

export function getPWAInstallState() {
  return { deferredPrompt, isInstalled };
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
  notify();
}

export function subscribePWAInstall(listener) {
  listeners.add(listener);
  listener({ deferredPrompt, isInstalled });
  return () => listeners.delete(listener);
}

// Ask the visible install card to open. Used by every download icon so a
// tap always surfaces the "Install WaterWise" notification/card.
export function requestShowPWAInstall() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHOW_PWA_INSTALL_EVENT));
}
