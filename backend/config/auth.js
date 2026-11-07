import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

export const JWT_ISSUER = "waterwise-api";
export const JWT_AUDIENCE = "waterwise-frontend";
export const REFRESH_AUDIENCE = "waterwise-refresh";

export function isAdminLoginOtpDisabled() {
  return String(process.env.DISABLE_ADMIN_LOGIN_OTP ?? "")
    .trim()
    .toLowerCase() === "true";
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error(
      "JWT_SECRET must be configured in .env with at least 32 characters."
    );
    error.statusCode = 500;
    throw error;
  }
  return secret;
}

const DEFAULT_ACCESS_TOKEN_DURATION_BY_ROLE = {
  consumer: "10m",
  "meter-reader": "8h",
  admin: "10m",
  "super-admin": "10m",
};

// Absolute refresh window from first login per role (auto-logout after this).
const DEFAULT_REFRESH_TOKEN_DURATION_BY_ROLE = {
  consumer: "90d",
  "meter-reader": "7d",
  admin: "1h",
  "super-admin": "30m",
};

const REFRESH_TOKEN_DURATION_ENV_BY_ROLE = {
  consumer: "REFRESH_EXPIRES_CONSUMER",
  "meter-reader": "REFRESH_EXPIRES_METER_READER",
  admin: "REFRESH_EXPIRES_ADMIN",
  "super-admin": "REFRESH_EXPIRES_SUPER_ADMIN",
};

const ACCESS_TOKEN_DURATION_ENV_BY_ROLE = {
  consumer: "JWT_EXPIRES_CONSUMER",
  "meter-reader": "JWT_EXPIRES_METER_READER",
  admin: "JWT_EXPIRES_ADMIN",
  "super-admin": "JWT_EXPIRES_SUPER_ADMIN",
};

const warnedInvalidDurations = new Set();

function isValidJwtDuration(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  // Accepts jsonwebtoken `expiresIn` forms: seconds ("3600") or ms-style
  // strings ("30s", "15m", "2h", "7d"). Falls back on anything else.
  return /^(\d+)\s*(ms|s|m|h|d|w|y)?$/i.test(trimmed) && Number.parseInt(trimmed, 10) > 0;
}

function readPositiveInt(envName, fallback, min, max) {
  const raw = (process.env[envName] ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    if (!warnedInvalidDurations.has(envName)) {
      warnedInvalidDurations.add(envName);
      console.warn(
        `Invalid ${envName} value "${raw}"; using default "${fallback}". ` +
          `Expected an integer between ${min} and ${max}.`,
      );
    }
    return fallback;
  }
  return parsed;
}

export function getAccessTokenDuration(role) {
  const fallback = DEFAULT_ACCESS_TOKEN_DURATION_BY_ROLE[role] ?? "1h";
  const envName = ACCESS_TOKEN_DURATION_ENV_BY_ROLE[role];
  const raw = envName ? (process.env[envName] ?? "").trim() : "";
  if (!raw) return fallback;
  if (!isValidJwtDuration(raw)) {
    if (!warnedInvalidDurations.has(role)) {
      warnedInvalidDurations.add(role);
      console.warn(
        `Invalid ${envName} value "${raw}"; using default "${fallback}". ` +
          `Use seconds (e.g. 3600) or a duration string (e.g. 30m, 1h).`,
      );
    }
    return fallback;
  }
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

export function getRefreshTokenDuration(role = "consumer") {
  const fallback = DEFAULT_REFRESH_TOKEN_DURATION_BY_ROLE[role] ?? "90d";
  const envName = REFRESH_TOKEN_DURATION_ENV_BY_ROLE[role];
  const raw = envName ? (process.env[envName] ?? "").trim() : "";
  if (!raw) return fallback;
  if (!isValidJwtDuration(raw)) {
    if (!warnedInvalidDurations.has(`refresh-${role}`)) {
      warnedInvalidDurations.add(`refresh-${role}`);
      console.warn(
        `Invalid ${envName} value "${raw}"; using default "${fallback}". ` +
          `Use seconds (e.g. 3600) or a duration string (e.g. 90d).`,
      );
    }
    return fallback;
  }
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

// --- Device session expiry (user_device_sessions.expires_at) ---
//
// A device row is trusted for the role's absolute session lifetime
// (refresh-token lifetime per role; 7 days for meter readers who have no
// a small grace so a still-valid access token never
// 401s on device grounds alone.

const MS_PER_UNIT = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
};

function parseJwtDurationToMs(value, fallbackMs) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value * 1000 : fallbackMs;
  }
  if (typeof value !== "string") return fallbackMs;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds > 0 ? seconds * 1000 : fallbackMs;
  }
  const match = trimmed.match(/^(\d+)\s*(ms|s|m|h|d|w|y)$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = MS_PER_UNIT[match[2].toLowerCase()];
  if (!(amount > 0) || !unit) return fallbackMs;
  return amount * unit;
}

const DEFAULT_DEVICE_SESSION_MS_BY_ROLE = {
  consumer: 90 * 24 * 60 * 60 * 1000,
  admin: 60 * 60 * 1000,
  "super-admin": 30 * 60 * 1000,
  "meter-reader": 7 * 24 * 60 * 60 * 1000,
};

export function getDeviceSessionLifetimeMs(role) {
  if (role === "meter-reader") {
    // Match the refresh window while retaining the offline device-trust setting.
    // Optional override; defaults apply when unset or invalid.
    const days = readPositiveInt("DEVICE_SESSION_DAYS_METER_READER", 7, 1, 90);
    return Math.max(days * 24 * 60 * 60 * 1000, parseJwtDurationToMs(getRefreshTokenDuration(role), days * 24 * 60 * 60 * 1000));
  }
  const fallback = DEFAULT_DEVICE_SESSION_MS_BY_ROLE[role] ?? DEFAULT_DEVICE_SESSION_MS_BY_ROLE.consumer;
  return parseJwtDurationToMs(getRefreshTokenDuration(role), fallback);
}

export function getDeviceSessionGraceMs(role) {
  // The last access token issued before the absolute cap may outlive the
  // device row by up to one access-token lifetime. Cover it plus margin.
  const fallback = 10 * 60 * 1000;
  return parseJwtDurationToMs(getAccessTokenDuration(role), fallback) + 5 * 60 * 1000;
}

// --- Priority 1 security tunables (all optional; documented defaults apply) ---

const DEFAULT_TRUSTED_DEVICE_DAYS_BY_ROLE = {
  admin: 15,
  "super-admin": 7,
};

const TRUSTED_DEVICE_DAYS_ENV_BY_ROLE = {
  admin: "TRUSTED_DEVICE_DAYS_ADMIN",
  "super-admin": "TRUSTED_DEVICE_DAYS_SUPER_ADMIN",
};

export function getTrustedDeviceDays(role) {
  const fallback = DEFAULT_TRUSTED_DEVICE_DAYS_BY_ROLE[role] ?? 0;
  const envName = TRUSTED_DEVICE_DAYS_ENV_BY_ROLE[role];
  if (!envName) return fallback;
  // OTP-bypass window: 1-30 days. Longer values weaken the second factor.
  return readPositiveInt(envName, fallback, 1, 30);
}

export function getOtpMaxAttempts() {
  return readPositiveInt("OTP_MAX_ATTEMPTS", 5, 1, 10);
}

export function getOtpResendCooldownSeconds() {
  return readPositiveInt("OTP_RESEND_COOLDOWN_SECONDS", 300, 30, 3600);
}

export function getLoginMaxAttempts() {
  return readPositiveInt("LOGIN_MAX_ATTEMPTS", 5, 1, 10);
}

export function getLoginLockoutMinutes() {
  return readPositiveInt("LOGIN_LOCKOUT_MINUTES", 3, 1, 60);
}

export function getOtpExpiry() {
  const raw = (process.env.OTP_EXPIRY ?? "").trim();
  if (!raw) return "5m";
  if (!isValidJwtDuration(raw)) {
    if (!warnedInvalidDurations.has("OTP_EXPIRY")) {
      warnedInvalidDurations.add("OTP_EXPIRY");
      console.warn(
        `Invalid OTP_EXPIRY value "${raw}"; using default "5m". ` +
          `Use seconds (e.g. 300) or a duration string (e.g. 5m).`,
      );
    }
    return "5m";
  }
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

