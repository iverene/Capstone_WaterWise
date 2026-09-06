import { useEffect, useState } from "react";
import { FiDownload } from "react-icons/fi";
import { useToast } from "./Toast";
import {
  clearDeferredInstallPrompt,
  requestShowPWAInstall,
  subscribePWAInstall,
} from "../services/pwaInstall";

function isIOSDevice() {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(window.navigator?.userAgent ?? "");
}

export default function PWAInstallButton({ variant = "header", showLabel = false }) {
  const toast = useToast();
  const [installEvent, setInstallEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(
    () =>
      subscribePWAInstall(({ deferredPrompt, isInstalled: installed }) => {
        setInstallEvent(deferredPrompt);
        setIsInstalled(installed);
      }),
    [],
  );

  if (isInstalled) return null;

  const handleDownload = async () => {
    // 1) Native install prompt is available: trigger the real browser install.
    if (installEvent) {
      try {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice?.outcome === "accepted") {
          toast.success("WaterWise installed", "You can now open WaterWise from your device home screen.");
        } else {
          toast.info("Install WaterWise", "You can install WaterWise anytime by tapping the download icon again.");
        }
        clearDeferredInstallPrompt();
      } catch {
        toast.error("Installation unavailable", "WaterWise could not start the installation. Try again from your browser menu.");
      }
      return;
    }

    // 2) No native prompt captured (already fired, unsupported browser, or
    // PWA criteria not met yet): open the in-app install notification/card so
    // tapping the icon always surfaces an install message.
    requestShowPWAInstall();
    toast.info(
      "Install WaterWise",
      isIOSDevice()
        ? "Tap Share, then choose Add to Home Screen to install WaterWise."
        : "Follow the Install WaterWise card to add the app to your device.",
    );
  };

  const buttonClassName =
    variant === "panel"
      ? "flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-water-700 shadow-sm transition-colors hover:border-water-200 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2";

  return (
    <button
      aria-label="Download WaterWise app"
      className={buttonClassName}
      data-testid="pwa-install-button"
      onClick={handleDownload}
      title="Download WaterWise app"
      type="button"
    >
      <FiDownload aria-hidden="true" className="h-5 w-5" />
      {showLabel ? <span>Download app</span> : null}
    </button>
  );
}
