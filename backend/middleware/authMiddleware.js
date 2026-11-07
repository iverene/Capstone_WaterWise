import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import {
  getJwtSecret,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from "../config/auth.js";
import { supabase } from "../config/supabase.js";
import { readSessionToken } from "../models/sessionCookieModels.js";
import { getDeviceFingerprints, touchDeviceFingerprint } from "../models/deviceFingerprintModels.js";
import {
  getInactivityTimeoutMs,
  isSessionIdle,
  touchSessionActivity,
} from "../services/sessionActivityService.js";
import { accountRateLimiter } from "./rateLimit.js";

const ACTIVITY_PING_PATH = "/api/auth/activity";

function shouldTouchSessionActivity(req) {
  if (req.path === ACTIVITY_PING_PATH) return false;
  if (req.method !== "GET" && req.method !== "HEAD") return true;
  return req.get("x-user-activity") === "1";
}

function hashFingerprint(fingerprint) {
  return createHash("sha256").update(String(fingerprint || "")).digest("hex");
}

function hashPasswordState(passwordHash) {
  return createHash("sha256").update(String(passwordHash ?? "")).digest("hex");
}

export async function authenticate(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  const [scheme, bearerToken] = authorization.split(" ");
  const cookieToken = readSessionToken(req);
  const token = scheme === "Bearer" && bearerToken ? bearerToken : cookieToken || "";
  const authMethod = scheme === "Bearer" && bearerToken ? "bearer" : cookieToken ? "cookie" : "none";

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication is required. Please sign in again.",
    });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const userId = Number(payload.sub);
    if (
      !Number.isInteger(userId) ||
      userId < 1 ||
      !["admin", "super-admin", "meter-reader", "consumer"].includes(payload.role)
    ) {
      throw new jwt.JsonWebTokenError("Token identity is invalid.");
    }

    const requestFingerprint = req.get("x-device-fingerprint");
    const table = payload.role === "consumer" ? "consumers" : payload.role === "meter-reader" ? "meter_readers" : "admins";
    const { data, error: accountError } = await supabase
      .from(table)
      .select("password, status, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (accountError) {
      const error = new Error("Failed to verify the session.");
      error.statusCode = 500;
      throw error;
    }
    const canAccessDisconnectedConsumer =
      payload.role === "consumer" && ["inactive", "disconnected"].includes(data?.status);
    if (!data || (data.status && data.status !== "active" && !canAccessDisconnectedConsumer)) {
      return res.status(401).json({
        success: false,
        message: "This account is no longer active. Please sign in again.",
      });
    }
    // Password change/reset must invalidate already-issued JWTs: the token
    // carries a fingerprint of the password hash at issue time. Tokens issued
    // before this claim existed are grandfathered until they expire.
    if (payload.pwd && data.password && payload.pwd !== hashPasswordState(data.password)) {
      return res.status(401).json({
        success: false,
        message: "Your password was changed. Please sign in again.",
      });
    }
    // Device binding: the request fingerprint must match an enrolled,
    // unexpired device row. Fail closed: an empty list (all expired or none
    // enrolled) rejects the request. getDeviceFingerprints already excludes
    // expired rows.
    if (authMethod === "cookie" && !requestFingerprint) {
      return res.status(401).json({
        success: false,
        message: "Session device verification is required. Please sign in again.",
      });
    }
    if (requestFingerprint) {
      const storedHashes = await getDeviceFingerprints(userId, payload.role);
      const requestHash = hashFingerprint(requestFingerprint);
      const matched = storedHashes.some((r) => r.fingerprint_hash === requestHash);
      if (!matched) {
        return res.status(401).json({
          success: false,
          message: "Session device mismatch. Please sign in again.",
        });
      }
      touchDeviceFingerprint(userId, payload.role, requestHash).catch(() => {});
    }

    // 15-minute inactivity expiry: the JWT may still be within its absolute
    // lifetime, but it must stop working once the account has been idle.
    // Background polls (plain GETs, SSE) intentionally do not refresh the
    // timestamp — only explicit activity pings, user-flagged requests, and
    // state-changing requests do (see shouldTouchSessionActivity).
    // Meter readers are exempt: long idle stretches are normal field work
    // (walking between houses, reading meters). Their sessions remain
    // bounded by the absolute JWT expiry and device binding.
    const idleCheck = await isSessionIdle(payload.role, userId);
    if (idleCheck.idle && payload.role !== "meter-reader" && payload.role !== "consumer") {
      return res.status(401).json({
        success: false,
        code: "SESSION_INACTIVE",
        message: "Your session expired after 15 minutes of inactivity. Please sign in again.",
      });
    }

    req.user = {
      id: userId,
      role: payload.role,
      status: data.status,
      created_at: data.created_at,
    };

    if (shouldTouchSessionActivity(req)) {
      const now = Date.now();
      const inactivityTimeoutMs = getInactivityTimeoutMs();
      const lastActivity = idleCheck.lastActivity ?? now;
      if (now - lastActivity >= 0 && now - lastActivity < inactivityTimeoutMs) {
        await touchSessionActivity(payload.role, userId, now);
      }
    }
    return accountRateLimiter(req, res, next);
  } catch (error) {
    // Only JWT validation failures mean the credentials are invalid. Database
    // and service failures must not turn a valid session into a forced logout.
    if (!(error instanceof jwt.JsonWebTokenError)) {
      console.error("Session verification unavailable:", error);
      return res.status(503).json({
        success: false,
        code: "SESSION_VERIFICATION_UNAVAILABLE",
        message: "Session verification is temporarily unavailable. Please try again.",
      });
    }
    return res.status(401).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "Authentication token has expired."
          : "Authentication token is invalid.",
    });
  }
}

export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  const inheritsAdminAccess = req.user?.role === "super-admin" && allowedRoles.includes("admin");
  if (!req.user || (!allowedRoles.includes(req.user.role) && !inheritsAdminAccess)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to perform this action.",
    });
  }
  return next();
};

export const authorizeOwnerOrRoles =
  (parameterName, ownerRole, ...allowedRoles) =>
  (req, res, next) => {
    const isOwner =
      req.user?.role === ownerRole &&
      Number(req.params[parameterName]) === Number(req.user.id);
    const inheritsAdminAccess = req.user?.role === "super-admin" && allowedRoles.includes("admin");
    if (!isOwner && !allowedRoles.includes(req.user?.role) && !inheritsAdminAccess) {
      return res.status(403).json({
        success: false,
        message: "You may access only your own account records.",
      });
    }
    return next();
  };

export const authorizeConsumerQueryOrRoles =
  (...allowedRoles) =>
  (req, res, next) => {
    if (allowedRoles.includes(req.user?.role) || (req.user?.role === "super-admin" && allowedRoles.includes("admin"))) return next();
    const isConsumerOwner =
      req.user?.role === "consumer" &&
      Number(req.query.consumerId) === Number(req.user.id);
    if (!isConsumerOwner) {
      return res.status(403).json({
        success: false,
        message: "Consumers may access only their own notifications.",
      });
    }
    return next();
  };
