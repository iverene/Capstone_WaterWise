import { useEffect, useState } from "react";
import { FiArrowLeft, FiLoader, FiMail } from "react-icons/fi";
import { Link, useNavigate } from "react-router";
import { requestPasswordReset, verifyPasswordResetOtp } from "../services/auth.service";
import OtpInput from "../components/OtpInput";
import { useToast } from "../components/Toast";
import { isValidEmail } from "../utils/email";

const formatCountdown = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const currentTimestamp = () => Date.now();

export default function ForgotPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [error, setError] = useState("");
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
    try {
      const result = await requestPasswordReset(normalizedEmail);
      setChallengeToken(result.challengeToken);
      setOtp("");
      toast.success("Code sent", result.message);
      setCooldownEmail(normalizedEmail);
      const now = currentTimestamp();
      setClock(now);
      setCooldownUntil(now + Number(result.cooldownSeconds ?? 300) * 1000);
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.retryAfterSeconds) {
        setCooldownEmail(normalizedEmail);
        const now = currentTimestamp();
        setClock(now);
        setCooldownUntil(now + requestError.retryAfterSeconds * 1000);
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

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address, such as name@example.com.");
      return;
    }
    await sendResetCode();
  };

  return (
    <main className="ww-app flex min-h-screen items-center justify-center px-4 py-8 font-sans text-slate-900">
      <section className="ww-glass-strong w-full max-w-lg rounded-2xl bg-white p-6 sm:p-10">
        <p className="ww-eyebrow text-[10px] sm:text-xs !text-water-700">Account recovery</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">{challengeToken ? "Verify your email" : "Forgot your password?"}</h1>
        <p className="mt-3 text-xs leading-5 sm:text-sm sm:leading-6 text-slate-500">{challengeToken ? <>Enter the code sent to <strong>{normalizedEmail.replace(/^(.{1,2}).*(@.*)$/, "$1***$2")}</strong>. It expires in 5 minutes.</> : "Enter the email address registered to your WaterWise account. We’ll send you a verification code."}</p>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          {!challengeToken ? <div>
            <label className="text-sm font-semibold" htmlFor="recovery-email">Email address</label>
            <div className="relative mt-2">
              <FiMail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input aria-invalid={Boolean(error)} autoComplete="email" className="ww-field py-3 pl-12 pr-4" disabled={isSubmitting} id="recovery-email" onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="name@example.com" type="email" value={email} />
            </div>
          </div> : <div>
            <label className="text-sm font-semibold" htmlFor="recovery-otp">Verification code</label>
            <div className="mt-3"><OtpInput disabled={isSubmitting} id="recovery-otp" invalid={Boolean(error)} onChange={(nextOtp) => { setOtp(nextOtp); setError(""); setOtpSuccess(false); }} onAutoVerify={(otpValue) => { if (/^\d{6}$/.test(otpValue)) { setIsSubmitting(true); setError(""); verifyPasswordResetOtp(challengeToken, otpValue).then(result => { setOtpSuccess(true); setTimeout(() => navigate(`/reset-password?token=${encodeURIComponent(result.resetToken)}`, { replace: true }), 600); }).catch(e => { setError(e.message); setOtp(""); }).finally(() => setIsSubmitting(false)); } }} success={otpSuccess} value={otp} /></div>
          </div>}
          {error && <p className="rounded-xl bg-red-50 p-3 text-xs sm:text-sm font-semibold text-red-700" role="alert">{error}</p>}
          {!challengeToken && isCurrentEmailCoolingDown && !error && <p className="rounded-xl bg-amber-50 p-3 text-xs sm:text-sm font-semibold text-amber-800" role="status">You can request another code in {countdownLabel}.</p>}
          {!challengeToken && <button className="ww-primary-button flex min-h-10 sm:min-h-12 w-full items-center justify-center gap-2 text-sm sm:text-base" disabled={isSubmitting || isCurrentEmailCoolingDown} type="submit">{isSubmitting && <FiLoader className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />}{isSubmitting ? "Sending code…" : isCurrentEmailCoolingDown ? `Try again in ${countdownLabel}` : "Send verification code"}</button>}
          {challengeToken && <div className="space-y-3">
            <button className="w-full text-xs sm:text-sm font-bold text-water-700 hover:text-water-900 disabled:cursor-not-allowed disabled:text-slate-400" disabled={isSubmitting || isCurrentEmailCoolingDown} onClick={sendResetCode} type="button">{isCurrentEmailCoolingDown ? `Resend code in ${countdownLabel}` : "Resend code"}</button>
            <button className="w-full text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900" disabled={isSubmitting} onClick={() => { setChallengeToken(""); setEmail(""); setOtp(""); setError(""); }} type="button">Use a different email</button>
          </div>}
        </form>
        <Link className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-water-700 hover:text-water-900" to="/login"><FiArrowLeft /> Back to sign in</Link>
      </section>
    </main>
  );
}
