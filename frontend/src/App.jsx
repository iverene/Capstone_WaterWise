import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { isAnyModalOpen, subscribeToModalStack } from "./components/modalStack";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingSkeleton from "./components/LoadingSkeleton";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import RateLimitToast from "./components/RateLimitToast";
import RouteAccessError from "./components/RouteAccessError";
import SessionInactivityGuard from "./components/SessionInactivityGuard";
import {
  getStoredAccount as getSessionAccount,
  hasAuthenticatedSession,
} from "./services/authToken";
import Login from "./pages/Login";
import {
  AdminAccountInformation,
  AdminDashboardPage,
  AdminProfile,
  AdminReadingsPage,
  AdminSettingsPage,
  AnalyticsDashboard,
  AnnouncementManagementPage,
  AnnouncementsPage,
  AppLayout,
  BillingLedger,
  BillingManagementPage,
  ChangeEmailPage,
  ChangePasswordPage,
  ConsumerAccountInformation,
  ConsumerBillsPage,
  ConsumerHome,
  ConsumerManagementPage,
  ConsumerOnboarding,
  ConsumerPaymentsPage,
  ConsumerProfile,
  ConsumerReadingsPage,
  EventManagementPage,
  FlaggedAccountsPage,
  ForgotPassword,
  getRolePrefetchLoaders,
  MeterIncidentsPage,
  MeterReaderAccountInformation,
  MeterReaderProfile,
  NotFoundPage,
  PaymentProcessingPage,
  RecordConsumptionPage,
  ReportMeterIncidentPage,
  Reports,
  ResetPassword,
  UsageMetrics,
} from "./routeModules";
import { clearApiCache } from "./services/apiCache";
import { getCurrentAccount } from "./services/auth.service";
import { subscribeToDataChanges } from "./services/dataChangeStream";
import { startSessionRefresh } from "./services/sessionRefresh";



const roleAccess = {
  admin: {
    homePath: "/admin/dashboard",
    label: "Admin",
    paths: [
      "/admin",
      "/admin/dashboard",
      "/admin/profile",
      "/admin/account-information",
      "/admin/consumers",
      "/admin/readings",
      "/admin/meter-incidents",
      "/admin/consumer-readings",
      "/admin/consumer-billings",
      "/admin/billings",
      "/admin/payments",
      "/admin/flagged-accounts",
      "/admin/events",
      "/admin/announcements",
      "/admin/analytics",
      "/admin/profile",
      "/admin/account-information",
      "/admin/reports",
    ],
  },
  "meter-reader": {
    homePath: "/meter-reader/readings-entry",
    label: "Meter Reader",
    paths: [
      "/meter-reader",
      "/meter-reader/readings-entry",
      "/meter-reader/meter-incidents",
      "/meter-reader/profile",
      "/meter-reader/account-information",
    ],
  },
  consumer: {
    homePath: "/consumer/home",
    label: "Consumer",
    paths: [
      "/consumer",
      "/consumer/home",
      "/consumer/onboarding",
      "/consumer/announcements",
      "/consumer/profile-details",
      "/consumer/account-information",
      "/consumer/billing-ledger",
      "/consumer/payments",
      "/consumer/analytics",
      "/consumer/usage-metrics",
    ],
  },
};

roleAccess["super-admin"] = {
  ...roleAccess.admin,
  label: "Super Admin",
  paths: [...roleAccess.admin.paths, "/admin/staff-management", "/admin/settings"],
};

function RouteChunkFallback() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:px-6" aria-busy="true">
      <div className="mx-auto w-full max-w-[1440px]">
        <LoadingSkeleton count={3} label="Loading page" variant="list" />
      </div>
    </main>
  );
}

function prefetchRoleModules(role) {
  const queue = getRolePrefetchLoaders(role);
  let cancelled = false;
  let idleHandle = null;
  let delayHandle = null;

  const scheduleNext = () => {
    if (cancelled || queue.length === 0) return;
    const run = () => {
      if (cancelled) return;
      const load = queue.shift();
      load().catch(() => {
        // Navigation will retry through React.lazy and the error boundary.
      }).finally(scheduleNext);
    };
    if ("requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(run, { timeout: 3000 });
    } else {
      idleHandle = window.setTimeout(run, 250);
    }
  };

  // Let the destination page finish its own first paint before downloading
  // the rest of that role's routes one at a time in the background.
  delayHandle = window.setTimeout(scheduleNext, 1000);

  return () => {
    cancelled = true;
    window.clearTimeout(delayHandle);
    if (idleHandle == null) return;
    if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
    else window.clearTimeout(idleHandle);
  };
}

function SessionExpiryGuard() {
  // Cookie-only: no readable JWT exp. Backend 401 + apiClient interceptor
  // handle expiry/inactivity (clearSession + redirect to /login).
  return null;
}

function getStoredAccount() {
  if (!hasAuthenticatedSession()) return null;
  const account = getSessionAccount();
  return roleAccess[account?.role] ? account : null;
}

function RoleRouteGuard({ children, requiredRole }) {
  const location = useLocation();
  const account = getStoredAccount();
  const storedRole = account?.role;
  const requestedRole = roleAccess[requiredRole];

  if (!storedRole) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  const satisfiesAdminRole = storedRole === "super-admin" && requiredRole === "admin";
  if (storedRole && storedRole !== requiredRole && !satisfiesAdminRole) {
    return (
      <RouteAccessError
        allowedPath={roleAccess[storedRole].homePath}
        currentRoleLabel={roleAccess[storedRole].label}
        requestedRoleLabel={requestedRole.label}
      />
    );
  }

  if (!requestedRole.paths.includes(location.pathname)) {
    return (
      <RouteAccessError
        allowedPath={requestedRole.homePath}
        currentRoleLabel={requestedRole.label}
        requestedRoleLabel={requestedRole.label}
      />
    );
  }

  return children;
}

// Shared account pages (e.g. change password) accept any authenticated role.
// Role-specific pages keep using RoleRouteGuard with their path allowlists.
function AnyRoleRouteGuard({ children }) {
  const location = useLocation();
  const account = getStoredAccount();

  if (!account) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  return children;
}

// Consumers who have not finished first-login onboarding are sent to the
// wizard once, on the first consumer page they open in this page load.
// Only "completed" is memoized: after the wizard finishes we must be able to
// re-verify, otherwise the cached "false" would bounce the resident straight
// back into onboarding.
const consumerOnboardingVerified = new Map();

function ConsumerOnboardingGate() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/consumer")) return;
    if (location.pathname === "/consumer/onboarding") return;

    const account = getSessionAccount();
    if (account?.role !== "consumer") return;
    if (consumerOnboardingVerified.get(account.id) === true) return;

    let cancelled = false;
    getCurrentAccount()
      .then(({ user }) => {
        if (cancelled) return;
        // Fail open on a missing flag: only an explicit false blocks access.
        // Onboarding is not a security control, so a partial payload or a
        // backend hiccup must never lock a resident out of their dashboard.
        if (user.onboardingCompleted === false) {
          navigate("/consumer/onboarding", { replace: true });
          return;
        }
        consumerOnboardingVerified.set(user.id, true);
      })
      .catch(() => {
        // Ignore: apiClient already handles 401 by moving to the login page.
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Navigate replace to="/login" />} path="/" />
      <Route element={<Login />} path="/login" />
      <Route element={<ForgotPassword />} path="/forgot-password" />
      <Route element={<ResetPassword />} path="/reset-password" />
      <Route
        element={
          <AnyRoleRouteGuard>
            <AppLayout><ChangePasswordPage /></AppLayout>
          </AnyRoleRouteGuard>
        }
        path="/account/change-password"
      />
      <Route
        element={
          <AnyRoleRouteGuard>
            <AppLayout><ChangeEmailPage /></AppLayout>
          </AnyRoleRouteGuard>
        }
        path="/account/change-email"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="meter-reader">
            <AppLayout><RecordConsumptionPage /></AppLayout>
          </RoleRouteGuard>
        }
        path="/meter-reader/readings-entry"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="meter-reader">
            <AppLayout><ReportMeterIncidentPage /></AppLayout>
          </RoleRouteGuard>
        }
        path="/meter-reader/meter-incidents"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="meter-reader">
            <AppLayout><MeterReaderProfile /></AppLayout>
          </RoleRouteGuard>
        }
        path="/meter-reader/profile"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="meter-reader">
            <AppLayout><MeterReaderAccountInformation /></AppLayout>
          </RoleRouteGuard>
        }
        path="/meter-reader/account-information"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="admin">
            <Navigate replace to="/admin/dashboard" />
          </RoleRouteGuard>
        }
        path="/admin"
      />
      <Route
        path="/admin/profile"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout><AdminProfile /></AppLayout>
          </RoleRouteGuard>
        }
      />


      <Route
        path="/admin/dashboard"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <AdminDashboardPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/payments"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <PaymentProcessingPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/flagged-accounts"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <FlaggedAccountsPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/announcements"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <AnnouncementManagementPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/events"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <EventManagementPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/billings"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <BillingManagementPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/readings"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <AdminReadingsPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/meter-incidents"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <MeterIncidentsPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/consumers"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <ConsumerManagementPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/consumer-readings"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <ConsumerReadingsPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/consumer-billings"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <ConsumerBillsPage />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout>
              <Reports />
            </AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
              path="/admin/analytics"
              element={
                <RoleRouteGuard requiredRole="admin">
                  <AppLayout>
                    <AnalyticsDashboard />
                  </AppLayout>
                </RoleRouteGuard>
              }
            />
      <Route
        element={
          <RoleRouteGuard requiredRole="meter-reader">
            <Navigate replace to="/meter-reader/readings-entry" />
          </RoleRouteGuard>
        }
        path="/meter-reader"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <Navigate replace to="/consumer/home" />
          </RoleRouteGuard>
        }
        path="/consumer"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <ConsumerOnboarding />
          </RoleRouteGuard>
        }
        path="/consumer/onboarding"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <AppLayout>
              <ConsumerHome />
            </AppLayout>
          </RoleRouteGuard>
        }
        path="/consumer/home"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <AppLayout>
              <AnnouncementsPage />
            </AppLayout>
          </RoleRouteGuard>
        }
        path="/consumer/announcements"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <AppLayout>
              <ConsumerProfile />
            </AppLayout>
          </RoleRouteGuard>
        }
        path="/consumer/profile-details"
      />
      <Route
        path="/admin/account-information"
        element={
          <RoleRouteGuard requiredRole="admin">
            <AppLayout><AdminAccountInformation /></AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/staff-management"
        element={
          <RoleRouteGuard requiredRole="super-admin">
            <AppLayout><AdminProfile /></AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <RoleRouteGuard requiredRole="super-admin">
            <AppLayout><AdminSettingsPage /></AppLayout>
          </RoleRouteGuard>
        }
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <AppLayout>
              <ConsumerAccountInformation />
            </AppLayout>
          </RoleRouteGuard>
        }
        path="/consumer/account-information"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <AppLayout>
              <BillingLedger />
            </AppLayout>
          </RoleRouteGuard>
        }
        path="/consumer/billing-ledger"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <AppLayout>
              <ConsumerPaymentsPage />
            </AppLayout>
          </RoleRouteGuard>
        }
        path="/consumer/payments"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <AppLayout>
              <UsageMetrics />
            </AppLayout>
          </RoleRouteGuard>
        }
        path="/consumer/analytics"
      />
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <Navigate replace to="/consumer/analytics" />
          </RoleRouteGuard>
        }
        path="/consumer/usage-metrics"
      />
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}

export default function App() {
  const [dataRevision, setDataRevision] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);
  // Most data changes remount the route tree so every screen refetches. Data
  // pages use targeted refreshes to preserve their layout and local state.
  // A remount while a dialog is open would tear the dialog down and destroy
  // its state, so it is deferred until the last dialog closes.
  const pendingRevisionRef = useRef(false);
  const remountTimerRef = useRef(null);

  const applyRevision = useCallback(() => {
    setDataRevision((revision) => revision + 1);
  }, []);

  const refreshForCurrentRoute = useCallback(() => {
    const targetedRoutes = new Set([
      "/admin/dashboard",
      "/admin/readings",
      "/admin/meter-incidents",
      "/admin/billings",
      "/admin/payments",
      "/admin/analytics",
      "/consumer/home",
      "/consumer/announcements",
      "/consumer/profile-details",
      "/consumer/account-information",
      "/consumer/billing-ledger",
      "/consumer/payments",
      "/consumer/analytics",
      "/meter-reader/readings-entry",
      "/meter-reader/meter-incidents",
      "/meter-reader/profile",
      "/meter-reader/account-information",
    ]);
    const path = window.location.pathname;
    if (targetedRoutes.has(path)) {
      window.dispatchEvent(new CustomEvent("waterwise:targeted-refresh", {
        detail: { path },
      }));
      return;
    }
    applyRevision();
  }, [applyRevision]);

  useEffect(() => subscribeToDataChanges(() => {
    clearApiCache();
    // The first-login wizard holds local step and form state. Any mutation
    // anywhere in the system bumps the revision and remounts the whole route
    // tree, which would throw the resident back to step 1 mid-flow, so
    // revision remounts are paused while the wizard is open.
    if (window.location.pathname === "/consumer/onboarding") return;
    // Same for an open dialog: a write flow that spans one (the resident
    // password verification code) must be able to finish.
    if (isAnyModalOpen()) {
      pendingRevisionRef.current = true;
      return;
    }
    // Debounce a burst of mutations into one remount. This gives offline
    // meter-reading sync time to finish several sequential writes before
    // every open screen refetches its data.
    window.clearTimeout(remountTimerRef.current);
    remountTimerRef.current = window.setTimeout(() => {
      remountTimerRef.current = null;
      // A dialog may have opened while the timer was pending; never tear the
      // UI down under an open dialog.
      if (isAnyModalOpen()) {
        pendingRevisionRef.current = true;
        return;
      }
      refreshForCurrentRoute();
    }, 3000);
  }), [sessionRevision, refreshForCurrentRoute]);

  useEffect(() => subscribeToModalStack((open) => {
    if (open || !pendingRevisionRef.current) return;
    pendingRevisionRef.current = false;
    window.clearTimeout(remountTimerRef.current);
    remountTimerRef.current = null;
    refreshForCurrentRoute();
  }), [refreshForCurrentRoute]);

  useEffect(() => () => window.clearTimeout(remountTimerRef.current), []);

  useEffect(() => startSessionRefresh(), []);

  useEffect(() => {
    const sessionChanged = () => setSessionRevision((revision) => revision + 1);
    window.addEventListener("waterwise-session-changed", sessionChanged);
    return () => window.removeEventListener("waterwise-session-changed", sessionChanged);
  }, []);

  useEffect(() => {
    const role = getSessionAccount()?.role;
    if (!role) return undefined;
    return prefetchRoleModules(role);
  }, [sessionRevision]);

  return (
    <BrowserRouter>
      <SessionExpiryGuard />
      <SessionInactivityGuard />
      <RateLimitToast />
      <ConsumerOnboardingGate />
      <ErrorBoundary>
        <Suspense fallback={<RouteChunkFallback />}>
          <AppRoutes key={dataRevision} />
        </Suspense>
      </ErrorBoundary>
      <PWAInstallPrompt />
    </BrowserRouter>
  );
}
