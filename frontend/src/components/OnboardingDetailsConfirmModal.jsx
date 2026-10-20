import { useRef } from "react";
import { ArrowRight, Info } from "lucide-react";
import Modal from "./Modal";

/**
 * Shown when the resident leaves the contact number and/or the email address
 * untouched. The details already on file are then used, so the resident is
 * asked to confirm before the wizard moves on.
 */
export default function OnboardingDetailsConfirmModal({
  isOpen,
  kept = [],
  onCancel,
  onConfirm,
}) {
  const cancelButtonRef = useRef(null);

  return (
    <Modal
      ariaLabel="Confirm unchanged account details"
      className="max-w-md"
      dismissible
      initialFocusRef={cancelButtonRef}
      isOpen={isOpen}
      onClose={onCancel}
      showCloseButton={false}
      showHeader={false}
      size="sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-600">
            <Info aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-xl font-extrabold tracking-[-0.03em] text-navy-900">
              Keeping your current details?
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              You did not change the following, so the details already on file will be used.
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {kept.map((item) => (
            <li
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              key={item.label}
            >
              <p className="text-xs font-semibold text-slate-500">{item.label}</p>
              <p className="mt-0.5 break-words text-sm font-bold text-navy-900">{item.value}</p>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          You can still change these details any time from your profile.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            Go back
          </button>
          <button
            className="ww-primary-button inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm"
            onClick={onConfirm}
            type="button"
          >
            Proceed
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
