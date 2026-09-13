import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import OtpInput from "../components/OtpInput";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import {
  changePasswordWithCurrent,
  requestAuthenticatedPasswordOtp,
  resetPassword,
  verifyPasswordResetOtp,
} from "../services/auth.service";
import { getStoredAccount } from "../services/authToken";

const formatCountdown = (totalSeconds) => `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
const PASSWORD_OTP_SESSION_KEY = "waterwise:password-otp-challenge";

const passwordRequirements = [
  { id: "length", label: "At least 8 characters", test: (value) => value.length >= 8 },
  { id: "lowercase", label: "One lowercase letter (a–z)", test: (value) => /[a-z]/.test(value) },
  { id: "uppercase", label: "One uppercase letter (A–Z)", test: (value) => /[A-Z]/.test(value) },
  { id: "number", label: "One number (0–9)", test: (value) => /\d/.test(value) },
  { id: "symbol", label: "One symbol (e.g. !@#$)", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

function getSavedPasswordOtpChallenge() {
  try {
    const savedChallenge = JSON.parse(window.sessionStorage.getItem(PASSWORD_OTP_SESSION_KEY) ?? "null");
    // A saved challenge belongs to the account that requested it. Never
    // restore another account's challenge (same-tab login switching).
    const currentAccountId = getStoredAccount()?.id ?? null;
    if (
      savedChallenge?.challengeToken &&
      Number(savedChallenge.expiresAt) > Date.now() &&
      savedChallenge.accountId != null &&
      currentAccountId != null &&
      String(savedChallenge.accountId) === String(currentAccountId)
    ) return savedChallenge;
    window.sessionStorage.removeItem(PASSWORD_OTP_SESSION_KEY);
  } catch {
    window.sessionStorage.removeItem(PASSWORD_OTP_SESSION_KEY);
  }
  return null;
}

function isStrongPassword(password) {
  return passwordRequirements.every((requirement) => requirement.test(password));
}

function RequirementRow({ met, label }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${met ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-transparent"}`}>
        <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className={`text-sm ${met ? "font-semibold text-slate-700" : "text-slate-500"}`}>{label}</span>
    </li>
  );
}

const profileHomeByRole = {
  admin: "/admin/profile",
  "super-admin": "/admin/profile",
  "meter-reader": "/meter-reader/profile",
  consumer: "/consumer/profile-details",
};

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const accountRole = getStoredAccount()?.role;
  const emailOnly = accountRole === "admin" || accountRole === "super-admin";
  const backPath = profileHomeByRole[accountRole] ?? "/login";

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
  const [maskedEmail, setMaskedEmail] = useState(savedChallenge?.maskedEmail ?? "");
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

  const requirementsMet = passwordRequirements.map((requirement) => requirement.test(newPassword));
  const allRequirementsMet = requirementsMet.every(Boolean);
  const passwordsMatch = newPassword !== "" && newPassword === confirmation;
  const canSubmit = allRequirementsMet && passwordsMatch && (method === "email" || currentPassword !== "");

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!isStrongPassword(newPassword)) return setError("Use at least 8 characters with uppercase, lowercase, a number, and a symbol.");
    if (newPassword !== confirmation) return setError("The new passwords do not match.");
    if (method === "current" && !currentPassword) return setError("Enter your current password.");
    setIsSubmitting(true);
    setError("");
    try {
      const result = method === "current"
        ? await changePasswordWithCurrent(currentPassword, newPassword)
        : await resetPassword(resetToken, newPassword);
      toast.success("Password changed", result.message);
      navigate(backPath);
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
        accountId: getStoredAccount()?.id ?? null,
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

  const showNewPasswordCard = method === "current" || resetToken !== "";

  const passwordField = (id, label, value, setter, autoComplete) => (
    <div>
      <label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor={id}>{label}</label>
      <div className="relative mt-1.5 sm:mt-2">
        <input autoComplete={autoComplete} className="ww-field py-2.5 pl-4 pr-11 text-sm sm:py-3 sm:pr-12 sm:text-base" disabled={isSubmitting} id={id} onChange={(event) => { setter(event.target.value); setError(""); }} type={showPasswords ? "text" : "password"} value={value} />
        <button aria-label={showPasswords ? "Hide passwords" : "Show passwords"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowPasswords((shown) => !shown)} type="button">{showPasswords ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader eyebrow="Account Security" title="Change Password" />

      <div className="mx-auto w-full max-w-md">
      {method === "email" && !challengeToken && (
        <section aria-labelledby="password-otp-heading">
          <h2 className="text-xl font-extrabold text-navy-900 text-center" id="password-otp-heading">Verify it&apos;s you</h2>
          <div className="mt-4 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-water-50 text-water-700"><Mail className="h-5 w-5" /></span>
            <p className="mt-3 text-sm leading-6 text-slate-600">We&apos;ll send a 6-digit code to the email registered to your signed-in account.</p>
            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button className="ww-primary-button mt-5 flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting || cooldownSeconds > 0} onClick={sendOtp} type="button">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Sending code…" : cooldownSeconds > 0 ? `Try again in ${formatCountdown(cooldownSeconds)}` : "Send email code"}</button>
            {!emailOnly && <button className="mt-3 w-full text-xs font-bold text-water-700 hover:text-water-900 sm:text-sm" onClick={() => { setMethod("current"); setError(""); setMessage(""); }} type="button">Use current password instead</button>}
          </div>
        </section>
      )}

      {method === "email" && challengeToken && !resetToken && (
        <section aria-labelledby="password-otp-verify-heading">
          <h2 className="text-base font-extrabold text-navy-900" id="password-otp-verify-heading">Enter verification code</h2>
          <form className="mt-4 space-y-3 sm:space-y-4" onSubmit={verifyOtp}>
            <p className="text-xs leading-5 text-slate-600 sm:text-sm">Enter the code sent to <strong>{maskedEmail}</strong>. It expires in 5 minutes.</p>
            <div><label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor="account-password-otp">Verification code</label><div className="mt-2 sm:mt-3"><OtpInput compact disabled={isSubmitting || cooldownSeconds === 0} id="account-password-otp" invalid={Boolean(error)} onChange={(nextOtp) => { setOtp(nextOtp); setError(""); setOtpSuccess(false); }} onAutoVerify={(otpValue) => { if (/^\d{6}$/.test(otpValue)) { setIsSubmitting(true); setError(""); verifyPasswordResetOtp(challengeToken, otpValue).then(result => { setOtpSuccess(true); setTimeout(() => { setResetToken(result.resetToken); window.sessionStorage.removeItem(PASSWORD_OTP_SESSION_KEY); setMessage("Email verified. You can now create your new password."); }, 600); }).catch(e => { setError(e.message); setOtp(""); }).finally(() => setIsSubmitting(false)); } }} success={otpSuccess} value={otp} /></div></div>
            {cooldownSeconds === 0 && <p aria-live="polite" className="text-center text-xs font-semibold text-red-600 sm:text-sm">This verification code has expired. Request a new code below.</p>}
            {message && !error && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 sm:text-sm">{message}</p>}
            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button className="w-full text-xs font-bold text-water-700 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-sm" disabled={isSubmitting || cooldownSeconds > 0} onClick={sendOtp} type="button">{cooldownSeconds > 0 ? `Resend code in ${formatCountdown(cooldownSeconds)}` : "Resend code"}</button>
          </form>
        </section>
      )}

      {showNewPasswordCard && (
        <section aria-labelledby="new-password-heading">
          <h2 className="text-xl font-extrabold text-navy-900" id="new-password-heading">Create new password</h2>
          {method === "email" && <p className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-5 w-5 shrink-0" />{message}</p>}
          <form className="mt-4 space-y-4" onSubmit={handlePasswordSubmit}>
            {method === "current" && (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor="current-account-password">Current password</label>
                  <button className="text-xs font-bold text-water-700 hover:text-water-900 sm:text-sm" onClick={() => { setMethod("email"); setError(""); setMessage(""); }} type="button">Forgot password?</button>
                </div>
                <div className="relative mt-1.5 sm:mt-2">
                  <input autoComplete="current-password" className="ww-field py-2.5 pl-4 pr-11 text-sm sm:py-3 sm:pr-12 sm:text-base" disabled={isSubmitting} id="current-account-password" onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }} type={showPasswords ? "text" : "password"} value={currentPassword} />
                  <button aria-label={showPasswords ? "Hide passwords" : "Show passwords"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowPasswords((shown) => !shown)} type="button">{showPasswords ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                </div>
              </div>
            )}
            {passwordField("changed-account-password", "New password", newPassword, setNewPassword, "new-password")}
            <ul aria-label="Password requirements" className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 sm:p-4">
              {passwordRequirements.map((requirement, index) => (
                <RequirementRow key={requirement.id} label={requirement.label} met={requirementsMet[index]} />
              ))}
              <RequirementRow label="Passwords match" met={passwordsMatch} />
            </ul>
            <p aria-live="polite" className="sr-only">{requirementsMet.filter(Boolean).length} of {passwordRequirements.length} password requirements met{passwordsMatch ? ", passwords match" : ""}.</p>
            {passwordField("confirm-account-password", "Confirm new password", confirmation, setConfirmation, "new-password")}
            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
            <button className="ww-primary-button flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting || !canSubmit} type="submit">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Changing password…" : "Change password"}</button>
          </form>
        </section>
      )}
      </div>
    </div>
  );
}
