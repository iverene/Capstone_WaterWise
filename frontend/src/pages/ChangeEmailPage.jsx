import { useEffect, useState } from "react";
import { Building2, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import OtpInput from "../components/OtpInput";
import PageHeader from "../components/PageHeader";
import AccountBackButton from "../components/AccountBackButton";
import {
  completeConsumerEmailChange,
  requestConsumerEmailChangeOtp,
  verifyConsumerEmailChangeOtp,
} from "../services/auth.service";
import { getStoredAccount, clearSession } from "../services/authToken";

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

const profileHomeByRole = {
  admin: "/admin/profile",
  "super-admin": "/admin/profile",
  "meter-reader": "/meter-reader/profile",
  consumer: "/consumer/profile-details",
};

export default function ChangeEmailPage() {
  const navigate = useNavigate();
  const accountRole = getStoredAccount()?.role ?? "consumer";
  const backPath = profileHomeByRole[accountRole] ?? "/login";

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
      window.sessionStorage.removeItem(EMAIL_OTP_SESSION_KEY);
      // Backend clears the HttpOnly session cookie on email change, so
      // staying on a protected page would bounce as generic "Session expired".
      // Clear local session, flag the reason, and go straight to login where
      // an email-specific success notice is shown instead.
      clearSession();
      try {
        window.sessionStorage.setItem("waterwise:email-changed", "1");
        window.sessionStorage.removeItem("waterwise:session-expired");
        window.sessionStorage.removeItem("waterwise:session-inactive");
      } catch {
        // Storage failures must not block the login redirect.
      }
      navigate("/login", { replace: true, state: { emailChanged: true, message: result.message, email: result.email } });
    } catch (requestError) { setError(requestError.message); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <AccountBackButton fallbackPath={backPath} />
        <PageHeader eyebrow="Account Security" title="Change Email" />
      </div>

      <div className="mx-auto w-full max-w-md">
        {!challengeToken && (
          <section aria-labelledby="email-otp-heading">
            <h2 className="text-xl text-center font-extrabold text-navy-900" id="email-otp-heading">Verify your current email</h2>
            <div className="mt-4 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-water-50 text-water-700"><Mail className="h-5 w-5" /></span>
              <p className="mt-3 text-sm leading-6 text-slate-600">We&apos;ll send a 6-digit verification code to your current registered email address.</p>
              {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm font-semibold text-red-700" role="alert">{error}</p>}
              <button className="ww-primary-button mx-auto mt-5 flex min-h-12 w-full max-w-xs items-center justify-center gap-2" disabled={isSubmitting || cooldownSeconds > 0} onClick={sendOtp} type="button">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Sending code…" : cooldownSeconds > 0 ? `Try again in ${formatCountdown(cooldownSeconds)}` : "Send verification code"}</button>
            </div>
          </section>
        )}

        {challengeToken && !emailChangeToken && (
          <section aria-labelledby="email-otp-verify-heading">
            <h2 className="text-base font-extrabold text-navy-900" id="email-otp-verify-heading">Enter verification code</h2>
            <form className="mt-4 space-y-3 sm:space-y-4" onSubmit={verifyOtp}>
              <p className="text-xs leading-5 text-slate-600 sm:text-sm">Enter the code sent to <strong>{maskedEmail}</strong>. It expires in 5 minutes.</p>
              <div>
                <label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor="email-change-otp">Verification code</label>
                <div className="mt-2 sm:mt-3"><OtpInput compact disabled={isSubmitting} id="email-change-otp" invalid={Boolean(error)} onChange={(nextOtp) => { setOtp(nextOtp); setError(""); setOtpSuccess(false); }} onAutoVerify={(otpValue) => { if (/^\d{6}$/.test(otpValue)) { setIsSubmitting(true); setError(""); verifyConsumerEmailChangeOtp(challengeToken, otpValue).then(result => { setOtpSuccess(true); setTimeout(() => { setEmailChangeToken(result.emailChangeToken); setMessage("Current email verified. Enter your new email address."); window.sessionStorage.removeItem(EMAIL_OTP_SESSION_KEY); }, 600); }).catch(e => { setError(e.message); setOtp(""); }).finally(() => setIsSubmitting(false)); } }} success={otpSuccess} value={otp} /></div>
              </div>
              {message && !error && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 sm:text-sm">{message}</p>}
              <button className="w-full text-xs font-bold text-water-700 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-sm" disabled={isSubmitting || cooldownSeconds > 0} onClick={sendOtp} type="button">{cooldownSeconds > 0 ? `Resend code in ${formatCountdown(cooldownSeconds)}` : "Resend code"}</button>
            </form>
          </section>
        )}

        {emailChangeToken && (
          <section aria-labelledby="new-email-heading">
            <h2 className="text-base font-extrabold text-navy-900" id="new-email-heading">Enter new email</h2>
            <form className="mt-4 space-y-4" onSubmit={changeEmail}>
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-5 w-5 shrink-0" />{message}</p>
              <div>
                <label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor="new-consumer-email">New email address</label>
                <input autoComplete="email" className="ww-field mt-1.5 py-2.5 pl-4 pr-4 text-sm sm:mt-2 sm:py-3 sm:text-base" id="new-consumer-email" onChange={(event) => { setNewEmail(event.target.value); setError(""); }} placeholder="name@example.com" type="email" value={newEmail} />
              </div>
              <button className="ww-primary-button mx-auto flex min-h-12 w-full max-w-xs items-center justify-center gap-2" disabled={isSubmitting} type="submit">{isSubmitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{isSubmitting ? "Changing email…" : "Save new email"}</button>
            </form>
          </section>
        )}

        {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:mt-5 sm:gap-3 sm:rounded-xl sm:p-4"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 sm:h-5 sm:w-5" /><p className="text-xs leading-5 text-amber-900 sm:text-sm sm:leading-6"><strong>Can&apos;t remember or access your current email?</strong> {accountRole === "consumer" ? "Please visit the Sucol Water System office so staff can verify your identity and update the email safely." : "Contact the authorized system administrator for identity verification and account recovery."}</p></div>
      </div>
    </div>
  );
}
