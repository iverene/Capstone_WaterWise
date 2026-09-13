import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const ToastContext = createContext(null);
const EXIT_ANIMATION_MS = 240;

const toastStyles = {
  error: {
    badge: "border-red-200 bg-red-50 text-red-700",
    border: "border-red-200",
    icon: "bg-red-50 text-red-700",
    Icon: CircleAlert,
    label: "Error",
  },
  info: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    border: "border-sky-200",
    icon: "bg-sky-50 text-sky-700",
    Icon: Info,
    label: "Information",
  },
  success: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    border: "border-emerald-200",
    icon: "bg-emerald-50 text-emerald-700",
    Icon: CheckCircle2,
    label: "Success",
  },
  warning: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    border: "border-amber-200",
    icon: "bg-amber-50 text-amber-700",
    Icon: AlertTriangle,
    label: "Warning",
  },
};

function createToastId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const exiting = useRef(new Set());
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    if (exiting.current.has(id)) return;
    exiting.current.add(id);
    window.clearTimeout(timers.current.get(id));
    setToasts((current) => current.map((toast) => (
      toast.id === id ? { ...toast, exiting: true } : toast
    )));
    timers.current.set(id, window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      exiting.current.delete(id);
      timers.current.delete(id);
    }, EXIT_ANIMATION_MS));
  }, []);

  const show = useCallback((options) => {
    const type = toastStyles[options.type] ? options.type : "info";
    const id = createToastId();
    const duration = options.duration ?? (type === "error" ? 5000 : 4000);
    const dedupeKey = options.key ?? `${type}|${options.title || toastStyles[type].label}|${options.message ?? ""}`;
    const toast = {
      actions: Array.isArray(options.actions) ? options.actions : [],
      dedupeKey,
      dismissOnInteract: options.dismissOnInteract === true,
      duration,
      id,
      exiting: false,
      message: options.message ?? "",
      title: options.title || toastStyles[type].label,
      type,
    };

    // Spam guard: an identical toast already on screen collapses into this
    // fresh one (timer restarts), and timers of toasts evicted by the cap are
    // cleared so rapid firing can't stack duplicates or leak timers.
    const retiredIds = [];
    setToasts((current) => {
      const kept = current.filter((item) => {
        if (item.dedupeKey !== dedupeKey) return true;
        retiredIds.push(item.id);
        return false;
      });
      const next = [...kept.slice(-3), toast];
      if (kept.length > 3) {
        kept.slice(0, kept.length - 3).forEach((item) => retiredIds.push(item.id));
      }
      return next;
    });
    retiredIds.forEach((retiredId) => {
      window.clearTimeout(timers.current.get(retiredId));
      timers.current.delete(retiredId);
      exiting.current.delete(retiredId);
    });
    if (duration > 0) {
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  const update = useCallback((id, patch = {}) => {
    setToasts((current) => current.map((item) => (
      item.id === id ? { ...item, ...patch } : item
    )));
  }, []);

  useEffect(() => {
    const interactive = toasts.filter((item) => item.dismissOnInteract && !item.exiting);
    if (interactive.length === 0) return undefined;
    // Passive only: the user's tap/click/keypress proceeds normally while the
    // toast fades out. No preventDefault, no stopPropagation.
    const dismissInteractive = () => {
      interactive.forEach((item) => dismiss(item.id));
    };
    window.addEventListener("pointerdown", dismissInteractive);
    window.addEventListener("keydown", dismissInteractive);
    return () => {
      window.removeEventListener("pointerdown", dismissInteractive);
      window.removeEventListener("keydown", dismissInteractive);
    };
  }, [dismiss, toasts]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    exiting.current.clear();
    timers.current.clear();
  }, []);

  const toast = useMemo(() => ({
    dismiss,
    error: (title, message, options = {}) => show({ ...options, message, title, type: "error" }),
    info: (title, message, options = {}) => show({ ...options, message, title, type: "info" }),
    show,
    success: (title, message, options = {}) => show({ ...options, message, title, type: "success" }),
    update,
    warning: (title, message, options = {}) => show({ ...options, message, title, type: "warning" }),
  }), [dismiss, show, update]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {typeof document !== "undefined" && createPortal(
        <div
          aria-label="System notifications"
          className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4rem)] z-[100] flex max-h-[calc(100dvh-7rem)] flex-col items-center gap-2 overflow-y-auto overscroll-contain sm:inset-x-auto sm:right-6 sm:top-[4.5rem] sm:w-[25rem] sm:items-stretch sm:gap-3 lg:right-6 lg:top-6"
        >
          {toasts.map((item) => {
            const { badge, border, icon, Icon, label } = toastStyles[item.type];
            return (
              <div
                aria-atomic="true"
                className={`${item.exiting ? "ww-toast-exit" : "ww-toast-enter"} pointer-events-auto relative w-full max-w-[20rem] overflow-hidden rounded-xl border bg-white sm:max-w-md sm:rounded-2xl ${border}`}
                key={item.id}
                role={item.type === "error" ? "alert" : "status"}
              >
                <div className="flex items-start gap-2 p-2.5 sm:gap-3 sm:p-4">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl ${icon}`}>
                    <Icon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0">
                    <span className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-bold uppercase tracking-[0.1em] sm:px-2 sm:py-0.5 sm:text-[11px] ${badge}`}>
                      {label}
                    </span>
                    <p className="mt-1 text-xs font-extrabold leading-4 text-navy-900 sm:mt-1.5 sm:text-sm sm:leading-5">{item.title}</p>
                    {item.message && <p className="mt-0.5 text-xs leading-4 text-slate-600 sm:mt-1 sm:text-sm sm:leading-5">{item.message}</p>}
                    {item.actions?.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5 sm:mt-3 sm:gap-2">
                        {item.actions.map((action) => (
                          <button
                            className={action.variant === "primary"
                              ? "ww-primary-button flex min-h-9 w-full items-center justify-center px-3 text-xs disabled:opacity-60 sm:min-h-11 sm:px-4 sm:text-sm"
                              : "flex min-h-9 w-full items-center justify-center rounded-xl px-3 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-navy-900 disabled:opacity-60 sm:min-h-11 sm:px-4 sm:text-sm"}
                            disabled={action.disabled}
                            key={action.label}
                            onClick={action.onClick}
                            type="button"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// The hook is colocated with the provider so every feature imports one toast API.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}

export default ToastProvider;
