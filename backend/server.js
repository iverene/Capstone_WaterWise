import express from "express";
import cors from "cors";

import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import consumptionRoutes from "./routes/consumptionRoutes.js";
import consumerRoutes from "./routes/consumerRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import geminiRoutes from "./routes/predictionRoutes.js";
import meterReaderRoutes from "./routes/meterReaderRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import recomendationRoutes from "./routes/recommendationRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import changeEventRoutes from "./routes/changeEventRoutes.js";
import rateLimitRoutes from "./routes/rateLimitRoutes.js";
import adminDashboardRoutes from "./routes/adminDashboardRoutes.js";
import systemSettingsRoutes from "./routes/systemSettingsRoutes.js";
import meterIncidentRoutes from "./routes/meterIncidentRoutes.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { publishDataChange } from "./services/changeEventService.js";
import { startDeviceSessionPruneScheduler } from "./services/deviceSessionPruneService.js";
import { startNotificationReminderScheduler } from "./services/notificationServices.js";
import { startPushNotificationWorker } from "./services/pushNotificationService.js";
import { startAiAnalysisScheduler } from "./services/aiAnalysisScheduler.js";

const app = express();

const normalizeOrigin = (value) => value.trim().replace(/\/$/, "");
const productionOrigins = ["https://sucolwatersystem.vercel.app", ];
const developmentOrigins =
  process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        // Standalone rate-limit dashboard (frontend2, port 5174).
        "http://localhost:5174",
        "http://127.0.0.1:5174",
      ];
const configuredOrigins = [
  ...productionOrigins,
  ...developmentOrigins,
  process.env.FRONTEND_URL,
  ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
]
  .filter(Boolean)
  .map(normalizeOrigin);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (configuredOrigins.includes(normalizedOrigin)) return true;

  if (process.env.NODE_ENV !== "production") {
    try {
      const { hostname, port, protocol } = new URL(normalizedOrigin);
      const isPrivateLanHost =
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
      if (protocol === "http:" && ["5173", "5174"].includes(port) && isPrivateLanHost) return true;
    } catch {
      return false;
    }
  }

  // Vercel preview URLs are optional and must be explicitly enabled.
  return (
    process.env.ALLOW_VERCEL_PREVIEWS === "true" &&
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalizedOrigin)
  );
};

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Accept",
      "X-Staff-Authorization",
      "X-Settings-Permission",
      "X-Consumer-Password-Authorization",
      "X-Device-Fingerprint",
      "X-Data-Change-Client",
      "X-User-Activity",
    ],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", globalLimiter);

const dataMutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ignoredChangePaths = [
  "/api/auth/logout",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/verify-reset-otp",
  "/api/auth/admin/verify-login-otp",
  "/api/auth/admin/resend-login-otp",
  "/api/auth/change-password/email-otp",
  "/api/auth/admin/staff-action/otp",
  "/api/auth/admin/staff-action/verify",
  "/api/auth/admin/staff-action/verify-password",
  "/api/auth/admin/consumer-password/otp",
  "/api/auth/admin/consumer-password/verify",
  "/api/auth/admin/consumer-password/verify-password",
  "/api/auth/consumer/change-email/otp",
  "/api/auth/consumer/change-email/verify",
  "/api/auth/admin/change-email/otp",
  "/api/auth/admin/change-email/verify",
  "/api/auth/activity",
  "/api/notifications/push/subscriptions",
  "/api/notifications/push/subscriptions/current",
];

const isConsumerNotificationStateChange = (req) =>
  (req.method === "PUT" &&
    (req.path === "/api/notifications/read-all" ||
      /^\/api\/notifications\/\d+\/read$/.test(req.path))) ||
  (req.method === "POST" && req.path === "/api/notifications/delete");

app.use((req, res, next) => {
  if (
    !dataMutationMethods.has(req.method) ||
    ignoredChangePaths.includes(req.path) ||
    isConsumerNotificationStateChange(req)
  ) {
    return next();
  }

  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
      publishDataChange({
        actor: req.user,
        method: req.method,
        path: req.path,
        sourceClientId: req.get("X-Data-Change-Client"),
      });
    }
  });
  return next();
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "WaterWise API",
    status: "running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "healthy" });
});

app.use("/api/admins", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/consumption", consumptionRoutes);
app.use("/api/consumption/prediction", geminiRoutes);
app.use("/api/consumers", consumerRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/meter-readers", meterReaderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/recommendation", recomendationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/changes", changeEventRoutes);
app.use("/api/admin/rate-limits", rateLimitRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/system-settings", systemSettingsRoutes);
app.use("/api/meter-incidents", meterIncidentRoutes);

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Request body must contain valid JSON.",
    });
  }

  if (error.message?.includes("not allowed by CORS")) {
    return res.status(403).json({
      success: false,
      message: error.message,
    });
  }

  console.error(error);
  return res.status(error.status ?? 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error."
        : error.message,
  });
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`WaterWise Backend running on http://localhost:${PORT}`);
  startNotificationReminderScheduler();
  startDeviceSessionPruneScheduler();
  startPushNotificationWorker();
  startAiAnalysisScheduler();
});

export default app;
