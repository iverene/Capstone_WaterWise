import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import Modal from "./Modal";

const formatCountdown = (totalSeconds) => `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;

/** Step-up confirmation: the Super Admin re-enters their own password to
 * authorize a single staff write (create/update/delete). The password is
 * kept in memory only and cleared on close or success. */
export default function StaffPasswordConfirmModal({
  actionLabel,
  error,
  isOpen,
  isVerifying,
  lockSeconds = 0,
  onClose,
  onPasswordChange,
  onSubmit,
  onToggleShowPassword,
  onUseEmailOtp,
  password,
  showPassword,
  username,
}) {
  return (
    <Modal
      closeLabel="Cancel staff action confirmation"
      closeOnOverlay={false}
      description={`Enter your Super Admin password to authorize: ${actionLabel}. This approval is single-use and expires in 5 minutes.`}
      dismissible={false}
      eyebrow="Super Admin verification"
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      size="sm"
      title="Confirm Staff Action"
    >
      <form className="grid gap-4 p-5 sm:p-6" onSubmit={onSubmit}>
        <div className="rounded-xl border border-water-200 bg-water-50 p-4 text-sm leading-6 text-water-900">
          <ShieldCheck aria-hidden="true" className="mr-2 inline h-5 w-5" />
          For extra security, this action requires your Super Admin password. It will not be stored anywhere.
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="staff-confirm-username">Super Admin username</label>
          <input
            autoComplete="username"
            className="ww-field mt-2 bg-slate-50 px-4 py-3"
            id="staff-confirm-username"
            readOnly
            type="text"
            value={username}
          />
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="staff-confirm-password">Your password</label>
          <div className="relative mt-2">
            <input
              autoComplete="current-password"
              autoFocus
              className="ww-field py-3 pl-4 pr-12"
              disabled={isVerifying || lockSeconds > 0}
              id="staff-confirm-password"
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Enter your Super Admin password"
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500"
              onClick={onToggleShowPassword}
              type="button"
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
        {lockSeconds > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800" role="alert">
            Too many incorrect attempts. Try again in {formatCountdown(lockSeconds)}.
          </p>
        )}
        <button className="ww-primary-button min-h-12" disabled={isVerifying || lockSeconds > 0 || !password} type="submit">
          {isVerifying ? "Verifying…" : "Confirm and continue"}
        </button>
        <button className="w-full text-sm font-bold text-water-700 disabled:cursor-not-allowed disabled:text-slate-400" disabled={isVerifying} onClick={onUseEmailOtp} type="button">
          Use email code instead
        </button>
        <button
          className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          disabled={isVerifying}
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </form>
    </Modal>
  );
}
