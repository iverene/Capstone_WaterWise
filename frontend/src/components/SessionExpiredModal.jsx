import { FiClock } from "react-icons/fi";
import Modal from "./Modal";

export default function SessionExpiredModal({ isOpen, onConfirm }) {
  return (
    <Modal
      closeOnOverlay={false}
      description="Your session has ended. Please sign in again to continue."
      dismissible={false}
      eyebrow="Session expired"
      isOpen={isOpen}
      onClose={onConfirm}
      showCloseButton={false}
      size="sm"
      title="Session expired"
    >
      <div className="flex flex-col items-center gap-4 p-5 text-center sm:p-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-water-50 text-water-700">
          <FiClock aria-hidden="true" className="h-7 w-7" />
        </span>
        <p className="max-w-sm text-sm leading-6 text-slate-600">
          For your security, WaterWise signed you out after your session expired.
        </p>
        <button
          className="ww-primary-button flex min-h-12 w-full items-center justify-center px-5 text-sm sm:text-base"
          onClick={onConfirm}
          type="button"
        >
          Sign in again
        </button>
      </div>
    </Modal>
  );
}
