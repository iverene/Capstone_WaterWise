import { lazy } from "react";

const loaders = {
  AppLayout: () => import("./components/AppLayout"),
  BillingLedger: () => import("./pages/BillingLedger"),
  ConsumerProfile: () => import("./pages/ConsumerProfile"),
  ConsumerAccountInformation: () => import("./pages/ConsumerAccountInformation"),
  ConsumerHome: () => import("./pages/ConsumerHome"),
  ConsumerOnboarding: () => import("./pages/ConsumerOnboarding"),
  AnnouncementsPage: () => import("./pages/AnnouncementsPage"),
  ForgotPassword: () => import("./pages/ForgotPassword"),
  ResetPassword: () => import("./pages/ResetPassword"),
  ChangePasswordPage: () => import("./pages/ChangePasswordPage"),
  ChangeEmailPage: () => import("./pages/ChangeEmailPage"),
  NotFoundPage: () => import("./pages/NotFoundPage"),
  UsageMetrics: () => import("./pages/UsageMetrics"),
  AnalyticsDashboard: () => import("./pages/analyticsDashboard"),
  Reports: () => import("./pages/Reports"),
  ConsumerManagementPage: () => import("./pages/ConsumerManagementPage"),
  AdminReadingsPage: () => import("./pages/AdminReadingsPage"),
  ConsumerBillsPage: () => import("./pages/ConsumerBillsPage"),
  ConsumerPaymentsPage: () => import("./pages/ConsumerPaymentsPage"),
  ConsumerReadingsPage: () => import("./pages/ConsumerReadingsPage"),
  BillingManagementPage: () => import("./pages/BillingManagementPage"),
  EventManagementPage: () => import("./pages/EventManagementPage"),
  AnnouncementManagementPage: () => import("./pages/AnnouncementManagementPage"),
  PaymentProcessingPage: () => import("./pages/PaymentProcessingPage"),
  FlaggedAccountsPage: () => import("./pages/FlaggedAccountsPage"),
  AdminDashboardPage: () => import("./pages/AdminDashboardPage"),
  AdminProfile: () => import("./pages/AdminProfile"),
  AdminSettingsPage: () => import("./pages/AdminSettingsPage"),
  AdminAccountInformation: () => import("./pages/AdminAccountInformation"),
  MeterIncidentsPage: () => import("./pages/MeterIncidentsPage"),
  RecordConsumptionPage: () => import("./pages/RecordConsumptionPage"),
  ReportMeterIncidentPage: () => import("./pages/ReportMeterIncidentPage"),
  MeterReaderProfile: () => import("./pages/MeterReaderProfile"),
  MeterReaderAccountInformation: () => import("./pages/MeterReaderAccountInformation"),
};

export const AppLayout = lazy(loaders.AppLayout);
export const BillingLedger = lazy(loaders.BillingLedger);
export const ConsumerProfile = lazy(loaders.ConsumerProfile);
export const ConsumerAccountInformation = lazy(loaders.ConsumerAccountInformation);
export const ConsumerHome = lazy(loaders.ConsumerHome);
export const ConsumerOnboarding = lazy(loaders.ConsumerOnboarding);
export const AnnouncementsPage = lazy(loaders.AnnouncementsPage);
export const ForgotPassword = lazy(loaders.ForgotPassword);
export const ResetPassword = lazy(loaders.ResetPassword);
export const ChangePasswordPage = lazy(loaders.ChangePasswordPage);
export const ChangeEmailPage = lazy(loaders.ChangeEmailPage);
export const NotFoundPage = lazy(loaders.NotFoundPage);
export const UsageMetrics = lazy(loaders.UsageMetrics);
export const AnalyticsDashboard = lazy(loaders.AnalyticsDashboard);
export const Reports = lazy(loaders.Reports);
export const ConsumerManagementPage = lazy(loaders.ConsumerManagementPage);
export const AdminReadingsPage = lazy(loaders.AdminReadingsPage);
export const ConsumerBillsPage = lazy(loaders.ConsumerBillsPage);
export const ConsumerPaymentsPage = lazy(loaders.ConsumerPaymentsPage);
export const ConsumerReadingsPage = lazy(loaders.ConsumerReadingsPage);
export const BillingManagementPage = lazy(loaders.BillingManagementPage);
export const EventManagementPage = lazy(loaders.EventManagementPage);
export const AnnouncementManagementPage = lazy(loaders.AnnouncementManagementPage);
export const PaymentProcessingPage = lazy(loaders.PaymentProcessingPage);
export const FlaggedAccountsPage = lazy(loaders.FlaggedAccountsPage);
export const AdminDashboardPage = lazy(loaders.AdminDashboardPage);
export const AdminProfile = lazy(loaders.AdminProfile);
export const AdminSettingsPage = lazy(loaders.AdminSettingsPage);
export const AdminAccountInformation = lazy(loaders.AdminAccountInformation);
export const MeterIncidentsPage = lazy(loaders.MeterIncidentsPage);
export const RecordConsumptionPage = lazy(loaders.RecordConsumptionPage);
export const ReportMeterIncidentPage = lazy(loaders.ReportMeterIncidentPage);
export const MeterReaderProfile = lazy(loaders.MeterReaderProfile);
export const MeterReaderAccountInformation = lazy(loaders.MeterReaderAccountInformation);

const sharedAccountLoaders = [
  loaders.AppLayout,
  loaders.ChangePasswordPage,
  loaders.ChangeEmailPage,
];

const adminLoaders = [
  loaders.AdminDashboardPage,
  loaders.ConsumerManagementPage,
  loaders.PaymentProcessingPage,
  loaders.AdminReadingsPage,
  loaders.MeterIncidentsPage,
  loaders.ConsumerReadingsPage,
  loaders.ConsumerBillsPage,
  loaders.BillingManagementPage,
  loaders.FlaggedAccountsPage,
  loaders.EventManagementPage,
  loaders.AnnouncementManagementPage,
  loaders.AdminProfile,
  loaders.AdminAccountInformation,
  loaders.AnalyticsDashboard,
  loaders.Reports,
];

const consumerLoaders = [
  loaders.ConsumerHome,
  loaders.BillingLedger,
  loaders.ConsumerPaymentsPage,
  loaders.UsageMetrics,
  loaders.AnnouncementsPage,
  loaders.ConsumerProfile,
  loaders.ConsumerAccountInformation,
  loaders.ConsumerOnboarding,
];

const meterReaderLoaders = [
  loaders.RecordConsumptionPage,
  loaders.ReportMeterIncidentPage,
  loaders.MeterReaderProfile,
  loaders.MeterReaderAccountInformation,
];

export const getRolePrefetchLoaders = (role) => {
  const roleLoaders = role === "consumer"
    ? consumerLoaders
    : role === "meter-reader"
      ? meterReaderLoaders
      : role === "admin" || role === "super-admin"
        ? role === "super-admin"
          ? [...adminLoaders, loaders.AdminSettingsPage]
          : adminLoaders
        : [];
  // Common role destinations go first so Dashboard -> Residents/Payments (or
  // the equivalent consumer/reader flow) is normally ready before the click.
  // Shared account settings are useful but much less likely to be the next page.
  return [...roleLoaders, ...sharedAccountLoaders];
};
