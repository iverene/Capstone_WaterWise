import { useState } from "react";
import { FiArrowLeft, FiEye, FiEyeOff, FiLoader, FiLock } from "react-icons/fi";
import { Link, useSearchParams } from "react-router";
import { resetPassword } from "../services/auth.service";

function isStrongPassword(password) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) return setError("Verify the email OTP before changing your password.");
    if (!isStrongPassword(password)) return setError("Use at least 8 characters with uppercase, lowercase, a number, and a symbol.");
    if (password !== confirmation) return setError("The passwords do not match.");
    setIsSubmitting(true);
    setError("");
    try {
      const result = await resetPassword(token, password);
      setMessage(result.message);
      setPassword("");
      setConfirmation("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordInput = (id, label, value, setter, autoComplete) => (
    <div>
          <label className="text-xs sm:text-sm font-semibold" htmlFor={id}>{label}</label>
      <div className="relative mt-2">
        <FiLock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input autoComplete={autoComplete} className="ww-field py-3 pl-12 pr-12" disabled={isSubmitting || Boolean(message)} id={id} onChange={(event) => { setter(event.target.value); setError(""); }} type={showPassword ? "text" : "password"} value={value} />
        <button aria-label={showPassword ? "Hide passwords" : "Show passwords"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowPassword((shown) => !shown)} type="button">{showPassword ? <FiEyeOff /> : <FiEye />}</button>
      </div>
    </div>
  );

  return (
    <main className="ww-app flex min-h-screen items-center justify-center px-4 py-8 font-sans text-slate-900">
      <section className="ww-glass-strong w-full max-w-lg rounded-2xl bg-white p-6 sm:p-10">
        <p className="ww-eyebrow text-[10px] sm:text-xs !text-water-700">Account security</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">Create a new password</h1>
        <p className="mt-3 text-xs leading-5 sm:text-sm sm:leading-6 text-slate-500">Your email code was verified. Choose a strong new password for your account.</p>
        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          {passwordInput("new-password", "New password", password, setPassword, "new-password")}
          {passwordInput("confirm-password", "Confirm new password", confirmation, setConfirmation, "new-password")}
          <p className="text-xs leading-5 text-slate-500">Use 8 or more characters with uppercase, lowercase, a number, and a symbol.</p>
          {error && <p className="rounded-xl bg-red-50 p-3 text-xs sm:text-sm font-semibold text-red-700" role="alert">{error}</p>}
          {message && <p className="rounded-xl bg-emerald-50 p-3 text-xs sm:text-sm font-semibold text-emerald-800" role="status">{message}</p>}
          {!message && <button className="ww-primary-button flex min-h-10 sm:min-h-12 w-full items-center justify-center gap-2 text-sm sm:text-base" disabled={isSubmitting} type="submit">{isSubmitting && <FiLoader className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />}{isSubmitting ? "Updating password…" : "Reset password"}</button>}
        </form>
        <Link className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-water-700 hover:text-water-900" to="/login"><FiArrowLeft /> Back to sign in</Link>
      </section>
    </main>
  );
}
