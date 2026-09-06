import { useEffect, useState } from "react";
import { FiDownload, FiX } from "react-icons/fi";
import { useToast } from "./Toast";
import {
  SHOW_PWA_INSTALL_EVENT,
  clearDeferredInstallPrompt,
  subscribePWAInstall,
} from "../services/pwaInstall";

const DISMISSED_KEY = "waterwise-pwa-install-dismissed";

function isIOSDevice() {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(window.navigator?.userAgent ?? "");
}

export default function PWAInstallPrompt() {
  const toast = useToast();
  const [installEvent, setInstallEvent] = useState(null);
  const [forceVisible, setForceVisible] = useState(false);

  useEffect(
    () =>
      subscribePWAInstall(({ deferredPrompt, isInstalled }) => {
        if (isInstalled) {
          setInstallEvent(null);
          setForceVisible(false);
          return;
        }
        // Respect a previous "Not now" only for the automatic prompt. A tap
        // on any download icon forces the card back open (see below).
        if (!deferredPrompt) {
          setInstallEvent(null);
          return;
        }
        try {
          if (window.sessionStorage.getItem(DISMISSED_KEY) !== "true") {
            setInstallEvent(deferredPrompt);
          }
        } catch {
          setInstallEvent(deferredPrompt);
        }
      }),
    [],
  );

  useEffect(() => {
    const handleShowRequest = () => {
      try {
        window.sessionStorage.removeItem(DISMISSED_KEY);
      } catch {
        // Storage may be unavailable in private mode.
      }
      setForceVisible(true);
    };
    window.addEventListener(SHOW_PWA_INSTALL_EVENT, handleShowRequest);
    return () => window.removeEventListener(SHOW_PWA_INSTALL_EVENT, handleShowRequest);
  }, []);

  if (!installEvent && !forceVisible) {
    return null;
  }

  const handleDismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Ignore storage failures.
    }
    setInstallEvent(null);
    setForceVisible(false);
  };

  const handleInstall = async () => {
    if (installEvent) {
      try {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === "accepted") {
          toast.success("WaterWise installed", "You can now open WaterWise from your device home screen.");
        } else {
          toast.info("Install WaterWise", "You can install WaterWise anytime by tapping the download icon again.");
        }
        clearDeferredInstallPrompt();
      } catch {
        toast.error("Installation unavailable", "WaterWise could not start the installation. Try again from your browser menu.");
      }
      setForceVisible(false);
      return;
    }

    // No native prompt (iOS, unsupported browser, or criteria not met yet):
    // keep the card open and show the manual install steps as a notification.
    toast.info(
      "Install WaterWise",
      isIOSDevice()
        ? "Tap Share, then choose Add to Home Screen to install WaterWise."
        : "Open your browser menu and choose Install app or Add to Home Screen to install WaterWise.",
    );
  };

  return (
    <aside
      aria-labelledby="pwa-install-title"
      className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-md rounded-xl border border-water-200 bg-white p-4 shadow-modal sm:bottom-6"
      data-testid="pwa-install-prompt"
      role="dialog"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-600">
          <FiDownload aria-hidden="true" className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-navy-900" id="pwa-install-title">
            Install WaterWise
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {installEvent
              ? "Add WaterWise to your device for quick access and an app-like experience."
              : "Tap Install app below, then follow your browser steps to add WaterWise to your device."}
          </p>

          <div className="mt-4 flex gap-2">
            <button
              className="ww-primary-button px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
              onClick={handleInstall}
              type="button"
            >
              Install app
            </button>
            <button
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
              onClick={handleDismiss}
              type="button"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          aria-label="Dismiss install prompt"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
          onClick={handleDismiss}
          type="button"
        >
          <FiX aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
