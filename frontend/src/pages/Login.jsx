import { useEffect, useRef, useState } from "react";
import {
  FiDroplet,
  FiEye,
  FiEyeOff,
  FiLoader,
  FiLock,
  FiMail,
} from "react-icons/fi";
import { Link, useLocation, useNavigate } from "react-router";
import { login, resendAdminLoginOtp, verifyAdminLoginOtp } from "../services/auth.service";
import { useToast } from "../components/Toast";
import OtpInput from "../components/OtpInput";
import PWAInstallButton from "../components/PWAInstallButton";
import { getStoredAccount, hasAuthenticatedSession } from "../services/authToken";

const accountDestinations = {
  admin: "/admin/dashboard",
  "super-admin": "/admin/dashboard",
  "meter-reader": "/meter-reader/readings-entry",
  consumer: "/consumer/home",
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(() => {
    // Shown after an expired-session redirect (expiry modal confirm passes
    // router state; 401 API logouts survive only via sessionStorage flag
    // because the full-page reload drops router state).
    if (location.state?.sessionExpired === true) return true;
    try {
      if (window.sessionStorage.getItem("waterwise:session-expired") === "1") {
        window.sessionStorage.removeItem("waterwise:session-expired");
        return true;
      }
    } catch {
      // Session storage unavailable; fall through to no notice.
    }
    return false;
  });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [adminChallengeToken, setAdminChallengeToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [identifierError, setIdentifierError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(300);

  useEffect(() => {
    if (!hasAuthenticatedSession()) return;
    const account = getStoredAccount();
    const destination = accountDestinations[account?.role];
    if (destination) navigate(destination, { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (location.state?.sessionExpired === true) {
      navigate(".", { replace: true, state: null });
    }
    // Clear one-time router state on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setLockSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [lockSeconds]);

  useEffect(() => {
    if (!adminChallengeToken || !otpExpiresAt) return undefined;

    const updateCountdown = () => {
      setOtpSecondsLeft(Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000)));
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [adminChallengeToken, otpExpiresAt]);

  const lockMessage = lockSeconds > 0
    ? `Too many incorrect attempts. Try again in ${Math.floor(lockSeconds / 60)}:${String(lockSeconds % 60).padStart(2, "0")}.`
    : "";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (adminChallengeToken) {
      if (!/^\d{6}$/.test(otp)) {
        setMessage("Enter the 6-digit verification code.");
        return;
      }
      setIsSubmitting(true);
      setMessage("");
      try {
        const result = await verifyAdminLoginOtp(adminChallengeToken, otp);
        toast.success("Admin verified", "Welcome to the WaterWise admin portal.");
        navigate(accountDestinations[result.user.role]);
      } catch (error) {
        setMessage(error.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const trimmedIdentifier = identifier.trim();
    const nextIdentifierError = !trimmedIdentifier
      ? "Enter your email address or username."
      : trimmedIdentifier.includes("@") &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier)
        ? "Enter a valid email address, such as name@example.com."
        : "";
    const nextPasswordError = !password
      ? "Enter your password."
      : "";

    setIdentifierError(nextIdentifierError);
    setPasswordError(nextPasswordError);

    if (nextIdentifierError || nextPasswordError) {
      setMessage("");
      requestAnimationFrame(() => {
        if (nextIdentifierError) {
          identifierRef.current?.focus();
        } else {
          passwordRef.current?.focus();
        }
      });
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setIdentifierError("");
    setPasswordError("");

    try {
      const result = await login({ email: trimmedIdentifier, password });
      if (result.requiresOtp) {
        setAdminChallengeToken(result.challengeToken);
        setMaskedEmail(result.maskedEmail);
        setOtp("");
        setOtpSecondsLeft(300);
        setOtpExpiresAt(Date.now() + 5 * 60 * 1000);
        setPassword("");
        setMessage(result.message);
        return;
      }
      const authenticatedRole = result.user?.role === "tenant"
        ? "consumer"
        : result.user?.role;
      const destination = accountDestinations[authenticatedRole];

      if (!destination) {
        throw new Error("This account does not have access to a WaterWise workspace.");
      }

      toast.success("Signed in", `Welcome back, ${result.user?.username ?? "WaterWise user"}.`);
      navigate(destination);
    } catch (error) {
      const status = error.cause?.response?.status;
      const errorField = error.cause?.response?.data?.field;
      const retryAfterSeconds = Number(
        error.cause?.response?.data?.retryAfterSeconds ?? 0,
      );
      const failedAttempts = Number(
        error.cause?.response?.data?.failedAttempts ?? 0,
      );
      const remainingAttempts = Number(
        error.cause?.response?.data?.remainingAttempts ?? 0,
      );
      const isCredentialError =
        [400, 401].includes(status) ||
        /invalid (email|username|password|credentials)/i.test(error.message);

      if (status === 429 && retryAfterSeconds > 0) {
        setLockSeconds(retryAfterSeconds);
        setIdentifierError("");
        setPasswordError("");
        setMessage("");
      } else if (isCredentialError && errorField === "identifier") {
        setIdentifierError(error.message || "Email address or username was not found.");
        setPasswordError("");
        setMessage("");
        requestAnimationFrame(() => identifierRef.current?.focus());
      } else if (isCredentialError && errorField === "password") {
        setIdentifierError("");
        const attemptWarning = failedAttempts >= 3 && remainingAttempts > 0
          ? `${remainingAttempts} login attempt${remainingAttempts === 1 ? "" : "s"} remaining before your account is temporarily locked.`
          : "";
        setPasswordError(
          attemptWarning
            ? `Incorrect password. ${attemptWarning}`
            : error.message || "Incorrect password.",
        );
        setMessage("");
        if (attemptWarning) {
          toast.warning("Login attempts running out", attemptWarning);
        }
        requestAnimationFrame(() => passwordRef.current?.focus());
      } else if (isCredentialError) {
        setIdentifierError("");
        setPasswordError("Incorrect password.");
        setMessage("");
        requestAnimationFrame(() => passwordRef.current?.focus());
      } else {
        const nextMessage = error.message || "We couldn't sign you in. Try again.";
        setMessage(nextMessage);
        toast.error("Sign-in failed", nextMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const otpCountdown = `${Math.floor(otpSecondsLeft / 60)}:${String(otpSecondsLeft % 60).padStart(2, "0")}`;

  const [otpSuccess, setOtpSuccess] = useState(false);

  const handleAutoVerifyOtp = async (otpValue) => {
    if (!/^\d{6}$/.test(otpValue)) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const result = await verifyAdminLoginOtp(adminChallengeToken, otpValue);
      setOtpSuccess(true);
      toast.success("Admin verified", "Welcome to the WaterWise admin portal.");
      setTimeout(() => navigate(accountDestinations[result.user.role]), 600);
    } catch (error) {
      setMessage(error.message);
      setOtp("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (isResending || otpSecondsLeft > 0) return;
    setIsResending(true);
    setMessage("");
    try {
      const result = await resendAdminLoginOtp(adminChallengeToken);
      setAdminChallengeToken(result.challengeToken);
      setMaskedEmail(result.maskedEmail);
      setOtp("");
      setOtpSecondsLeft(300);
      setOtpExpiresAt(Date.now() + 5 * 60 * 1000);
      setMessage(result.message);
    } catch (error) {
      const retryAfterSeconds = Number(error.cause?.response?.data?.retryAfterSeconds ?? 0);
      if (retryAfterSeconds > 0) {
        setOtpSecondsLeft(retryAfterSeconds);
        setOtpExpiresAt(Date.now() + retryAfterSeconds * 1000);
      }
      setMessage(error.message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className="ww-app h-screen overflow-hidden px-5 py-5 font-sans text-slate-900 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
      <section className="mx-auto flex h-full w-full max-w-6xl items-center justify-center">
        <div className="ww-glass-strong grid w-full overflow-hidden rounded-2xl lg:grid-cols-[0.94fr_1.06fr]">
          <aside className="ww-page-header relative flex flex-col rounded-none border-0 p-6 text-white shadow-none sm:p-10 lg:p-14">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-water-600 text-white shadow-sm"><FiDroplet aria-hidden="true" className="h-5 w-5" /></span>
                  <div>
                    <p className="text-sm font-extrabold tracking-[-0.02em] text-white">WaterWise</p>
                    <p className="text-xs font-medium text-water-200">Sucol Water System</p>
                  </div>
                </div>
                <PWAInstallButton variant="panel" />
              </div>
              <h1 className="mt-6 max-w-md text-2xl font-extrabold leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:mt-8">
                Every drop, clearly understood.
              </h1>
              <p className="mt-4 max-w-md text-xs leading-5 text-water-100 sm:text-base sm:leading-6 lg:mt-5">One secure place for water readings, bills, payments, and barangay updates.</p>
            </div>

          </aside>

          <div className="bg-white p-6 sm:p-10 lg:flex lg:items-center lg:p-14 overflow-auto">
            <div className="mx-auto max-w-xl">
              <div className="mb-8 lg:mb-10">
                <p className="ww-eyebrow text-[10px] sm:text-xs !text-water-700">
                  Secure sign in
                </p>
                <h2 className="mt-2 text-2xl font-extrabold leading-tight tracking-[-0.04em] text-slate-900 sm:text-4xl lg:mt-3">
                  {adminChallengeToken ? "Verify admin sign in" : "Sign in to your account"}
                </h2>
                <p className="mt-3 text-xs sm:text-sm leading-5 sm:leading-6 text-slate-500 lg:mt-4">
                  {adminChallengeToken ? `Enter the code sent to ${maskedEmail}. It expires in 5 minutes.` : "Use the credentials assigned to your WaterWise account."}
                </p>
              </div>

              {sessionExpiredNotice && !adminChallengeToken && (
                <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
                  <p className="text-xs font-semibold leading-5 text-amber-900 sm:text-sm">
                    Your session expired. Please sign in again.
                  </p>
                  <button
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-water-600 px-4 text-xs font-bold text-white transition hover:bg-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 sm:text-sm"
                    onClick={() => {
                      setSessionExpiredNotice(false);
                      requestAnimationFrame(() => identifierRef.current?.focus());
                    }}
                    type="button"
                  >
                    Sign in
                  </button>
                </div>
              )}

              <form aria-busy={isSubmitting} className="space-y-5 lg:space-y-6" onSubmit={handleSubmit}>
                {!adminChallengeToken && <div>
                  <label
                    className="text-sm sm:text-sm font-semibold text-slate-900"
                    htmlFor="login-identifier"
                  >
                    Email or username
                  </label>
                  <div className="relative mt-2">
                    <FiMail aria-hidden="true" className={`pointer-events-none absolute left-3 sm:left-4 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 ${identifierError ? "text-red-500" : "text-slate-400"}`} />
                    <input
                      aria-describedby={identifierError ? "login-identifier-error" : undefined}
                      aria-invalid={Boolean(identifierError)}
                      autoComplete="username"
                      className="ww-field py-2.5 sm:py-3 lg:py-3.5 pl-10 sm:pl-12 pr-4 text-sm sm:text-base"
                      disabled={isSubmitting || lockSeconds > 0}
                      id="login-identifier"
                      onChange={(event) => {
                        setIdentifier(event.target.value);
                        if (identifierError) setIdentifierError("");
                        if (message) setMessage("");
                      }}
                      placeholder="name@sucolwater.gov"
                      ref={identifierRef}
                      type="text"
                      value={identifier}
                    />
                  </div>
                  {identifierError && (
                    <p className="mt-2 text-xs sm:text-sm font-semibold text-red-700" id="login-identifier-error">
                      {identifierError}
                    </p>
                  )}
                </div>}

                {!adminChallengeToken && <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm sm:text-sm font-semibold text-slate-900" htmlFor="login-password">Password</label>
                    <Link className="text-sm sm:text-sm font-bold text-water-700 hover:text-water-900" to="/forgot-password">Forgot password?</Link>
                  </div>
                  <div className="relative mt-2">
                    <FiLock aria-hidden="true" className={`pointer-events-none absolute left-3 sm:left-4 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 ${passwordError ? "text-red-500" : "text-slate-400"}`} />
                    <input
                      aria-describedby={passwordError ? "login-password-error" : undefined}
                      aria-invalid={Boolean(passwordError)}
                      autoComplete="current-password"
                      className="ww-field py-2.5 sm:py-3 lg:py-3.5 pl-10 sm:pl-12 pr-12 text-sm sm:text-base"
                      disabled={isSubmitting || lockSeconds > 0}
                      id="login-password"
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (passwordError) setPasswordError("");
                        if (message) setMessage("");
                      }}
                      placeholder="Enter password"
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-water-600"
                      disabled={isSubmitting || lockSeconds > 0}
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? (
                        <FiEyeOff aria-hidden="true" className="h-5 w-5" />
                      ) : (
                        <FiEye aria-hidden="true" className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="mt-2 text-xs sm:text-sm font-semibold text-red-700" id="login-password-error">
                      {passwordError}
                    </p>
                  )}
                </div>}

                {adminChallengeToken && (
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-slate-900" id="admin-login-otp-label">Verification code</label>
                    <div className="mt-3">
                      <OtpInput
                        disabled={isSubmitting || otpSecondsLeft === 0}
                        id="admin-login-otp"
                        invalid={Boolean(message)}
                        onChange={(nextOtp) => { setOtp(nextOtp); setMessage(""); setOtpSuccess(false); }}
                        onAutoVerify={handleAutoVerifyOtp}
                        success={otpSuccess}
                        value={otp}
                      />
                    </div>
                    <p aria-live="polite" className={`mt-3 text-xs sm:text-sm font-semibold ${otpSecondsLeft > 0 ? "text-slate-500" : "text-red-600"}`}>
                      {otpSecondsLeft > 0 ? `Time remaining: ${otpCountdown}` : "This verification code has expired. Request a new code below."}
                    </p>
                    {otpSecondsLeft === 0 && (
                      <button
                        className="mt-3 text-xs sm:text-sm font-bold text-water-700 transition hover:text-water-900 disabled:cursor-not-allowed disabled:text-slate-400"
                        disabled={isSubmitting || isResending}
                        onClick={handleResendOtp}
                        type="button"
                      >
                        {isResending ? "Sending new code…" : "Resend code"}
                      </button>
                    )}
                  </div>
                )}

                {!adminChallengeToken && (
                <button
                  className="ww-primary-button flex min-h-10 sm:min-h-12 lg:min-h-[3.25rem] w-full items-center justify-center gap-2 px-5 py-3 text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 disabled:cursor-default disabled:bg-water-500 disabled:opacity-90"
                  disabled={isSubmitting || lockSeconds > 0}
                  style={{ cursor: isSubmitting ? "default" : undefined }}
                  type="submit"
                >
                  {isSubmitting && <FiLoader aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />}
                  {isSubmitting ? "Signing in…" : "Sign in"}
                </button>
                )}

                <span aria-live="polite" className="sr-only" role="status">
                  {isSubmitting ? (adminChallengeToken ? "Verifying admin code. Please wait." : "Signing in. Please wait.") : ""}
                </span>

                {lockMessage && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-red-700" role="alert">
                    {lockMessage}
                  </p>
                )}

                {message && (
                  <p
                    className="rounded-xl bg-white px-4 py-3 text-xs sm:text-sm font-medium text-slate-900"
                    role="status"
                  >
                    {message}
                  </p>
                )}
                {adminChallengeToken && (
                  <button className="w-full text-xs sm:text-sm font-bold text-water-700 hover:text-water-900" disabled={isSubmitting || isResending} onClick={() => { setAdminChallengeToken(""); setMaskedEmail(""); setOtp(""); setOtpExpiresAt(null); setOtpSecondsLeft(300); setMessage(""); }} type="button">Back to sign in</button>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
