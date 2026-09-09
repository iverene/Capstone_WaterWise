import { useEffect, useState } from "react";
import { Building2, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { completeConsumerEmailChange, requestConsumerEmailChangeOtp, verifyConsumerEmailChangeOtp } from "../services/auth.service";
import { getStoredAccount } from "../services/authToken";
import Modal from "./Modal";
import OtpInput from "./OtpInput";

const formatCountdown = (totalSeconds) => `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
const EMAIL_OTP_SESSION_KEY = "waterwise:email-change-otp-challenge";

function getSavedEmailOtpChallenge() {
  try {
    const savedChallenge = JSON.parse(window.sessionStorage.getItem(EMAIL_OTP_SESSION_KEY) ?? "null");
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
    window.sessionStorage.removeItem(EMAIL_OTP_SESSION_KEY);
  } catch {
    window.sessionStorage.removeItem(EMAIL_OTP_SESSION_KEY);
  }
  return null;
}

export default function ChangeEmailModal({ accountRole = "consumer", isOpen, onClose, onSuccess }) {
  const [savedChallenge] = useState(getSavedEmailOtpChallenge);
  const [challengeToken, setChallengeToken] = useState(savedChallenge?.challengeToken ?? "");
  const [emailChangeToken, setEmailChangeToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState(savedChallenge?.maskedEmail ?? "");
  const [otp, setOtp] = useState("");
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [message, setMessage] = useState(savedChallenge ? "Enter the verification code sent to your current email address." : "");
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

  const sendOtp = async () => {
    setIsSubmitting(true); setError("");
    try {
      const result = await requestConsumerEmailChangeOtp();
      const expiresAt = Date.now() + Number(result.cooldownSeconds ?? 300) * 1000;
      setChallengeToken(result.challengeToken); setMaskedEmail(result.maskedEmail); setMessage(result.message); setOtp(""); setClock(Date.now()); setCooldownUntil(expiresAt);
      window.sessionStorage.setItem(EMAIL_OTP_SESSION_KEY, JSON.stringify({ challengeToken: result.challengeToken, maskedEmail: result.maskedEmail, expiresAt, accountId: getStoredAccount()?.id ?? null }));
    } catch (requestError) { setError(requestError.message); if (requestError.retryAfterSeconds) { setClock(Date.now()); setCooldownUntil(Date.now() + requestError.retryAfterSeconds * 1000); } }
    finally { setIsSubmitting(false); }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setError("Enter the 6-digit verification code.");
    setIsSubmitting(true); setError("");
    try {
      const result = await verifyConsumerEmailChangeOtp(challengeToken, otp);
      setEmailChangeToken(result.emailChangeToken); setMessage("Current email verified. Enter your new email address."); window.sessionStorage.removeItem(EMAIL_OTP_SESSION_KEY);
    } catch (requestError) { setError(requestError.message); }
    finally { setIsSubmitting(false); }
  };

  const changeEmail = async (event) => {
    event.preventDefault();
    const normalizedEmail = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError("Enter a valid complete email address, such as name@example.com.");
    setIsSubmitting(true); setError("");
    try {
      const result = await completeConsumerEmailChange(emailChangeToken, normalizedEmail);
      window.sessionStorage.removeItem(EMAIL_OTP_SESSION_KEY); onSuccess?.(result); onClose();
    } catch (requestError) { setError(requestError.message); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Modal closeButtonProps={{ className: "!h-9 !w-9 sm:!h-11 sm:!w-11" }} description="Verify your current registered email before replacing it." eyebrow="Account security" headerClassName="!px-4 !py-3 sm:!px-6 sm:!py-4 [&_h2]:!text-xl sm:[&_h2]:!text-2xl [&_p]:!text-xs sm:[&_p]:!text-sm" isOpen={isOpen} onClose={onClose} size="sm" title="Change email address">
      <div className="p-4 sm:p-6">
        {!challengeToken && <div className="text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-water-50 text-water-700"><Mail className="h-5 w-5" /></span><p className="mt-3 text-sm leading-6 text-slate-600">We’ll send a 6-digit verification code to your current registered email address.</p><button className="ww-primary-button mt-5 flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting || cooldownSeconds > 0} onClick={sendOtp} type="button">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Sending code…" : cooldownSeconds > 0 ? `Try again in ${formatCountdown(cooldownSeconds)}` : "Send verification code"}</button></div>}

        {challengeToken && !emailChangeToken && <form className="space-y-3 sm:space-y-4" onSubmit={verifyOtp}><p className="text-xs leading-5 text-slate-600 sm:text-sm">Enter the code sent to <strong>{maskedEmail}</strong>. It expires in 5 minutes.</p><div><label className="text-xs font-semibold sm:text-sm" htmlFor="email-change-otp">Verification code</label><div className="mt-2 sm:mt-3"><OtpInput compact disabled={isSubmitting} id="email-change-otp" invalid={Boolean(error)} onChange={(nextOtp) => { setOtp(nextOtp); setError(""); setOtpSuccess(false); }} onAutoVerify={(otpValue) => { if (/^\d{6}$/.test(otpValue)) { setIsSubmitting(true); setError(""); verifyConsumerEmailChangeOtp(challengeToken, otpValue).then(result => { setOtpSuccess(true); setTimeout(() => { setEmailChangeToken(result.emailChangeToken); setMessage("Current email verified. Enter your new email address."); window.sessionStorage.removeItem(EMAIL_OTP_SESSION_KEY); }, 600); }).catch(e => { setError(e.message); setOtp(""); }).finally(() => setIsSubmitting(false)); } }} success={otpSuccess} value={otp} /></div></div>{message && !error && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 sm:text-sm">{message}</p>}<button className="w-full text-xs font-bold text-water-700 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-sm" disabled={isSubmitting || cooldownSeconds > 0} onClick={sendOtp} type="button">{cooldownSeconds > 0 ? `Resend code in ${formatCountdown(cooldownSeconds)}` : "Resend code"}</button></form>}

        {emailChangeToken && <form className="space-y-4" onSubmit={changeEmail}><p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-5 w-5" />{message}</p><div><label className="text-sm font-semibold" htmlFor="new-consumer-email">New email address</label><input autoComplete="email" className="ww-field mt-2 py-3" id="new-consumer-email" onChange={(event) => { setNewEmail(event.target.value); setError(""); }} placeholder="name@example.com" type="email" value={newEmail} /></div><button className="ww-primary-button flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting} type="submit">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Changing email…" : "Save new email"}</button></form>}

        {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:mt-5 sm:gap-3 sm:rounded-xl sm:p-4"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 sm:h-5 sm:w-5" /><p className="text-xs leading-5 text-amber-900 sm:text-sm sm:leading-6"><strong>Can’t remember or access your current email?</strong> {accountRole === "consumer" ? "Please visit the Sucol Water System office so staff can verify your identity and update the email safely." : "Contact the authorized system administrator for identity verification and account recovery."}</p></div>
      </div>
    </Modal>
  );
}
