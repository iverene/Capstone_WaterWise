import jwt from "jsonwebtoken";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  getAccessTokenDuration,
  getJwtSecret,
  getOtpExpiry,
  getOtpMaxAttempts,
  getOtpResendCooldownSeconds,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from "../config/auth.js";
import { supabase } from "../config/supabase.js";
import {
  authenticateAccount,
  changePasswordWithCurrent,
  findPasswordResetAccount,
  getPasswordResetAccountById,
  getPasswordHash,
  reservePasswordResetOtpRequest,
  resetAccountPassword,
} from "../models/authModels.js";
import { sendAdminLoginOtp, sendConsumerPasswordChangeOtp, sendPasswordResetOtp, sendStaffActionOtp } from "../services/passwordResetEmailService.js";
import { sendConsumerEmailChangeOtp } from "../services/passwordResetEmailService.js";
import { getConsumerById, updateConsumer } from "../models/consumerModels.js";
import { updateAdmin } from "../models/adminModels.js";
import { updateMeterReader } from "../models/meterReaderModels.js";
import {
  createTrustedDevice,
  getTrustedDeviceCookieName,
  listAdminTrustedDevices,
  readCookie,
  revokeAdminTrustedDevices,
  revokeOtherTrustedDevices,
  revokeTrustedDevice,
  trustedDeviceCookieOptions,
  verifyTrustedDevice,
} from "../models/trustedDeviceModels.js";
import {
  clearSessionActivity,
  getInactivityTimeoutMs,
  touchSessionActivity,
} from "../services/sessionActivityService.js";

export function getSessionConfig(req, res) {
  return res.status(200).json({
    success: true,
    inactivityTimeoutMs: getInactivityTimeoutMs(),
  });
}

const ADMIN_LOGIN_OTP_AUDIENCE = "waterwise-admin-login-otp";
const EMAIL_CHANGE_OTP_AUDIENCE = "waterwise-consumer-email-change-otp";
const EMAIL_CHANGE_AUDIENCE = "waterwise-consumer-email-change";
const OTP_AUDIENCE = "waterwise-password-reset-otp";
const RESET_AUDIENCE = "waterwise-password-reset";
const STAFF_ACTION_OTP_AUDIENCE = "waterwise-staff-action-otp";
const STAFF_ACTION_AUDIENCE = "waterwise-staff-action";
const CONSUMER_PASSWORD_OTP_AUDIENCE = "waterwise-consumer-password-otp";
const CONSUMER_PASSWORD_AUDIENCE = "waterwise-consumer-password-change";
const adminOtpAttempts = new Map();
const emailChangeOtpAttempts = new Map();
const staffActionAttempts = new Map();
const staffActionAuthorizations = new Map();
const consumerPasswordOtpAttempts = new Map();
const consumerPasswordAuthorizations = new Map();
const passwordResetOtpAttempts = new Map();

const STAFF_ACTIONS = {
  "manage-staff": "open Super Admin staff management",
  "create-admin": "create an Admin account",
  "create-meter-reader": "create a Meter Reader account",
  "update-admin": "change an Admin account",
  "update-meter-reader": "change a Meter Reader account",
  "delete-admin": "remove an Admin account",
  "delete-meter-reader": "remove a Meter Reader account",
  "manage-system-settings": "open system settings",
  "update-system-settings": "update system settings",
};
// Page-view permissions are reusable within their lifetime (directory
// pagination, settings viewing). All other staff actions are single-use.
const REUSABLE_STAFF_ACTIONS = new Set(["manage-staff", "manage-system-settings"]);

function passwordFingerprint(passwordHash) {
  return createHash("sha256").update(String(passwordHash)).digest("hex");
}

function otpFingerprint(otp) {
  return createHmac("sha256", getJwtSecret()).update(String(otp)).digest("hex");
}

function valuesMatch(first, second) {
  const firstBuffer = Buffer.from(String(first));
  const secondBuffer = Buffer.from(String(second));
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function passwordResetRequestKey(email, purpose = "password-reset") {
  return createHmac("sha256", getJwtSecret())
    .update(`otp-request:${purpose}:${String(email ?? "").trim().toLowerCase()}`)
    .digest("hex");
}

function clearTrustedDeviceCookie(res, role, req) {
  const options = trustedDeviceCookieOptions(role, req);
  delete options.maxAge;
  // Clear the current cookie shape plus the legacy pre-fix shape
  // (Path=/api/auth, no Partitioned) so old cookies don't linger.
  res.clearCookie(getTrustedDeviceCookieName(), options);
  res.clearCookie(getTrustedDeviceCookieName(), { ...options, path: "/api/auth" });
  // The secure determination is request-dependent (direct HTTP vs proxied
  // HTTPS), so clear the opposite variant too or Chrome keeps the cookie.
  const flipped = { ...options, secure: !options.secure, sameSite: options.secure ? "lax" : "none" };
  if (flipped.secure) flipped.partitioned = true;
  else delete flipped.partitioned;
  res.clearCookie(getTrustedDeviceCookieName(), flipped);
  res.clearCookie(getTrustedDeviceCookieName(), { ...flipped, path: "/api/auth" });
}

function createAccessToken(user, passwordHash) {
  const claims = { role: user.role };
  // Bind the session to the password state so password changes/resets
  // invalidate already-issued JWTs (checked in authMiddleware).
  if (passwordHash) claims.pwd = passwordFingerprint(passwordHash);
  return jwt.sign(
    claims,
    getJwtSecret(),
    {
      subject: String(user.id),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: getAccessTokenDuration(user.role),
    },
  );
}

function hashFingerprint(fingerprint) {
  return createHash("sha256").update(String(fingerprint || "")).digest("hex");
}

async function storeDeviceFingerprint(userId, role, fingerprint) {
  const table = role === "consumer" ? "consumers" : role === "meter-reader" ? "meter_readers" : "admins";
  const hash = hashFingerprint(fingerprint);
  await supabase.from(table).update({ device_fingerprint_hash: hash }).eq("id", userId);
}

async function getStoredFingerprintHash(userId, role) {
  const table = role === "consumer" ? "consumers" : role === "meter-reader" ? "meter_readers" : "admins";
  const { data } = await supabase.from(table).select("device_fingerprint_hash").eq("id", userId).maybeSingle();
  return data?.device_fingerprint_hash || null;
}

export async function requestStaffActionOtp(req, res) {
  try {
    const { action, targetId } = req.body ?? {};
    if (req.user.role !== "super-admin" || !STAFF_ACTIONS[action]) return res.status(403).json({ success: false, message: "Only the Super Admin can authorize staff management actions." });
    const needsTarget = action.startsWith("update-") || action.startsWith("delete-");
    const parsedTargetId = needsTarget ? Number(targetId) : null;
    if (needsTarget && (!Number.isInteger(parsedTargetId) || parsedTargetId < 1)) return res.status(400).json({ success: false, message: "A valid staff account is required." });
    const account = await getPasswordResetAccountById(req.user.id, "super-admin");
    if (!account || account.status !== "active") return res.status(403).json({ success: false, message: "The Super Admin account is not active." });
    const requestLimit = await reservePasswordResetOtpRequest(passwordResetRequestKey(account.email, `staff-action:${action}:${parsedTargetId ?? "new"}`));
    if (!requestLimit.allowed) {
      res.set("Retry-After", String(requestLimit.retryAfterSeconds));
      return res.status(429).json({ success: false, message: requestLimit.reason === "hourly_lock" ? "Too many verification codes were requested. Try again in 1 hour." : "Please wait 5 minutes before requesting another verification code.", retryAfterSeconds: requestLimit.retryAfterSeconds });
    }
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challengeToken = jwt.sign({ role: "super-admin", action, targetId: parsedTargetId, otpHash: otpFingerprint(otp), passwordFingerprint: passwordFingerprint(account.password), emailFingerprint: passwordFingerprint(account.email.toLowerCase()) }, getJwtSecret(), { subject: String(account.id), issuer: JWT_ISSUER, audience: STAFF_ACTION_OTP_AUDIENCE, expiresIn: getOtpExpiry(), jwtid: createHash("sha256").update(`staff:${account.id}:${Date.now()}:${otp}`).digest("hex") });
    await sendStaffActionOtp({ email: account.email, otp, username: account.username, actionLabel: STAFF_ACTIONS[action] });
    return res.status(200).json({ success: true, challengeToken, maskedEmail: account.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"), message: "A verification code was sent to the Super Admin email.", cooldownSeconds: getOtpResendCooldownSeconds() });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Unable to send the staff authorization code." });
  }
}

export async function verifyStaffActionOtp(req, res) {
  try {
    for (const [challengeId, state] of staffActionAttempts) {
      if (state.expiresAt <= Date.now()) staffActionAttempts.delete(challengeId);
    }
    for (const [authId, state] of staffActionAuthorizations) {
      if (state.expiresAt <= Date.now()) staffActionAuthorizations.delete(authId);
    }
    const { challengeToken, otp } = req.body ?? {};
    if (!challengeToken || !/^\d{6}$/.test(String(otp ?? ""))) return res.status(400).json({ success: false, message: "Enter the 6-digit verification code." });
    const challenge = jwt.verify(challengeToken, getJwtSecret(), { issuer: JWT_ISSUER, audience: STAFF_ACTION_OTP_AUDIENCE });
    if (challenge.sub !== String(req.user.id) || req.user.role !== "super-admin" || !STAFF_ACTIONS[challenge.action] || !challenge.jti) throw new jwt.JsonWebTokenError("Invalid staff action challenge.");
    const state = staffActionAttempts.get(challenge.jti) ?? { attempts: 0, expiresAt: challenge.exp * 1000 };
    if (state.used || state.attempts >= getOtpMaxAttempts()) return res.status(429).json({ success: false, message: "This code can no longer be used. Request a new code." });
    const account = await getPasswordResetAccountById(req.user.id, "super-admin");
    const validAccount = account?.status === "active" && valuesMatch(passwordFingerprint(account.password), challenge.passwordFingerprint ?? "") && valuesMatch(passwordFingerprint(account.email.toLowerCase()), challenge.emailFingerprint ?? "");
    if (!validAccount || !valuesMatch(otpFingerprint(otp), challenge.otpHash ?? "")) {
      state.attempts += 1; staffActionAttempts.set(challenge.jti, state);
      return res.status(state.attempts >= getOtpMaxAttempts() ? 429 : 400).json({ success: false, message: state.attempts >= getOtpMaxAttempts() ? "Too many incorrect codes. Request a new code." : `Incorrect verification code. ${getOtpMaxAttempts() - state.attempts} attempts remaining.` });
    }
    staffActionAttempts.set(challenge.jti, { ...state, used: true });
    const isReusablePermission = REUSABLE_STAFF_ACTIONS.has(challenge.action);
    const authorizationToken = jwt.sign({ role: "super-admin", action: challenge.action, targetId: challenge.targetId ?? null, passwordFingerprint: challenge.passwordFingerprint, emailFingerprint: challenge.emailFingerprint }, getJwtSecret(), { subject: String(account.id), issuer: JWT_ISSUER, audience: STAFF_ACTION_AUDIENCE, expiresIn: isReusablePermission ? "15m" : "5m", jwtid: createHash("sha256").update(`authorized:${challenge.jti}`).digest("hex") });
    return res.status(200).json({ success: true, authorizationToken, authorizationExpiresAt: Date.now() + (isReusablePermission ? 15 : 5) * 60 * 1000 });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({ success: false, message: isTokenError ? "This staff verification session is invalid or expired." : error.message || "Unable to verify the code." });
  }
}

export const authorizeStaffAction = (expectedAction) => async (req, res, next) => {
  try {
    for (const [authId, state] of staffActionAuthorizations) {
      if (state.expiresAt <= Date.now()) staffActionAuthorizations.delete(authId);
    }
    const token = req.get("x-staff-authorization") ?? "";
    const payload = jwt.verify(token, getJwtSecret(), { issuer: JWT_ISSUER, audience: STAFF_ACTION_AUDIENCE });
    // Exact action match: a page-view permission (manage-staff /
    // manage-system-settings) never authorizes a write, and vice versa.
    const isReusableGate = REUSABLE_STAFF_ACTIONS.has(expectedAction);
    if (req.user.role !== "super-admin" || payload.sub !== String(req.user.id) || payload.action !== expectedAction || !payload.jti) throw new jwt.JsonWebTokenError("Invalid staff authorization.");
    if ((expectedAction.startsWith("update-") || expectedAction.startsWith("delete-")) && Number(payload.targetId) !== Number(req.params.id)) throw new jwt.JsonWebTokenError("Authorization does not match this staff account.");
    const state = staffActionAuthorizations.get(payload.jti);
    if (!isReusableGate && state?.used) return res.status(403).json({ success: false, message: "This staff authorization has already been used." });
    const account = await getPasswordResetAccountById(req.user.id, "super-admin");
    const validAccount = account?.status === "active" && valuesMatch(passwordFingerprint(account.password), payload.passwordFingerprint ?? "") && valuesMatch(passwordFingerprint(account.email.toLowerCase()), payload.emailFingerprint ?? "");
    if (!validAccount) return res.status(403).json({ success: false, message: "The Super Admin credentials changed. Request a new verification code." });
    if (!isReusableGate) staffActionAuthorizations.set(payload.jti, { used: true, expiresAt: payload.exp * 1000 });
    return next();
  } catch (error) {
    return res.status(403).json({ success: false, message: "Verify the Super Admin email OTP before continuing." });
  }
};

export async function requestConsumerPasswordChangeOtp(req, res) {
  try {
    if (!["admin", "super-admin"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Only administrators can change resident passwords." });
    const consumerId = Number(req.body?.consumerId);
    if (!Number.isInteger(consumerId) || consumerId < 1) return res.status(400).json({ success: false, message: "A valid resident account is required." });
    const [account, consumer] = await Promise.all([
      getPasswordResetAccountById(req.user.id, req.user.role),
      getConsumerById(consumerId),
    ]);
    if (!account || account.status !== "active") return res.status(403).json({ success: false, message: "Your administrator account is not active." });
    const requestLimit = await reservePasswordResetOtpRequest(passwordResetRequestKey(account.email, `consumer-password:${consumerId}`));
    if (!requestLimit.allowed) {
      res.set("Retry-After", String(requestLimit.retryAfterSeconds));
      return res.status(429).json({ success: false, message: requestLimit.reason === "hourly_lock" ? "Too many verification codes were requested. Try again in 1 hour." : "Please wait 5 minutes before requesting another verification code.", retryAfterSeconds: requestLimit.retryAfterSeconds });
    }
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challengeToken = jwt.sign(
      { role: req.user.role, consumerId, otpHash: otpFingerprint(otp), passwordFingerprint: passwordFingerprint(account.password), emailFingerprint: passwordFingerprint(account.email.toLowerCase()) },
      getJwtSecret(),
      { subject: String(account.id), issuer: JWT_ISSUER, audience: CONSUMER_PASSWORD_OTP_AUDIENCE, expiresIn: getOtpExpiry(), jwtid: createHash("sha256").update(`consumer-password:${account.id}:${consumerId}:${Date.now()}:${otp}`).digest("hex") },
    );
    await sendConsumerPasswordChangeOtp({ email: account.email, otp, username: account.username, consumerName: consumer.full_name ?? consumer.username });
    return res.status(200).json({ success: true, challengeToken, maskedEmail: account.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"), message: "A verification code was sent to your administrator email.", cooldownSeconds: getOtpResendCooldownSeconds() });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Unable to send the password-change code." });
  }
}

export async function verifyConsumerPasswordChangeOtp(req, res) {
  try {
    for (const [challengeId, state] of consumerPasswordOtpAttempts) {
      if (state.expiresAt <= Date.now()) consumerPasswordOtpAttempts.delete(challengeId);
    }
    for (const [authId, state] of consumerPasswordAuthorizations) {
      if (state.expiresAt <= Date.now()) consumerPasswordAuthorizations.delete(authId);
    }
    const { challengeToken, otp } = req.body ?? {};
    if (!challengeToken || !/^\d{6}$/.test(String(otp ?? ""))) return res.status(400).json({ success: false, message: "Enter the 6-digit verification code." });
    const challenge = jwt.verify(challengeToken, getJwtSecret(), { issuer: JWT_ISSUER, audience: CONSUMER_PASSWORD_OTP_AUDIENCE });
    if (challenge.sub !== String(req.user.id) || challenge.role !== req.user.role || !["admin", "super-admin"].includes(req.user.role) || !challenge.jti) throw new jwt.JsonWebTokenError("Invalid resident password challenge.");
    const state = consumerPasswordOtpAttempts.get(challenge.jti) ?? { attempts: 0, expiresAt: challenge.exp * 1000 };
    if (state.used || state.attempts >= getOtpMaxAttempts()) return res.status(429).json({ success: false, message: "This code can no longer be used. Request a new code." });
    const account = await getPasswordResetAccountById(req.user.id, req.user.role);
    const validAccount = account?.status === "active" && valuesMatch(passwordFingerprint(account.password), challenge.passwordFingerprint ?? "") && valuesMatch(passwordFingerprint(account.email.toLowerCase()), challenge.emailFingerprint ?? "");
    if (!validAccount || !valuesMatch(otpFingerprint(otp), challenge.otpHash ?? "")) {
      state.attempts += 1; consumerPasswordOtpAttempts.set(challenge.jti, state);
      const remaining = getOtpMaxAttempts() - state.attempts;
      return res.status(remaining > 0 ? 400 : 429).json({ success: false, message: remaining > 0 ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect codes. Request a new code." });
    }
    consumerPasswordOtpAttempts.set(challenge.jti, { ...state, used: true });
    const authorizationToken = jwt.sign(
      { role: req.user.role, consumerId: challenge.consumerId, passwordFingerprint: challenge.passwordFingerprint, emailFingerprint: challenge.emailFingerprint },
      getJwtSecret(),
      { subject: String(account.id), issuer: JWT_ISSUER, audience: CONSUMER_PASSWORD_AUDIENCE, expiresIn: getOtpExpiry(), jwtid: createHash("sha256").update(`consumer-password-authorized:${challenge.jti}`).digest("hex") },
    );
    return res.status(200).json({ success: true, authorizationToken });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({ success: false, message: isTokenError ? "This verification session is invalid or expired." : error.message || "Unable to verify the code." });
  }
}

export async function authorizeConsumerPasswordChange(req, res, next) {
  if (req.body?.password === undefined) return next();
  try {
    for (const [authId, state] of consumerPasswordAuthorizations) {
      if (state.expiresAt <= Date.now()) consumerPasswordAuthorizations.delete(authId);
    }
    const token = req.get("x-consumer-password-authorization") ?? "";
    const payload = jwt.verify(token, getJwtSecret(), { issuer: JWT_ISSUER, audience: CONSUMER_PASSWORD_AUDIENCE });
    if (payload.sub !== String(req.user.id) || payload.role !== req.user.role || Number(payload.consumerId) !== Number(req.params.id) || !payload.jti || !["admin", "super-admin"].includes(req.user.role)) throw new jwt.JsonWebTokenError("Invalid resident password authorization.");
    const state = consumerPasswordAuthorizations.get(payload.jti);
    if (state?.used) return res.status(403).json({ success: false, message: "This password-change authorization has already been used." });
    const account = await getPasswordResetAccountById(req.user.id, req.user.role);
    const validAccount = account?.status === "active" && valuesMatch(passwordFingerprint(account.password), payload.passwordFingerprint ?? "") && valuesMatch(passwordFingerprint(account.email.toLowerCase()), payload.emailFingerprint ?? "");
    if (!validAccount) return res.status(403).json({ success: false, message: "Your administrator credentials changed. Request a new verification code." });
    consumerPasswordAuthorizations.set(payload.jti, { used: true, expiresAt: payload.exp * 1000 });
    return next();
  } catch {
    return res.status(403).json({ success: false, message: "Verify your administrator email OTP before changing the resident password." });
  }
}

export async function login(req, res) {
  try {
    const { email, identifier, password } = req.body ?? {};
    const user = await authenticateAccount(identifier ?? email, password);

    if (["admin", "super-admin"].includes(user.role)) {
      const deviceToken = readCookie(req, getTrustedDeviceCookieName());
      const isTrustedDevice = await verifyTrustedDevice({
        token: deviceToken,
        adminId: user.id,
        role: user.role,
      });
      if (isTrustedDevice) {
        const dfp = req.get("x-device-fingerprint");
        if (dfp) await storeDeviceFingerprint(user.id, user.role, dfp);
        const passwordHash = await getPasswordHash(user.id, user.role);
        await touchSessionActivity(user.role, user.id);
        return res.status(200).json({
          success: true,
          token: createAccessToken(user, passwordHash),
          user,
          trustedDevice: true,
        });
      }

      const account = await getPasswordResetAccountById(user.id, user.role);
      const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const challengeToken = jwt.sign(
        {
          role: user.role,
          otpHash: otpFingerprint(otp),
          passwordFingerprint: passwordFingerprint(account.password),
        },
        getJwtSecret(),
        {
          subject: String(user.id),
          issuer: JWT_ISSUER,
          audience: ADMIN_LOGIN_OTP_AUDIENCE,
          expiresIn: getOtpExpiry(),
          jwtid: createHash("sha256").update(`${user.id}:${Date.now()}:${otp}`).digest("hex"),
        },
      );
      await sendAdminLoginOtp({ email: user.email, otp, username: user.username });
      return res.status(200).json({
        success: true,
        requiresOtp: true,
        challengeToken,
        maskedEmail: user.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
        message: "A verification code was sent to your registered admin email.",
        cooldownSeconds: getOtpResendCooldownSeconds(),
      });
    }

    const dfp = req.get("x-device-fingerprint");
    if (dfp) await storeDeviceFingerprint(user.id, user.role, dfp);
    const loginPasswordHash = await getPasswordHash(user.id, user.role);
    await touchSessionActivity(user.role, user.id);
    return res.status(200).json({ success: true, token: createAccessToken(user, loginPasswordHash), user });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Login failed.",
      ...(error.field ? { field: error.field } : {}),
      ...(error.retryAfterSeconds
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
      ...(Number.isInteger(error.failedAttempts)
        ? { failedAttempts: error.failedAttempts }
        : {}),
      ...(Number.isInteger(error.remainingAttempts)
        ? { remainingAttempts: error.remainingAttempts }
        : {}),
    });
  }
}

export function currentAccount(req, res) {
  return res.status(200).json({ success: true, user: req.user });
}

export async function postSessionActivity(req, res) {
  try {
    const timestamp = await touchSessionActivity(req.user.role, req.user.id);
    return res.status(200).json({
      success: true,
      lastActivityAt: new Date(timestamp).toISOString(),
    });
  } catch {
    return res.status(200).json({ success: true, lastActivityAt: null });
  }
}

export async function getAdminTrustedDevices(req, res) {
  try {
    if (!["admin", "super-admin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only administrators can manage trusted devices." });
    }
    const currentToken = readCookie(req, getTrustedDeviceCookieName());
    const devices = await listAdminTrustedDevices({ adminId: req.user.id, currentToken });
    return res.status(200).json({ success: true, devices });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Unable to load trusted devices." });
  }
}

export async function removeAdminTrustedDevice(req, res) {
  try {
    if (!["admin", "super-admin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only administrators can manage trusted devices." });
    }
    const deviceId = Number(req.params.deviceId);
    if (!Number.isInteger(deviceId) || deviceId < 1) {
      return res.status(400).json({ success: false, message: "A valid trusted device is required." });
    }
    const currentToken = readCookie(req, getTrustedDeviceCookieName());
    const result = await revokeTrustedDevice({ adminId: req.user.id, deviceId, currentToken });
    if (result.revokedCurrentDevice) clearTrustedDeviceCookie(res, req.user.role, req);
    return res.status(200).json({ success: true, ...result, message: "Trusted device removed." });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Unable to remove trusted device." });
  }
}

export async function removeOtherAdminTrustedDevices(req, res) {
  try {
    if (!["admin", "super-admin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only administrators can manage trusted devices." });
    }
    const currentToken = readCookie(req, getTrustedDeviceCookieName());
    const revokedCount = await revokeOtherTrustedDevices({ adminId: req.user.id, currentToken });
    return res.status(200).json({ success: true, revokedCount, message: "Other trusted devices removed." });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Unable to remove other trusted devices." });
  }
}

export async function verifyAdminLoginOtp(req, res) {
  try {
    for (const [challengeId, state] of adminOtpAttempts) {
      if (state.expiresAt <= Date.now()) adminOtpAttempts.delete(challengeId);
    }
    const { challengeToken, otp } = req.body ?? {};
    if (!challengeToken || !/^\d{6}$/.test(String(otp ?? ""))) {
      const error = new Error("Enter the 6-digit verification code.");
      error.statusCode = 400;
      error.field = "otp";
      throw error;
    }

    const challenge = jwt.verify(challengeToken, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: ADMIN_LOGIN_OTP_AUDIENCE,
    });
    if (!["admin", "super-admin"].includes(challenge.role) || !challenge.jti) throw new jwt.JsonWebTokenError("Invalid admin challenge.");

    const attemptState = adminOtpAttempts.get(challenge.jti) ?? { attempts: 0, expiresAt: challenge.exp * 1000 };
    if (attemptState.used) {
      const error = new Error("This verification code has already been used. Sign in again to request a new code.");
      error.statusCode = 400;
      throw error;
    }
    if (attemptState.attempts >= getOtpMaxAttempts()) {
      const error = new Error("Too many incorrect codes. Sign in again to request a new code.");
      error.statusCode = 429;
      throw error;
    }

    const account = await getPasswordResetAccountById(challenge.sub, challenge.role);
    const otpMatches = valuesMatch(otpFingerprint(otp), challenge.otpHash ?? "");
    const accountMatches = account?.status === "active" && valuesMatch(passwordFingerprint(account.password), challenge.passwordFingerprint ?? "");
    if (!otpMatches || !accountMatches) {
      attemptState.attempts += 1;
      adminOtpAttempts.set(challenge.jti, attemptState);
      const remaining = getOtpMaxAttempts() - attemptState.attempts;
      const error = new Error(remaining > 0 ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect codes. Sign in again to request a new code.");
      error.statusCode = remaining > 0 ? 400 : 429;
      error.field = "otp";
      throw error;
    }

    adminOtpAttempts.set(challenge.jti, { ...attemptState, used: true });
    const user = { id: account.id, username: account.username, email: account.email, name: account.username, role: account.role };
    const trustedDevice = await createTrustedDevice({
      adminId: account.id,
      role: account.role,
      userAgent: req.get("user-agent"),
    });
    res.cookie(
      getTrustedDeviceCookieName(),
      trustedDevice.token,
      trustedDeviceCookieOptions(account.role, req),
    );
    const dfp = req.get("x-device-fingerprint");
    if (dfp) await storeDeviceFingerprint(user.id, user.role, dfp);
    await touchSessionActivity(user.role, user.id);
    return res.status(200).json({
      success: true,
      token: createAccessToken(user, account.password),
      user,
      trustedDeviceExpiresAt: trustedDevice.expiresAt.toISOString(),
    });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({
      success: false,
      message: isTokenError ? "This admin verification session is invalid or has expired. Sign in again." : error.message || "Unable to verify the code.",
      ...(error.field ? { field: error.field } : {}),
    });
  }
}

export async function resendAdminLoginOtp(req, res) {
  try {
    const { challengeToken } = req.body ?? {};
    if (!challengeToken) {
      return res.status(400).json({ success: false, message: "A verification session is required. Sign in again." });
    }

    const challenge = jwt.verify(challengeToken, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: ADMIN_LOGIN_OTP_AUDIENCE,
      ignoreExpiration: true,
    });
    const issuedAt = Number(challenge.iat ?? 0) * 1000;
    if (!challenge.jti || !["admin", "super-admin"].includes(challenge.role) || !issuedAt || Date.now() - issuedAt > 15 * 60 * 1000) {
      return res.status(400).json({ success: false, message: "This verification session has expired. Sign in again." });
    }
    const secondsSinceIssue = Math.floor((Date.now() - issuedAt) / 1000);
    if (secondsSinceIssue < getOtpResendCooldownSeconds()) {
      const retryAfterSeconds = getOtpResendCooldownSeconds() - secondsSinceIssue;
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ success: false, message: "Please wait until the current code expires before requesting another verification code.", retryAfterSeconds });
    }

    const account = await getPasswordResetAccountById(challenge.sub, challenge.role);
    const accountMatches = account?.status === "active" && valuesMatch(passwordFingerprint(account.password), challenge.passwordFingerprint ?? "");
    if (!accountMatches) {
      return res.status(403).json({ success: false, message: "Your administrator credentials changed. Sign in again." });
    }

    const requestLimit = await reservePasswordResetOtpRequest(passwordResetRequestKey(account.email, "admin-login"));
    if (!requestLimit.allowed) {
      res.set("Retry-After", String(requestLimit.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: requestLimit.reason === "hourly_lock"
          ? "Too many verification codes were requested. Try again in 1 hour."
          : "Please wait 5 minutes before requesting another verification code.",
        retryAfterSeconds: requestLimit.retryAfterSeconds,
      });
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const nextChallengeToken = jwt.sign(
      {
        role: account.role,
        otpHash: otpFingerprint(otp),
        passwordFingerprint: passwordFingerprint(account.password),
      },
      getJwtSecret(),
      {
        subject: String(account.id),
        issuer: JWT_ISSUER,
        audience: ADMIN_LOGIN_OTP_AUDIENCE,
        expiresIn: getOtpExpiry(),
        jwtid: createHash("sha256").update(`${account.id}:${Date.now()}:${otp}`).digest("hex"),
      },
    );

    adminOtpAttempts.set(challenge.jti, { used: true, expiresAt: Math.max(Date.now() + 60_000, Number(challenge.exp ?? 0) * 1000) });
    await sendAdminLoginOtp({ email: account.email, otp, username: account.username });
    return res.status(200).json({
      success: true,
      challengeToken: nextChallengeToken,
      maskedEmail: account.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
      message: "A new verification code was sent to your registered admin email.",
      cooldownSeconds: getOtpResendCooldownSeconds(),
    });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({
      success: false,
      message: isTokenError ? "This verification session is invalid. Sign in again." : error.message || "Unable to resend the code.",
    });
  }
}

export async function requestConsumerEmailChangeOtp(req, res) {
  try {
    const account = await getPasswordResetAccountById(req.user.id, req.user.role);
    if (!["admin", "super-admin", "consumer", "meter-reader"].includes(req.user.role) || !account || account.status !== "active") {
      return res.status(403).json({ success: false, message: "Only active accounts can change their email." });
    }
    const requestLimit = await reservePasswordResetOtpRequest(passwordResetRequestKey(account.email, "email-change"));
    if (!requestLimit.allowed) {
      res.set("Retry-After", String(requestLimit.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: requestLimit.reason === "hourly_lock"
          ? "Too many verification codes were requested. Try again in 1 hour."
          : "Please wait 5 minutes before requesting another verification code.",
      });
    }
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challengeToken = jwt.sign(
      {
        role: req.user.role,
        otpHash: otpFingerprint(otp),
        passwordFingerprint: passwordFingerprint(account.password),
        emailFingerprint: passwordFingerprint(account.email.toLowerCase()),
      },
      getJwtSecret(),
      {
        subject: String(account.id), issuer: JWT_ISSUER, audience: EMAIL_CHANGE_OTP_AUDIENCE,
        expiresIn: getOtpExpiry(), jwtid: createHash("sha256").update(`email:${account.id}:${Date.now()}:${otp}`).digest("hex"),
      },
    );
    await sendConsumerEmailChangeOtp({ email: account.email, otp, username: account.username });
    return res.status(200).json({
      success: true,
      challengeToken,
      maskedEmail: account.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
      message: "A verification code was sent to your current email address.",
      cooldownSeconds: getOtpResendCooldownSeconds(),
    });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({ success: false, message: error.message || "Unable to send the verification code." });
  }
}

export async function verifyConsumerEmailChangeOtp(req, res) {
  try {
    for (const [challengeId, state] of emailChangeOtpAttempts) {
      if (state.expiresAt <= Date.now()) emailChangeOtpAttempts.delete(challengeId);
    }
    const { challengeToken, otp } = req.body ?? {};
    if (!challengeToken || !/^\d{6}$/.test(String(otp ?? ""))) {
      const error = new Error("Enter the 6-digit verification code."); error.statusCode = 400; throw error;
    }
    const challenge = jwt.verify(challengeToken, getJwtSecret(), { issuer: JWT_ISSUER, audience: EMAIL_CHANGE_OTP_AUDIENCE });
    if (challenge.sub !== String(req.user.id) || challenge.role !== req.user.role || !challenge.jti) throw new jwt.JsonWebTokenError("Invalid email challenge.");
    const state = emailChangeOtpAttempts.get(challenge.jti) ?? { attempts: 0, expiresAt: challenge.exp * 1000 };
    if (state.used || state.attempts >= getOtpMaxAttempts()) {
      const error = new Error("This code can no longer be used. Request a new code."); error.statusCode = 429; throw error;
    }
    const account = await getPasswordResetAccountById(req.user.id, req.user.role);
    const validAccount = account?.status === "active" && valuesMatch(passwordFingerprint(account.password), challenge.passwordFingerprint ?? "") && valuesMatch(passwordFingerprint(account.email.toLowerCase()), challenge.emailFingerprint ?? "");
    if (!validAccount || !valuesMatch(otpFingerprint(otp), challenge.otpHash ?? "")) {
      state.attempts += 1; emailChangeOtpAttempts.set(challenge.jti, state);
      const remaining = getOtpMaxAttempts() - state.attempts;
      const error = new Error(remaining > 0 ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect codes. Request a new code.");
      error.statusCode = remaining > 0 ? 400 : 429; throw error;
    }
    emailChangeOtpAttempts.set(challenge.jti, { ...state, used: true });
    const emailChangeToken = jwt.sign(
      { role: req.user.role, emailFingerprint: passwordFingerprint(account.email.toLowerCase()) },
      getJwtSecret(),
      { subject: String(account.id), issuer: JWT_ISSUER, audience: EMAIL_CHANGE_AUDIENCE, expiresIn: "15m" },
    );
    return res.status(200).json({ success: true, emailChangeToken });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({ success: false, message: isTokenError ? "This verification session is invalid or expired." : error.message || "Unable to verify the code." });
  }
}

export async function completeConsumerEmailChange(req, res) {
  try {
    const { emailChangeToken, newEmail } = req.body ?? {};
    const payload = jwt.verify(emailChangeToken, getJwtSecret(), { issuer: JWT_ISSUER, audience: EMAIL_CHANGE_AUDIENCE });
    if (payload.sub !== String(req.user.id) || payload.role !== req.user.role || !["admin", "super-admin", "consumer", "meter-reader"].includes(req.user.role)) throw new jwt.JsonWebTokenError("Invalid email change session.");
    const account = await getPasswordResetAccountById(req.user.id, req.user.role);
    if (!account || !valuesMatch(passwordFingerprint(account.email.toLowerCase()), payload.emailFingerprint ?? "")) {
      const error = new Error("This email change session has already been used or is invalid."); error.statusCode = 400; throw error;
    }
    if (String(newEmail ?? "").trim().toLowerCase() === account.email.toLowerCase()) {
      const error = new Error("Enter a new email address that is different from your current email."); error.statusCode = 400; throw error;
    }
    const updated = ["admin", "super-admin"].includes(req.user.role)
      ? await updateAdmin(req.user.id, { email: newEmail })
      : req.user.role === "meter-reader"
        ? await updateMeterReader(req.user.id, { email: newEmail })
        : await updateConsumer(req.user.id, { email: newEmail });
    return res.status(200).json({ success: true, message: "Your email address has been changed successfully.", email: updated.email });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({ success: false, message: isTokenError ? "This email change session is invalid or expired." : error.message || "Unable to change email." });
  }
}

export async function forgotPassword(req, res) {
  try {
    const account = await findPasswordResetAccount(req.body?.email);
    if (!account || account.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "No active WaterWise account is registered with that email address.",
        field: "email",
      });
    }

    const requestKey = passwordResetRequestKey(req.body?.email);
    const requestLimit = await reservePasswordResetOtpRequest(requestKey);

    if (!requestLimit.allowed) {
      res.set("Retry-After", String(requestLimit.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: requestLimit.reason === "hourly_lock"
          ? "Too many password reset codes were requested. Try again in 1 hour."
          : "Please wait 5 minutes before requesting another verification code.",
      });
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challengeToken = jwt.sign(
      {
        role: account.role,
        otpHash: otpFingerprint(otp),
        passwordFingerprint: passwordFingerprint(account.password),
      },
      getJwtSecret(),
      {
        subject: String(account.id),
        issuer: JWT_ISSUER,
        audience: OTP_AUDIENCE,
        expiresIn: getOtpExpiry(),
        jwtid: createHash("sha256").update(`reset:${account.id}:${Date.now()}:${otp}`).digest("hex"),
      },
    );
    await sendPasswordResetOtp({ email: account.email, otp, username: account.username });
    return res.status(200).json({
      success: true,
      message: "A verification code has been sent to your registered email address.",
      challengeToken,
      cooldownSeconds: getOtpResendCooldownSeconds(),
    });
  } catch (error) {
    console.error("Forgot password request failed:", error);
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.statusCode === 400 || process.env.NODE_ENV !== "production"
        ? error.message
        : "Unable to send a reset email right now.",
      ...(error.field ? { field: error.field } : {}),
    });
  }
}

function createOtpChallenge(account, otp) {
  return jwt.sign(
    {
      role: account.role,
      otpHash: otpFingerprint(otp),
      passwordFingerprint: passwordFingerprint(account.password),
    },
    getJwtSecret(),
    {
      subject: String(account.id),
      issuer: JWT_ISSUER,
      audience: OTP_AUDIENCE,
      expiresIn: getOtpExpiry(),
      jwtid: createHash("sha256").update(`reset:${account.id}:${Date.now()}:${otp}`).digest("hex"),
    },
  );
}

export async function requestAuthenticatedPasswordOtp(req, res) {
  try {
    const account = await getPasswordResetAccountById(req.user.id, req.user.role);
    if (!account || account.status !== "active") {
      return res.status(404).json({ success: false, message: "Active account not found." });
    }
    const requestLimit = await reservePasswordResetOtpRequest(passwordResetRequestKey(account.email, "authenticated-password-change"));
    if (!requestLimit.allowed) {
      res.set("Retry-After", String(requestLimit.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: requestLimit.reason === "hourly_lock"
          ? "Too many verification codes were requested. Try again in 1 hour."
          : "Please wait 5 minutes before requesting another verification code.",
      });
    }
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challengeToken = createOtpChallenge(account, otp);
    await sendPasswordResetOtp({ email: account.email, otp, username: account.username });
    return res.status(200).json({
      success: true,
      message: "A verification code was sent to your registered email address.",
      challengeToken,
      maskedEmail: account.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
      cooldownSeconds: getOtpResendCooldownSeconds(),
    });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Unable to send a verification code.",
    });
  }
}

export async function changeAuthenticatedPassword(req, res) {
  try {
    await changePasswordWithCurrent({
      accountId: req.user.id,
      role: req.user.role,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
    });
    if (["admin", "super-admin"].includes(req.user.role)) {
      await revokeAdminTrustedDevices(req.user.id);
      clearTrustedDeviceCookie(res, req.user.role, req);
    }
    return res.status(200).json({ success: true, message: "Your password has been changed successfully." });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Unable to change password.",
      ...(error.field ? { field: error.field } : {}),
    });
  }
}

export async function verifyPasswordResetOtp(req, res) {
  try {
    for (const [challengeId, state] of passwordResetOtpAttempts) {
      if (state.expiresAt <= Date.now()) passwordResetOtpAttempts.delete(challengeId);
    }
    const { challengeToken, otp } = req.body ?? {};
    if (!challengeToken || !/^\d{6}$/.test(String(otp ?? ""))) {
      const error = new Error("Enter the 6-digit verification code.");
      error.statusCode = 400;
      error.field = "otp";
      throw error;
    }

    const challenge = jwt.verify(challengeToken, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: OTP_AUDIENCE,
    });
    if (!challenge.jti) throw new jwt.JsonWebTokenError("Invalid verification challenge.");
    const attemptState = passwordResetOtpAttempts.get(challenge.jti) ?? { attempts: 0, expiresAt: challenge.exp * 1000 };
    if (attemptState.used) {
      const error = new Error("This verification code has already been used. Request a new code.");
      error.statusCode = 400;
      error.field = "otp";
      throw error;
    }
    if (attemptState.attempts >= getOtpMaxAttempts()) {
      const error = new Error("Too many incorrect codes. Request a new verification code.");
      error.statusCode = 429;
      error.field = "otp";
      throw error;
    }
    const currentHash = await getPasswordHash(challenge.sub, challenge.role);
    const otpMatches = valuesMatch(otpFingerprint(otp), challenge.otpHash ?? "");
    const accountMatches = currentHash && valuesMatch(passwordFingerprint(currentHash), challenge.passwordFingerprint ?? "");
    if (!otpMatches || !accountMatches) {
      attemptState.attempts += 1;
      passwordResetOtpAttempts.set(challenge.jti, attemptState);
      const remaining = getOtpMaxAttempts() - attemptState.attempts;
      const error = new Error(remaining > 0 ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect codes. Request a new verification code.");
      error.statusCode = remaining > 0 ? 400 : 429;
      error.field = "otp";
      throw error;
    }

    passwordResetOtpAttempts.set(challenge.jti, { ...attemptState, used: true });
    const resetToken = jwt.sign(
      { role: challenge.role, passwordFingerprint: passwordFingerprint(currentHash) },
      getJwtSecret(),
      {
        subject: String(challenge.sub),
        issuer: JWT_ISSUER,
        audience: RESET_AUDIENCE,
        expiresIn: "15m",
      },
    );
    return res.status(200).json({ success: true, resetToken });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({
      success: false,
      message: isTokenError ? "The verification code is incorrect or has expired." : error.message || "Unable to verify the code.",
      ...(error.field ? { field: error.field } : {}),
    });
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, password } = req.body ?? {};
    if (!token) {
      const error = new Error("This password reset session is invalid or has expired.");
      error.statusCode = 400;
      throw error;
    }

    const payload = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: RESET_AUDIENCE,
    });
    const currentHash = await getPasswordHash(payload.sub, payload.role);
    if (!currentHash || !valuesMatch(passwordFingerprint(currentHash), payload.passwordFingerprint ?? "")) {
      const error = new Error("This password reset session is invalid or has already been used.");
      error.statusCode = 400;
      throw error;
    }

    const updated = await resetAccountPassword({ accountId: payload.sub, password, role: payload.role });
    if (!updated) {
      const error = new Error("This password reset session is invalid or has expired.");
      error.statusCode = 400;
      throw error;
    }
    if (["admin", "super-admin"].includes(payload.role)) {
      await revokeAdminTrustedDevices(payload.sub);
      clearTrustedDeviceCookie(res, payload.role, req);
    }
    return res.status(200).json({ success: true, message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    const isTokenError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
    return res.status(error.statusCode ?? (isTokenError ? 400 : 500)).json({
      success: false,
      message: isTokenError ? "This password reset session is invalid or has expired." : error.message || "Unable to reset password.",
      ...(error.field ? { field: error.field } : {}),
    });
  }
}

export async function logout(req, res) {
  try {
    const { id, role } = req.user;
    const table = role === "consumer" ? "consumers" : role === "meter-reader" ? "meter_readers" : "admins";
    await supabase.from(table).update({ device_fingerprint_hash: null }).eq("id", id);
    await clearSessionActivity(role, id);
    if (["admin", "super-admin"].includes(role)) {
      // Logging out must also end the OTP bypass: revoke only this browser's
      // trusted device (other browsers stay trusted) and clear its cookie.
      const deviceToken = readCookie(req, getTrustedDeviceCookieName());
      if (deviceToken) {
        try {
          const { data } = await supabase
            .from("admin_trusted_devices")
            .select("id")
            .eq("token_hash", createHash("sha256").update(deviceToken).digest("hex"))
            .eq("admin_id", id)
            .is("revoked_at", null)
            .maybeSingle();
          if (data?.id) await revokeTrustedDevice({ adminId: id, deviceId: data.id, currentToken: deviceToken });
        } catch {
          // Fingerprint already cleared above; a device-table failure
          // must not turn logout itself into an error.
        }
      }
      clearTrustedDeviceCookie(res, role, req);
    }
    return res.status(200).json({ success: true, message: "Logged out successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Logout failed." });
  }
}
