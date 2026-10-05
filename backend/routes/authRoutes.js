import express from "express";
import { changeAuthenticatedPassword, completeConsumerEmailChange, currentAccount, forgotPassword, getAdminTrustedDevices, getSessionConfig, login, logout, postSessionActivity, refreshSession, removeAdminTrustedDevice, removeOtherAdminTrustedDevices, requestAuthenticatedPasswordOtp, requestConsumerEmailChangeOtp, requestConsumerPasswordChangeOtp, requestStaffActionOtp, resendAdminLoginOtp, resetPassword, verifyAdminLoginOtp, verifyConsumerEmailChangeOtp, verifyConsumerPasswordChangeOtp, verifyPasswordResetOtp, verifyStaffActionOtp, verifyStaffActionPassword } from "../controllers/authControllers.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { authStrictLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

router.post("/login", authStrictLimiter, login);
router.post("/refresh", refreshSession);
router.post("/admin/verify-login-otp", authStrictLimiter, verifyAdminLoginOtp);
router.post("/admin/resend-login-otp", authStrictLimiter, resendAdminLoginOtp);
router.get("/admin/trusted-devices", authenticate, getAdminTrustedDevices);
router.delete("/admin/trusted-devices/others", authenticate, removeOtherAdminTrustedDevices);
router.delete("/admin/trusted-devices/:deviceId", authenticate, removeAdminTrustedDevice);
router.post("/admin/consumer-password/otp", authenticate, requestConsumerPasswordChangeOtp);
router.post("/admin/consumer-password/verify", authenticate, verifyConsumerPasswordChangeOtp);
router.post("/admin/staff-action/otp", authenticate, requestStaffActionOtp);
router.post("/admin/staff-action/verify", authenticate, verifyStaffActionOtp);
router.post("/admin/staff-action/verify-password", authenticate, verifyStaffActionPassword);
router.post("/forgot-password", authStrictLimiter, forgotPassword);
router.post("/verify-reset-otp", authStrictLimiter, verifyPasswordResetOtp);
router.post("/reset-password", authStrictLimiter, resetPassword);
router.post("/change-password", authenticate, changeAuthenticatedPassword);
router.post("/change-password/email-otp", authenticate, requestAuthenticatedPasswordOtp);
router.post("/consumer/change-email/otp", authenticate, requestConsumerEmailChangeOtp);
router.post("/consumer/change-email/verify", authenticate, verifyConsumerEmailChangeOtp);
router.post("/consumer/change-email", authenticate, completeConsumerEmailChange);
router.post("/admin/change-email/otp", authenticate, requestConsumerEmailChangeOtp);
router.post("/admin/change-email/verify", authenticate, verifyConsumerEmailChangeOtp);
router.post("/admin/change-email", authenticate, completeConsumerEmailChange);
router.get("/session-config", getSessionConfig);
router.get("/me", authenticate, currentAccount);
router.post("/activity", authenticate, postSessionActivity);
router.post("/logout", authenticate, logout);

export default router;
