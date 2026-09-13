import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiBarChart2,
  FiAlertTriangle,
  FiBookOpen,
  FiCalendar,
  FiCreditCard,
  FiFileText,
  FiGrid,
  FiHome,
  FiMessageSquare,
  FiTrash2,
  FiUsers,
  FiWifiOff,
  FiX,
} from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import { ACCOUNT_STORAGE_KEY, getCurrentAccount, logout } from "../services/auth.service";
import { enableConsumerPushSessionPersistence, getStoredAccount } from "../services/authToken";
import { isCanceledRequest } from "../services/apiClient";
import { getPendingMeterReadings } from "../services/offlineMeterReadings";
import { getNotificationPresentation } from "../utils/notificationPresentation";
import {
  deleteNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/consumerPortal.service";
import NotificationPage from "../pages/NotificationPage";
import Header from "./Header";
import LogoutConfirmationModal from "./LogoutConfirmationModal";
import NotificationBadgeTrigger from "./NotificationBadgeTrigger";
import PWAInstallButton from "./PWAInstallButton";
import Modal from "./Modal";
import Sidebar from "./Sidebar";
import { useToast } from "./Toast";
import {
  enablePushNotifications,
  getCurrentPushSubscription,
  getPushConfiguration,
  pushSupported,
} from "../services/pushNotifications";

const PUSH_PROMPT_SESSION_PREFIX = "waterwise:push-prompt-dismissed:";

const ROLE_CONFIG = {
  admin: {
    label: "Admin",
    profile: "Barangay official",
    userName: "Barangay Admin",
    basePath: "/admin",
    homePath: "/admin/dashboard",
    links: [
      { label: "Dashboard", path: "/admin/dashboard", Icon: FiGrid },
      { label: "Residents", path: "/admin/consumers", Icon: FiUsers },
      { label: "Readings", path: "/admin/readings", Icon: FiBookOpen },
      { label: "Billing", path: "/admin/billings", Icon: FiFileText },
      { label: "Payments", path: "/admin/payments", Icon: FiCreditCard },
      { label: "Flagged Accounts", path: "/admin/flagged-accounts", Icon: FiAlertTriangle },
      { label: "Events", path: "/admin/events", Icon: FiCalendar },
      {
        label: "Announcements",
        path: "/admin/announcements",
        Icon: FiMessageSquare,
      },
      { label: "Analytics", path: "/admin/analytics", Icon: FiBarChart2 },
      { label: "Reports", path: "/admin/reports", Icon: FiFileText },
    ],
  },
  "meter-reader": {
    label: "Meter Reader",
    profile: "Field personnel",
    userName: "Meter Reader",
    basePath: "/meter-reader",
    homePath: "/meter-reader/readings-entry",
    links: [
      {
        label: "Readings Entry",
        path: "/meter-reader/readings-entry",
        Icon: FiBookOpen,
      },
    ],
  },
  consumer: {
    label: "Resident",
    profile: "Community resident",
    userName: "Iverene Grace M. Causapin",
    basePath: "/consumer",
    homePath: "/consumer/home",
    links: [
      { label: "Home", path: "/consumer/home", Icon: FiHome },
      { label: "Bills", path: "/consumer/billing-ledger", Icon: FiFileText },
      { label: "Analytics", path: "/consumer/analytics", Icon: FiBarChart2 },
    ],
  },
};

ROLE_CONFIG["super-admin"] = {
  ...ROLE_CONFIG.admin,
  label: "Super Admin",
  profile: "System administrator",
  userName: "Super Admin",
  links: [...ROLE_CONFIG.admin.links],
};

function getRoleFromPath(pathname) {
  return Object.entries(ROLE_CONFIG).find(([, config]) =>
    pathname.startsWith(config.basePath),
  )?.[0];
}

export default function AppLayout({ children }) {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const notificationMenuRef = useRef(null);
  const notificationTriggerRef = useRef(null);
  const pathRole = getRoleFromPath(location.pathname);
  const [account, setAccount] = useState(getStoredAccount);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isNotificationLoading, setIsNotificationLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [accountName, setAccountName] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const pushToastIdRef = useRef(null);
  const isEnablingPushRef = useRef(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const longPressTimerRef = useRef(null);
  const dismissedIdsRef = useRef(new Set());
  const activeRole = account?.role ?? pathRole ?? "consumer";
  const activeRoleConfig = ROLE_CONFIG[activeRole] ?? ROLE_CONFIG.consumer;

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (activeRole !== "meter-reader") return;
    const fetchPending = async () => {
      try {
        const pending = await getPendingMeterReadings();
        setPendingCount(pending.length);
      } catch {
        // silent
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 15000);
    return () => clearInterval(interval);
  }, [activeRole]);

  useEffect(() => {
    const controller = new AbortController();
    let notificationIntervalId;

    getCurrentAccount({ signal: controller.signal })
      .then(({ user }) => {
        setAccount(user);
        setAccountName(user?.name ?? user?.email ?? "");
      })
      .catch((error) => {
        setAccountName("");
        if (error.response?.status === 401) navigate("/login");
      });

    if (activeRole === "consumer") {
      queueMicrotask(() => setIsNotificationLoading(true));

      const refreshNotifications = (isInitialLoad = false) =>
        fetchNotifications({ signal: controller.signal })
          .then((incomingNotifications) =>
            setNotifications((currentNotifications) =>
              incomingNotifications
                .filter((incoming) => !dismissedIdsRef.current.has(incoming.id))
                .map((incoming) => ({
                  ...incoming,
                  isRead:
                    incoming.isRead ||
                    currentNotifications.some(
                      (current) => current.id === incoming.id && current.isRead,
                    ),
                })),
            ),
          )
          .catch((error) => {
            if (!isCanceledRequest(error)) setNotifications([]);
          })
          .finally(() => {
            if (isInitialLoad && !controller.signal.aborted) {
              setIsNotificationLoading(false);
            }
          });

      refreshNotifications(true);
      notificationIntervalId = window.setInterval(refreshNotifications, 15000);
    } else {
      queueMicrotask(() => {
        setNotifications([]);
        setIsNotificationLoading(false);
      });
    }

    return () => {
      controller.abort();
      if (notificationIntervalId) {
        window.clearInterval(notificationIntervalId);
      }
    };
  }, [activeRole, navigate]);

  const accountId = account?.id;

  const dismissPushPrompt = useCallback(({ markDismissed = true } = {}) => {
    if (markDismissed && accountId) {
      window.sessionStorage.setItem(`${PUSH_PROMPT_SESSION_PREFIX}${accountId}`, "true");
    }
    if (pushToastIdRef.current) {
      toast.dismiss(pushToastIdRef.current);
      pushToastIdRef.current = null;
    }
    isEnablingPushRef.current = false;
  }, [accountId, toast]);

  const handleEnablePush = useCallback(async () => {
    if (isEnablingPushRef.current) return;
    isEnablingPushRef.current = true;
    try {
      await enablePushNotifications();
      dismissPushPrompt();
      toast.success("Notifications enabled", "This device will receive WaterWise alerts even when the app is closed.");
    } catch (error) {
      isEnablingPushRef.current = false;
      if (Notification.permission === "denied") dismissPushPrompt();
      toast.error("Notifications not enabled", error.message);
    }
  }, [dismissPushPrompt, toast]);

  const showPushToast = useCallback(() => {
    if (pushToastIdRef.current) return;
    const id = toast.show({
      actions: [
        { label: "Enable notifications", onClick: () => handleEnablePush(), variant: "primary" },
        { label: "Not now", onClick: () => dismissPushPrompt(), variant: "ghost" },
      ],
      duration: 0,
      message: "Get bill reminders and service alerts even when the app is closed.",
      title: "Enable push notifications",
      type: "info",
    });
    pushToastIdRef.current = id;
  }, [dismissPushPrompt, handleEnablePush, toast]);

  useEffect(() => {
    if (
      activeRole !== "consumer" ||
      !accountId ||
      !pushSupported() ||
      Notification.permission === "denied" ||
      window.sessionStorage.getItem(`${PUSH_PROMPT_SESSION_PREFIX}${accountId}`)
    ) return undefined;

    const controller = new AbortController();
    Promise.all([
      getCurrentPushSubscription(),
      getPushConfiguration({ signal: controller.signal }),
    ]).then(([subscription, configuration]) => {
      if (controller.signal.aborted) return;
      if (subscription) {
        enableConsumerPushSessionPersistence();
      } else if (configuration.enabled) {
        showPushToast();
      }
    }).catch((error) => {
      if (!isCanceledRequest(error)) console.error("Push prompt check failed:", error.message);
    });

    return () => controller.abort();
  }, [accountId, activeRole, showPushToast]);

  useEffect(() => () => {
    if (pushToastIdRef.current) {
      toast.dismiss(pushToastIdRef.current);
      pushToastIdRef.current = null;
    }
    isEnablingPushRef.current = false;
  }, [accountId, toast]);

  useEffect(() => {
    if (!isNotificationOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (isDeleteConfirmOpen) return;
      if (!notificationMenuRef.current?.contains(event.target)) {
        setIsNotificationOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsNotificationOpen(false);
        notificationTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationOpen, isDeleteConfirmOpen]);

  useEffect(() => {
    if (!isNotificationOpen) {
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [isNotificationOpen]);

  useEffect(() => {
    // The change-email page announces success through this event (replacing
    // the old modal's onSuccess): sync the header account state and storage.
    const syncEmailChanged = (event) => {
      const nextEmail = event.detail?.email;
      if (!nextEmail) return;
      setAccount((current) => (current ? { ...current, email: nextEmail } : current));
      try {
        window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ ...getStoredAccount(), email: nextEmail }));
      } catch {
        // Storage may be unavailable; the profile page still shows the update.
      }
    };
    const requestLogout = () => setIsLogoutConfirmOpen(true);
    window.addEventListener("waterwise:email-changed", syncEmailChanged);
    window.addEventListener("waterwise:request-logout", requestLogout);
    return () => {
      window.removeEventListener("waterwise:email-changed", syncEmailChanged);
      window.removeEventListener("waterwise:request-logout", requestLogout);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type !== "WATERWISE_PUSH_CLICK" || activeRole !== "consumer") return;
      try {
        const target = new URL(event.data.url, window.location.origin);
        if (target.origin !== window.location.origin || !target.pathname.startsWith("/consumer")) return;
        navigate(`${target.pathname}${target.search}${target.hash}`);
      } catch {
        navigate("/consumer/home");
      }
    };
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
  }, [activeRole, navigate]);

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      toast.success("Signed out", "You have securely signed out of WaterWise.");
    } catch {
      toast.warning("Signed out locally", "The server could not confirm sign-out, but this device session was cleared.");
    } finally {
      setAccount(null);
      setIsNotificationOpen(false);
      setIsLogoutConfirmOpen(false);
      setIsSigningOut(false);
      navigate("/login");
    }
  };

  const handleMarkNotificationAsRead = async (notificationId) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item,
        ),
      );
    } catch {
      // Keep the unread state when the backend update fails.
      toast.error("Notification not updated", "WaterWise could not mark this notification as read.");
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) => ({ ...item, isRead: true })),
      );
      toast.success("All caught up", "All notifications marked as read.");
    } catch {
      toast.error("Notifications not updated", "WaterWise could not mark all notifications as read.");
    }
  };

  const handleNotificationLongPressStart = useCallback((notificationId) => {
    const notification = notifications.find((n) => n.id === notificationId);
    if (!notification?.isRead) return;
    longPressTimerRef.current = setTimeout(() => {
      setIsSelectionMode(true);
      setSelectedIds(new Set([notificationId]));
    }, 500);
  }, [notifications]);

  const handleNotificationLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleToggleSelection = useCallback((notificationId) => {
    const notification = notifications.find((n) => n.id === notificationId);
    if (!notification?.isRead) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      if (next.size === 0) setIsSelectionMode(false);
      return next;
    });
  }, [notifications]);

  const handleCancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    const ids = [...selectedIds];
    setIsDeleteConfirmOpen(false);
    try {
      await deleteNotifications(ids);
      ids.forEach((id) => dismissedIdsRef.current.add(id));
      setNotifications((current) => current.filter((item) => !selectedIds.has(item.id)));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      toast.success("Deleted", `${ids.length} notification${ids.length === 1 ? "" : "s"} removed.`);
    } catch {
      toast.error("Delete failed", "WaterWise could not delete the selected notifications.");
    }
  };

  const handleNotificationClick = (notification) => {
    setIsNotificationOpen(false);
    if (notification.actionPath) {
      navigate(notification.actionPath);
      return;
    }
    setSelectedNotification(notification);
  };

  useEffect(() => {
    if (activeRole !== "consumer") return;
    const notificationId = Number(new URLSearchParams(location.search).get("notificationId"));
    if (!Number.isInteger(notificationId) || notificationId < 1) return;
    queueMicrotask(() => handleMarkNotificationAsRead(notificationId));
    const parameters = new URLSearchParams(location.search);
    parameters.delete("notificationId");
    navigate({ pathname: location.pathname, search: parameters.toString() ? `?${parameters}` : "" }, { replace: true });
  // This runs only when a push-notification click adds a notificationId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole, location.pathname, location.search, navigate]);

  const selectedNotificationPresentation = getNotificationPresentation(
    selectedNotification ?? {},
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Header
        accountName={accountName || activeRoleConfig.userName}
        activeRole={activeRole}
        activeRoleLabel={activeRoleConfig.label}
        notificationSlot={
          activeRole === "consumer" ? (
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <div className="relative" ref={notificationMenuRef}>
              <NotificationBadgeTrigger
                buttonRef={notificationTriggerRef}
                isOpen={isNotificationOpen}
                onToggleHub={() => setIsNotificationOpen((isOpen) => !isOpen)}
                unreadCount={unreadCount}
              />
              {isNotificationOpen && (
                <section
                  aria-label="Notifications"
                  className="ww-popover-enter fixed right-3 top-[4.5rem] z-50 flex max-h-[min(70vh,38rem)] w-[calc(100vw-1.5rem)] max-w-[26rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-modal sm:right-6 sm:top-20"
                  id="consumer-notification-popup"
                  role="dialog"
                >
                  <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
                    {isSelectionMode ? (
                      <>
                        <div className="flex items-center gap-3">
                          <button
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
                            onClick={handleCancelSelection}
                            type="button"
                          >
                            <FiX aria-hidden="true" className="h-4 w-4" />
                          </button>
                          <span className="text-sm font-bold text-navy-900">{selectedIds.size} selected</span>
                        </div>
                        <button
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          disabled={selectedIds.size === 0}
                          onClick={handleDeleteSelected}
                          type="button"
                        >
                          <FiTrash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <div>
                          <h2 className="text-base font-extrabold tracking-[-0.03em] text-navy-900">Notifications</h2>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              className="rounded-lg px-3 py-1.5 text-xs font-bold text-water-700 transition-colors hover:bg-water-50"
                              onClick={handleMarkAllNotificationsAsRead}
                              type="button"
                            >
                              Mark all as read
                            </button>
                          )}
                          {unreadCount > 0 && <span className="rounded-full bg-water-50 px-3 py-1 text-xs font-bold text-water-700">New</span>}
                        </div>
                      </>
                    )}
                  </header>
                  <NotificationPage
                    isLoading={isNotificationLoading}
                    notifications={notifications}
                    onNotificationClick={handleNotificationClick}
                    onMarkAsRead={handleMarkNotificationAsRead}
                    isSelectionMode={isSelectionMode}
                    selectedIds={selectedIds}
                    onLongPressStart={handleNotificationLongPressStart}
                    onLongPressEnd={handleNotificationLongPressEnd}
                    onToggleSelection={handleToggleSelection}
                  />
                </section>
              )}
              </div>
            </div>
          ) : null
        }
        onProfile={
          activeRole === "consumer"
            ? () => navigate("/consumer/profile-details")
            : ["admin", "super-admin"].includes(activeRole)
              ? () => navigate("/admin/profile")
              : activeRole === "meter-reader"
                ? () => navigate("/meter-reader/profile")
                : undefined
        }
        title="WaterWise"
      />

      {!isOnline && (
        <div
          className="sticky top-16 z-30 flex min-h-9 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-800 sm:min-h-11 sm:text-sm"
          role="status"
        >
          <FiWifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          Offline mode · {activeRole === "meter-reader" ? `${pendingCount} reading${pendingCount === 1 ? "" : "s"} safely stored on this device. Changes will be submitted after you reconnect.` : "Changes will be submitted after you reconnect."}
        </div>
      )}

      {/* Desktop content is anchored beside the fixed-width sidebar; mobile
          content reserves space for the persistent bottom navigation. */}
      <div className="w-full lg:flex">
        <Sidebar
          accountName={accountName || activeRoleConfig.userName}
          activeRoleLabel={activeRoleConfig.label}
          items={activeRoleConfig.links}
          onLogout={() => setIsLogoutConfirmOpen(true)}
          onProfile={
            activeRole === "consumer"
              ? () => navigate("/consumer/profile-details")
              : ["admin", "super-admin"].includes(activeRole)
                ? () => navigate("/admin/profile")
                : activeRole === "meter-reader"
                  ? () => navigate("/meter-reader/profile")
                  : undefined
          }
        />

        <main
          className="ww-workspace min-w-0 flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0"
          id="main-content"
        >
          <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </div>
        </main>
      </div>

      <LogoutConfirmationModal
        isOpen={isLogoutConfirmOpen}
        isSigningOut={isSigningOut}
        onCancel={() => setIsLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />

      <Modal
        description={selectedNotificationPresentation.label}
        eyebrow={selectedNotification?.priority === "critical" ? "Urgent update" : "WaterWise notification"}
        isOpen={Boolean(selectedNotification)}
        onClose={() => setSelectedNotification(null)}
        size="sm"
        title={selectedNotification?.title}
      >
        {selectedNotification && (
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                selectedNotification.priority === "critical"
                  ? "bg-red-100 text-red-700"
                  : selectedNotification.priority === "high"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-water-100 text-water-700"
              }`}>
                <selectedNotificationPresentation.Icon aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-6 text-slate-700">{selectedNotification.message}</p>
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  {new Intl.DateTimeFormat("en-PH", {
                    dateStyle: "medium",
                    timeStyle: selectedNotification.createdAt ? "short" : undefined,
                    timeZone: selectedNotification.createdAt ? "Asia/Manila" : "UTC",
                  }).format(new Date(selectedNotification.createdAt ?? `${selectedNotification.date}T00:00:00Z`))}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
              <button
                className="min-h-11 rounded-xl bg-water-600 px-5 text-sm font-bold text-white hover:bg-water-700"
                onClick={() => setSelectedNotification(null)}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 pb-8 sm:items-center sm:pb-4" onClick={() => setIsDeleteConfirmOpen(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-slate-900">Delete {selectedIds.size} notification{selectedIds.size === 1 ? "" : "s"}?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={() => setIsDeleteConfirmOpen(false)} type="button">Cancel</button>
              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700" onClick={handleConfirmDelete} type="button">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
