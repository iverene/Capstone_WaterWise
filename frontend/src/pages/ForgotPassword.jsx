import { useEffect, useState } from "react";
import { FiArrowLeft, FiDroplet, FiLoader, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router";
import { requestPasswordReset, verifyPasswordResetOtp } from "../services/auth.service";
import OtpInput from "../components/OtpInput";

const formatCountdown = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownEmail, setCooldownEmail] = useState("");
  const [clock, setClock] = useState(0);

  const normalizedEmail = email.trim().toLowerCase();
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000));
  const isCurrentEmailCoolingDown = cooldownSeconds > 0 && normalizedEmail === cooldownEmail;
  const countdownLabel = formatCountdown(cooldownSeconds);

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= cooldownUntil) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const sendResetCode = async () => {
    setIsSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await requestPasswordReset(normalizedEmail);
      setChallengeToken(result.challengeToken);
      setOtp("");
      setMessage(result.message);
      setCooldownEmail(normalizedEmail);
      setClock(Date.now());
      setCooldownUntil(Date.now() + Number(result.cooldownSeconds ?? 300) * 1000);
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.retryAfterSeconds) {
        setCooldownEmail(normalizedEmail);
        setClock(Date.now());
        setCooldownUntil(Date.now() + requestError.retryAfterSeconds * 1000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (challengeToken) {
      if (!/^\d{6}$/.test(otp)) {
        setError("Enter the 6-digit verification code.");
        return;
      }
      setIsSubmitting(true);
      setError("");
      try {
        const result = await verifyPasswordResetOtp(challengeToken, otp);
        navigate(`/reset-password?token=${encodeURIComponent(result.resetToken)}`, { replace: true });
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address, such as name@example.com.");
      return;
    }
    await sendResetCode();
  };

  return (
    <main className="ww-app flex min-h-screen items-center justify-center px-4 py-8 font-sans text-slate-900">
      <section className="ww-glass-strong w-full max-w-lg rounded-2xl bg-white p-6 sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-water-600 text-white"><FiDroplet className="h-5 w-5" /></span>
        <p className="ww-eyebrow mt-6 !text-water-700">Account recovery</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">{challengeToken ? "Verify your email" : "Forgot your password?"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{challengeToken ? `Enter the 6-digit code sent to ${email.trim()}. The code expires in 5 minutes.` : "Enter the email address registered to your WaterWise account. We’ll send you a verification code."}</p>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          {!challengeToken ? <div>
            <label className="text-sm font-semibold" htmlFor="recovery-email">Email address</label>
            <div className="relative mt-2">
              <FiMail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input aria-invalid={Boolean(error)} autoComplete="email" className="ww-field py-3 pl-12 pr-4" disabled={isSubmitting} id="recovery-email" onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="name@example.com" type="email" value={email} />
            </div>
          </div> : <div>
            <label className="text-sm font-semibold" htmlFor="recovery-otp">Verification code</label>
            <div className="mt-3"><OtpInput disabled={isSubmitting} id="recovery-otp" invalid={Boolean(error)} onChange={(nextOtp) => { setOtp(nextOtp); setError(""); }} value={otp} /></div>
          </div>}
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{isCurrentEmailCoolingDown ? `Please wait ${countdownLabel} before requesting another verification code.` : error}</p>}
          {!challengeToken && isCurrentEmailCoolingDown && !error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800" role="status">You can request another code in {countdownLabel}.</p>}
          {message && challengeToken && !error && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p>}
          <button className="ww-primary-button flex min-h-12 w-full items-center justify-center gap-2" disabled={isSubmitting || (!challengeToken && isCurrentEmailCoolingDown)} type="submit">{isSubmitting && <FiLoader className="h-5 w-5 animate-spin" />}{isSubmitting ? (challengeToken ? "Verifying code…" : "Sending code…") : (challengeToken ? "Verify code" : isCurrentEmailCoolingDown ? `Try again in ${countdownLabel}` : "Send verification code")}</button>
          {challengeToken && <div className="space-y-3">
            <button className="w-full text-sm font-bold text-water-700 hover:text-water-900 disabled:cursor-not-allowed disabled:text-slate-400" disabled={isSubmitting || isCurrentEmailCoolingDown} onClick={sendResetCode} type="button">{isCurrentEmailCoolingDown ? `Resend code in ${countdownLabel}` : "Resend code"}</button>
            <button className="w-full text-sm font-bold text-slate-600 hover:text-slate-900" disabled={isSubmitting} onClick={() => { setChallengeToken(""); setEmail(""); setOtp(""); setMessage(""); setError(""); }} type="button">Use a different email</button>
          </div>}
        </form>
        <Link className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-water-700 hover:text-water-900" to="/login"><FiArrowLeft /> Back to sign in</Link>
      </section>
    </main>
  );
}
