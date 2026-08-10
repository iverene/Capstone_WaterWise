import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import AppLayout from "./components/AppLayout";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import RouteAccessError from "./components/RouteAccessError";
import {
  getStoredAccount as getSessionAccount,
  clearSession,
  getAccessTokenExpiresAt,
  hasAuthenticatedSession,
} from "./services/authToken";
import BillingLedger from "./pages/BillingLedger";
import ConsumerProfile from "./pages/ConsumerProfile";
import ConsumerHome from "./pages/ConsumerHome";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import UsageMetrics from "./pages/UsageMetrics";
import AnalyticsDashboard from "./pages/analyticsDashboard";
import Reports from "./pages/Reports";
import ConsumerManagementPage from "./pages/ConsumerManagementPage";
import AdminReadingsPage from "./pages/AdminReadingsPage";
import BillingManagementPage from "./pages/BillingManagementPage";
import EventManagementPage from "./pages/EventManagementPage";
import AnnouncementManagementPage from "./pages/AnnouncementManagementPage";
import PaymentProcessingPage from "./pages/PaymentProcessingPage";
import FlaggedAccountsPage from "./pages/FlaggedAccountsPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminProfile from "./pages/AdminProfile";
import RecordConsumptionPage from "./pages/RecordConsumptionPage";
import { clearApiCache } from "./services/apiCache";
import { subscribeToDataChanges } from "./services/dataChangeStream";

const portalRoutes = [
  { label: "Dashboard", path: "/admin/dashboard" },
  { label: "Profile", path: "/admin/profile" },
  { label: "Residents", path: "/admin/consumers" },
  { label: "Readings", path: "/admin/readings" },
  { label: "Billing", path: "/admin/billings" },
  { label: "Payments", path: "/admin/payments" },
  { label: "Flagged Accounts", path: "/admin/flagged-accounts" },
  { label: "Events", path: "/admin/events" },
  { label: "Announcements", path: "/admin/announcements" },
  { label: "Record Consumption Entry", path: "/meter-reader/readings-entry" },
  { label: "Profile", path: "/consumer/profile-details" },
  { label: "Bills", path: "/consumer/billing-ledger" },
  { label: "Home", path: "/consumer/home" },
  { label: "Announcements", path: "/consumer/announcements" },
  { label: "Analytics", path: "/consumer/analytics" },
  { label: "Analytics", path: "/admin/analytics" },
  { label: "Reports", path: "/admin/reports" },
];

const roleAccess = {
  admin: {
    homePath: "/admin/dashboard",
    label: "Admin",
    paths: [
      "/admin",
      "/admin/dashboard",
      "/admin/profile",
      "/admin/consumers",
      "/admin/readings",
      "/admin/billings",
      "/admin/payments",
      "/admin/flagged-accounts",
      "/admin/events",
      "/admin/announcements",
      "/admin/analytics",
      "/admin/reports",
    ],
  },
  "meter-reader": {
    homePath: "/meter-reader/readings-entry",
    label: "Meter Reader",
    paths: [
      "/meter-reader",
      "/meter-reader/readings-entry",
    ],
  },
  consumer: {
    homePath: "/consumer/home",
    label: "Consumer",
    paths: [
      "/consumer",
      "/consumer/home",
      "/consumer/announcements",
      "/consumer/profile-details",
      "/consumer/billing-ledger",
      "/consumer/analytics",
      "/consumer/usage-metrics",
    ],
  },
};

roleAccess["super-admin"] = {
  ...roleAccess.admin,
  label: "Super Admin",
  paths: [...roleAccess.admin.paths],
};

function findRouteLabel(pathname) {
  return portalRoutes.find((route) => route.path === pathname)?.label ?? "Dashboard";
}

function MockPortalPage() {
  const location = useLocation();
  const pageTitle = findRouteLabel(location.pathname);

  return (
    <AppLayout>
      <section className="ww-glass-strong rounded-2xl p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-water-600">
          Mock workspace
        </p>
        <h2 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.02em] text-navy-900">
          {pageTitle}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          This canvas is ready for the {pageTitle.toLowerCase()} page view.
          Data-connected modules can be placed here without changing the shared
          WaterWise layout shell.
        </p>
      </section>
    </AppLayout>
  );
}

function SessionExpiryGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const expiresAt = getAccessTokenExpiresAt();
    if (!expiresAt) return undefined;
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      clearSession();
      navigate("/login", { replace: true, state: { sessionExpired: true } });
      return undefined;
    }
    const timer = window.setTimeout(() => {
      clearSession();
      navigate("/login", { replace: true, state: { sessionExpired: true } });
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [location.pathname, navigate]);

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

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Navigate replace to="/login" />} path="/" />
      <Route element={<Login />} path="/login" />
      <Route element={<ForgotPassword />} path="/forgot-password" />
      <Route element={<ResetPassword />} path="/reset-password" />
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
          <RoleRouteGuard requiredRole="admin">
            <MockPortalPage />
          </RoleRouteGuard>
        }
        path="/admin/:section"
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
          <RoleRouteGuard requiredRole="meter-reader">
            <MockPortalPage />
          </RoleRouteGuard>
        }
        path="/meter-reader/:section"
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
      <Route
        element={
          <RoleRouteGuard requiredRole="consumer">
            <MockPortalPage />
          </RoleRouteGuard>
        }
        path="/consumer/:section"
      />
      <Route element={<Navigate replace to="/login" />} path="*" />
    </Routes>
  );
}

export default function App() {
  const [dataRevision, setDataRevision] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);

  useEffect(() => subscribeToDataChanges(() => {
    clearApiCache();
    setDataRevision((revision) => revision + 1);
  }), [sessionRevision]);

  useEffect(() => {
    const sessionChanged = () => setSessionRevision((revision) => revision + 1);
    window.addEventListener("waterwise-session-changed", sessionChanged);
    return () => window.removeEventListener("waterwise-session-changed", sessionChanged);
  }, []);

  return (
    <BrowserRouter>
      <SessionExpiryGuard />
      <AppRoutes key={dataRevision} />
      <PWAInstallPrompt />
    </BrowserRouter>
  );
}
