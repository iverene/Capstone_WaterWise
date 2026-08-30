import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import {
  changePasswordWithCurrent,
  requestAuthenticatedPasswordOtp,
  resetPassword,
  verifyPasswordResetOtp,
} from "../services/auth.service";
import Modal from "./Modal";
import OtpInput from "./OtpInput";
import { useToast } from "./Toast";

const formatCountdown = (totalSeconds) => `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
const PASSWORD_OTP_SESSION_KEY = "waterwise:password-otp-challenge";

function getSavedPasswordOtpChallenge() {
  try {
    const savedChallenge = JSON.parse(window.sessionStorage.getItem(PASSWORD_OTP_SESSION_KEY) ?? "null");
    if (savedChallenge?.challengeToken && Number(savedChallenge.expiresAt) > Date.now()) return savedChallenge;
    window.sessionStorage.removeItem(PASSWORD_OTP_SESSION_KEY);
  } catch {
    window.sessionStorage.removeItem(PASSWORD_OTP_SESSION_KEY);
  }
  return null;
}

function isStrongPassword(password) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export default function ChangePasswordModal({ emailOnly = false, isOpen, onClose, onSuccess }) {
  const toast = useToast();
  const [savedChallenge] = useState(getSavedPasswordOtpChallenge);
  const [method, setMethod] = useState(emailOnly || savedChallenge ? "email" : "current");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [challengeToken, setChallengeToken] = useState(savedChallenge?.challengeToken ?? "");
  const [resetToken, setResetToken] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState(savedChallenge?.maskedEmail ?? ""); // eslint-disable-line no-unused-vars
  const [message, setMessage] = useState(savedChallenge ? "Enter the verification code sent to your registered email." : "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(Number(savedChallenge?.expiresAt ?? 0));
  const [clock, setClock] = useState(Date.now);
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000));

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= cooldownUntil) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const validateNewPassword = () => {
    if (!isStrongPassword(newPassword)) return "Use at least 8 characters with uppercase, lowercase, a number, and a symbol.";
    if (newPassword !== confirmation) return "The new passwords do not match.";
    return "";
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateNewPassword();
    if (validationError) return setError(validationError);
    if (method === "current" && !currentPassword) return setError("Enter your current password.");
    setIsSubmitting(true);
    setError("");
    try {
      const result = method === "current"
        ? await changePasswordWithCurrent(currentPassword, newPassword)
        : await resetPassword(resetToken, newPassword);
      onSuccess?.(result.message);
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendOtp = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      const result = await requestAuthenticatedPasswordOtp();
      setChallengeToken(result.challengeToken);
      setMaskedEmail(result.maskedEmail);
      setMessage(result.message);
      toast.success("Code sent", result.message);
      setOtp("");
      setClock(Date.now());
      const expiresAt = Date.now() + Number(result.cooldownSeconds ?? 300) * 1000;
      setCooldownUntil(expiresAt);
      window.sessionStorage.setItem(PASSWORD_OTP_SESSION_KEY, JSON.stringify({
        challengeToken: result.challengeToken,
        maskedEmail: result.maskedEmail,
        expiresAt,
      }));
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.retryAfterSeconds) {
        setClock(Date.now());
        setCooldownUntil(Date.now() + requestError.retryAfterSeconds * 1000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setError("Enter the 6-digit verification code.");
    setIsSubmitting(true);
    setError("");
    try {
      const result = await verifyPasswordResetOtp(challengeToken, otp);
      setResetToken(result.resetToken);
      window.sessionStorage.removeItem(PASSWORD_OTP_SESSION_KEY);
      setMessage("Email verified. You can now create your new password.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass = "ww-field mt-1.5 py-2.5 pl-4 pr-11 text-sm sm:mt-2 sm:py-3 sm:pr-12 sm:text-base";
  const passwordField = (id, label, value, setter, autoComplete) => (
    <div>
      <label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor={id}>{label}</label>
      <div className="relative">
        <input autoComplete={autoComplete} className={fieldClass} disabled={isSubmitting} id={id} onChange={(event) => { setter(event.target.value); setError(""); }} type={showPasswords ? "text" : "password"} value={value} />
        <button aria-label={showPasswords ? "Hide passwords" : "Show passwords"} className="absolute inset-y-2 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowPasswords((shown) => !shown)} type="button">{showPasswords ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
      </div>
    </div>
  );

  return (
    <Modal closeButtonProps={{ className: "!h-9 !w-9 sm:!h-11 sm:!w-11" }} description="Choose how you want to verify your identity." eyebrow="Account security" headerClassName="!px-4 !py-3 sm:!px-6 sm:!py-4 [&_h2]:!text-xl sm:[&_h2]:!text-2xl [&_p]:!text-xs sm:[&_p]:!text-sm" isOpen={isOpen} onClose={onClose} size="sm" title="Change password">
      <div className="p-4 sm:p-6">
        {!emailOnly && <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button className={`min-h-10 rounded-lg px-2 text-xs font-bold sm:min-h-11 sm:px-3 sm:text-sm ${method === "current" ? "bg-white text-water-800 shadow-sm" : "text-slate-600"}`} onClick={() => { setMethod("current"); setError(""); setMessage(""); }} type="button"><KeyRound className="mr-1.5 inline h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />Current password</button>
          <button className={`min-h-10 rounded-lg px-2 text-xs font-bold sm:min-h-11 sm:px-3 sm:text-sm ${method === "email" ? "bg-white text-water-800 shadow-sm" : "text-slate-600"}`} onClick={() => { setMethod("email"); setError(""); setMessage(""); }} type="button"><Mail className="mr-1.5 inline h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />Email OTP</button>
        </div>}

        {method === "current" && (
          <form className="mt-4 space-y-3 sm:mt-5 sm:space-y-4" onSubmit={handlePasswordSubmit}>
            {passwordField("current-account-password", "Current password", currentPassword, setCurrentPassword, "current-password")}
            {passwordField("changed-account-password", "New password", newPassword, setNewPassword, "new-password")}
            {passwordField("confirm-account-password", "Confirm new password", confirmation, setConfirmation, "new-password")}
            <p className="text-xs leading-5 text-slate-500">Use 8 or more characters with uppercase, lowercase, a number, and a symbol.</p>
            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button className="ww-primary-button flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting} type="submit">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Changing password…" : "Change password"}</button>
          </form>
        )}

        {method === "email" && !challengeToken && (
          <div className="mt-5 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-water-50 text-water-700"><Mail className="h-5 w-5" /></span>
            <p className="mt-3 text-sm leading-6 text-slate-600">We’ll send a 6-digit code to the email registered to your signed-in account.</p>
            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button className="ww-primary-button mt-5 flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting || cooldownSeconds > 0} onClick={sendOtp} type="button">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Sending code…" : cooldownSeconds > 0 ? `Try again in ${formatCountdown(cooldownSeconds)}` : "Send email code"}</button>
          </div>
        )}

        {method === "email" && challengeToken && !resetToken && (
          <form className="mt-5 space-y-4" onSubmit={verifyOtp}>
            <div><label className="text-sm font-semibold" htmlFor="account-password-otp">Verification code</label><div className="mt-2 sm:mt-3"><OtpInput compact disabled={isSubmitting || cooldownSeconds === 0} id="account-password-otp" invalid={Boolean(error)} onChange={(nextOtp) => { setOtp(nextOtp); setError(""); setOtpSuccess(false); }} onAutoVerify={(otpValue) => { if (/^\d{6}$/.test(otpValue)) { setIsSubmitting(true); setError(""); verifyPasswordResetOtp(challengeToken, otpValue).then(result => { setOtpSuccess(true); setTimeout(() => { setResetToken(result.resetToken); window.sessionStorage.removeItem(PASSWORD_OTP_SESSION_KEY); setMessage("Email verified. You can now create your new password."); }, 600); }).catch(e => { setError(e.message); setOtp(""); }).finally(() => setIsSubmitting(false)); } }} success={otpSuccess} value={otp} /></div></div>
            <p aria-live="polite" className={`text-sm font-semibold ${cooldownSeconds > 0 ? "text-slate-500" : "text-red-600"}`}>{cooldownSeconds > 0 ? `Time remaining: ${formatCountdown(cooldownSeconds)}` : "This verification code has expired. Request a new code below."}</p>
            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
            {cooldownSeconds === 0 && <button className="w-full text-sm font-bold text-water-700 disabled:cursor-not-allowed disabled:text-slate-400" disabled={isSubmitting} onClick={sendOtp} type="button">Resend code</button>}
          </form>
        )}

        {method === "email" && resetToken && (
          <form className="mt-5 space-y-4" onSubmit={handlePasswordSubmit}>
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-5 w-5" />{message}</p>
            {passwordField("email-changed-password", "New password", newPassword, setNewPassword, "new-password")}
            {passwordField("email-confirm-password", "Confirm new password", confirmation, setConfirmation, "new-password")}
            <p className="text-xs leading-5 text-slate-500">Use 8 or more characters with uppercase, lowercase, a number, and a symbol.</p>
            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button className="ww-primary-button flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting} type="submit">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Changing password…" : "Change password"}</button>
          </form>
        )}
      </div>
    </Modal>
  );
}
