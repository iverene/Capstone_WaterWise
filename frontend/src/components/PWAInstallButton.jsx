import { useEffect, useState } from "react";
import { FiDownload } from "react-icons/fi";
import { useToast } from "./Toast";

function isRunningAsInstalledApp() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return Boolean(window.navigator?.standalone);
}

export default function PWAInstallButton({ variant = "header", showLabel = false }) {
  const toast = useToast();
  const [installEvent, setInstallEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isRunningAsInstalledApp);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const handleAppInstalled = () => {
      setInstallEvent(null);
      setIsInstalled(true);
    };
    const handleDisplayModeChange = (event) => {
      if (event.matches) setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
    mediaQuery?.addEventListener?.("change", handleDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQuery?.removeEventListener?.("change", handleDisplayModeChange);
    };
  }, []);

  if (isInstalled) return null;

  const handleDownload = async () => {
    if (installEvent) {
      try {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice?.outcome === "accepted") {
          toast.success("WaterWise installed", "You can now open WaterWise from your device home screen.");
        }
        setInstallEvent(null);
      } catch {
        toast.error("Installation unavailable", "WaterWise could not start the installation. Try again from your browser menu.");
      }
      return;
    }

    const isIOS = /iPhone|iPad|iPod/i.test(window.navigator?.userAgent ?? "");
    toast.info(
      "Install WaterWise",
      isIOS
        ? "Tap Share, then choose Add to Home Screen to install WaterWise."
        : "Open your browser menu and choose Install app or Add to Home Screen to install WaterWise.",
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
