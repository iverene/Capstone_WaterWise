import { useEffect, useRef, useState } from "react";
import {
  FiCheckCircle,
  FiClock,
  FiEye,
  FiEyeOff,
  FiHelpCircle,
  FiLoader,
  FiLock,
  FiMail,
  FiMapPin,
  FiShield,
} from "react-icons/fi";
import { Link, useLocation, useNavigate } from "react-router";
import { fetchTrustedDevices, login, resendAdminLoginOtp, verifyAdminLoginOtp } from "../services/auth.service";
import { useToast } from "../components/Toast";
import OtpInput from "../components/OtpInput";
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
  const sessionNoticeShownRef = useRef(false);
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
  const [lockedIdentifier, setLockedIdentifier] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(300);

  useEffect(() => {
    if (!hasAuthenticatedSession()) return;
    const account = getStoredAccount();
    const destination = accountDestinations[account?.role];
    if (destination) navigate(destination, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const wasExpired = location.state?.sessionExpired === true;
    const wasInactive = location.state?.sessionInactive === true;
    let flagExpired = false;
    let flagInactive = false;
    try {
      // Full-page reloads (e.g. a 401 from the API layer) drop router state,
      // so the reason is also persisted in sessionStorage flags.
      flagExpired = window.sessionStorage.getItem("waterwise:session-expired") === "1";
      flagInactive = window.sessionStorage.getItem("waterwise:session-inactive") === "1";
    } catch {
      // Ignore storage failures.
    }
    // Persistent until the user taps anywhere; guarded for StrictMode remounts.
    if ((wasExpired || flagExpired || wasInactive || flagInactive) && !sessionNoticeShownRef.current) {
      sessionNoticeShownRef.current = true;
      if (wasInactive || flagInactive) {
        toast.warning("Signed out", "No activity for some time, so you were signed out. Please sign in again.", {
          dismissOnInteract: true,
          duration: 0,
        });
      } else {
        toast.error("Session expired", "Your session has ended. Please sign in again.", {
          dismissOnInteract: true,
          duration: 0,
        });
      }
    }
    if (wasExpired || wasInactive) {
      navigate(".", { replace: true, state: null });
    }
    try {
      window.sessionStorage.removeItem("waterwise:session-inactive");
      window.sessionStorage.removeItem("waterwise:session-expired");
    } catch {
      // Ignore storage failures.
    }
    // Clear one-time router state on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => {
      if (lockSeconds <= 1) {
        setLockSeconds(0);
        setLockedIdentifier("");
      } else {
        setLockSeconds(lockSeconds - 1);
      }
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

  // The server lock is per account, so the countdown note and submit block
  // apply only while the typed identifier matches the locked one. Typing a
  // different account hides the note and allows signing in without refresh.
  const isLockedIdentifier =
    lockSeconds > 0 &&
    lockedIdentifier !== "" &&
    identifier.trim().toLowerCase() === lockedIdentifier;

  const lockMessage = isLockedIdentifier
    ? `Too many incorrect attempts. Try again in ${Math.floor(lockSeconds / 60)}:${String(lockSeconds % 60).padStart(2, "0")}.`
    : "";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (isLockedIdentifier) return;

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
        confirmTrustedCookie();
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
        // eslint-disable-next-line react-hooks/purity -- event handler, not render
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
        setLockedIdentifier(trimmedIdentifier.toLowerCase());
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

  // After a successful admin OTP verification the backend sets an HttpOnly
  // trust cookie. Confirm it stuck: if this browser won't persist/send it
  // (blocked cookies, mismatched localhost vs 127.0.0.1 host), the next
  // login would ask for OTP again — warn now instead of failing silently.
  const confirmTrustedCookie = async () => {
    try {
      const result = await fetchTrustedDevices();
      const devices = result.devices ?? [];
      if (!devices.some((device) => device.isCurrent)) {
        toast.warning(
          "Browser not remembered",
          "This browser did not save the trusted-device cookie, so the next sign-in will ask for a code again. Allow cookies for this site and use the same address (localhost or 127.0.0.1) every time.",
          { dismissOnInteract: true, duration: 0 },
        );
      }
    } catch {
      // Non-fatal: the sign-in itself already succeeded.
    }
  };

  const handleAutoVerifyOtp = async (otpValue) => {
    if (!/^\d{6}$/.test(otpValue)) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const result = await verifyAdminLoginOtp(adminChallengeToken, otpValue);
      setOtpSuccess(true);
      toast.success("Admin verified", "Welcome to the WaterWise admin portal.");
      confirmTrustedCookie();
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
    <main className="min-h-screen bg-canvas bg-gradient-to-b from-water-50 to-transparent px-5 py-6 font-sans text-slate-900 sm:px-8 sm:py-10">
      <section className="mx-auto flex w-full max-w-md flex-col items-center">
        <img
          alt="Sucol WaterWise logo"
          className="mt-4 h-[102px] w-auto sm:h-[118px]"
          src="/Sucol_logo.png"
        />
        <h1 className="mt-2 text-center text-xl font-extrabold leading-tight tracking-[-0.04em] text-slate-900 sm:text-[1.75rem]">
          {adminChallengeToken ? "Verify admin sign in" : "Sign in to your account"}
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-500">
          {adminChallengeToken ? <>Enter the code sent to <strong>{maskedEmail}</strong>. It expires in 5 minutes.</> : "Use the credentials assigned to your WaterWise account."}
        </p>
        <div className="ww-glass-strong mt-8 w-full rounded-2xl bg-white p-6 sm:p-8">
          <form aria-busy={isSubmitting} className="space-y-5" onSubmit={handleSubmit}>
            {!adminChallengeToken && <div>
              <label
                className="text-sm font-semibold text-slate-900"
                htmlFor="login-identifier"
              >
                Email or username
              </label>
              <div className="relative mt-2">
                <FiMail aria-hidden="true" className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${identifierError ? "text-red-500" : "text-slate-400"}`} />
                <input
                  aria-describedby={identifierError ? "login-identifier-error" : undefined}
                  aria-invalid={Boolean(identifierError)}
                  autoComplete="username"
                  className="ww-field py-3 pl-12 pr-4 text-base"
                  disabled={isSubmitting}
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
                <p className="mt-2 text-[13px] font-semibold text-red-700" id="login-identifier-error">
                  {identifierError}
                </p>
              )}
            </div>}

            {!adminChallengeToken && <div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold text-slate-900" htmlFor="login-password">Password</label>
                <Link className="text-sm font-bold text-water-700 hover:text-water-900" to="/forgot-password">Forgot password?</Link>
              </div>
              <div className="relative mt-2">
                <FiLock aria-hidden="true" className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${passwordError ? "text-red-500" : "text-slate-400"}`} />
                <input
                  aria-describedby={passwordError ? "login-password-error" : undefined}
                  aria-invalid={Boolean(passwordError)}
                  autoComplete="current-password"
                  className="ww-field py-3 pl-12 pr-12 text-base"
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                <p className="mt-2 text-[13px] font-semibold text-red-700" id="login-password-error">
                  {passwordError}
                </p>
              )}
            </div>}

            {!adminChallengeToken && (
            <button
              className="ww-primary-button flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 disabled:cursor-default disabled:bg-water-500 disabled:opacity-90"
              disabled={isSubmitting || isLockedIdentifier}
              style={{ cursor: isSubmitting ? "default" : undefined }}
              type="submit"
            >
              {isSubmitting && <FiLoader aria-hidden="true" className="h-5 w-5 animate-spin" />}
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
            )}

            <span aria-live="polite" className="sr-only" role="status">
              {isSubmitting ? (adminChallengeToken ? "Verifying admin code. Please wait." : "Signing in. Please wait.") : ""}
            </span>

            {adminChallengeToken && (
              <div>
                <label className="text-sm font-semibold text-slate-900" id="admin-login-otp-label">Verification code</label>
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
                <p aria-live="polite" className={`mt-3 text-[13px] font-semibold ${otpSecondsLeft > 0 ? "text-slate-500" : "text-red-600"}`}>
                  {otpSecondsLeft > 0 ? `Time remaining: ${otpCountdown}` : "This verification code has expired. Request a new code below."}
                </p>
                {otpSecondsLeft === 0 && (
                  <button
                    className="mt-3 text-sm font-bold text-water-700 transition hover:text-water-900 disabled:cursor-not-allowed disabled:text-slate-400"
                    disabled={isSubmitting || isResending}
                    onClick={handleResendOtp}
                    type="button"
                  >
                    {isResending ? "Sending new code…" : "Resend code"}
                  </button>
                )}
              </div>
            )}

            {lockMessage && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
                {lockMessage}
              </p>
            )}

            {message && (
              <p
                className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900"
                role="status"
              >
                {message}
              </p>
            )}
            {adminChallengeToken && (
              <button className="w-full text-sm font-bold text-water-700 hover:text-water-900" disabled={isSubmitting || isResending} onClick={() => { setAdminChallengeToken(""); setMaskedEmail(""); setOtp(""); setOtpExpiresAt(null); setOtpSecondsLeft(300); setMessage(""); }} type="button">Back to sign in</button>
            )}
          </form>
        </div>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
          <li className="flex items-center gap-1.5"><FiShield aria-hidden="true" className="h-3.5 w-3.5 text-water-700" /> OTP protected</li>
          <li className="flex items-center gap-1.5"><FiLock aria-hidden="true" className="h-3.5 w-3.5 text-water-700" /> Encrypted session</li>
          <li className="flex items-center gap-1.5"><FiCheckCircle aria-hidden="true" className="h-3.5 w-3.5 text-water-700" /> Barangay verified</li>
        </ul>
        <footer className="mt-6 w-full rounded-2xl border border-slate-200 bg-white/80 px-5 py-2 shadow-sm">
          <ul className="divide-y divide-slate-100">
            <li className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-water-50 text-water-700"><FiMapPin aria-hidden="true" className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">Sucol Water System office</span>
                <span className="block text-xs text-slate-500">Barangay Sucol</span>
              </span>
            </li>
            <li className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-water-50 text-water-700"><FiClock aria-hidden="true" className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">Open Mon–Fri</span>
                <span className="block text-xs text-slate-500">8:00am – 5:00pm</span>
              </span>
            </li>
            <li className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-water-50 text-water-700"><FiHelpCircle aria-hidden="true" className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">Need account help?</span>
                <span className="block text-xs text-slate-500">Visit the office to verify your identity</span>
              </span>
            </li>
          </ul>
        </footer>
      </section>
    </main>
  );
}
