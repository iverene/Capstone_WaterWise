import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import {
  getJwtSecret,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from "../config/auth.js";
import { supabase } from "../config/supabase.js";

function hashFingerprint(fingerprint) {
  return createHash("sha256").update(String(fingerprint || "")).digest("hex");
}

export async function authenticate(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "A Bearer authentication token is required.",
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
    if (requestFingerprint) {
      const table = payload.role === "consumer" ? "consumers" : payload.role === "meter-reader" ? "meter_readers" : "admins";
      const { data } = await supabase.from(table).select("device_fingerprint_hash").eq("id", userId).maybeSingle();
      const storedHash = data?.device_fingerprint_hash;
      if (storedHash) {
        const requestHash = hashFingerprint(requestFingerprint);
        if (requestHash !== storedHash) {
          return res.status(401).json({
            success: false,
            message: "Session device mismatch. Please sign in again.",
          });
        }
      }
    }

    req.user = {
      id: userId,
      role: payload.role,
    };
    return next();
  } catch (error) {
    if (error.statusCode === 500) {
      return res.status(500).json({ success: false, message: error.message });
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
