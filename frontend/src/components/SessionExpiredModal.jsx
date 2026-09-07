import Modal from "./Modal";

export default function SessionExpiredModal({ isOpen, onConfirm, reason, durationLabel = "15 minutes" }) {
  const isInactivity = reason === "inactivity";
  const title = isInactivity ? "Signed out" : "Session expired";
  const description = isInactivity
    ? `No activity for ${durationLabel}, so you were signed out.`
    : "Your session has ended. Please sign in again.";

  return (
    <Modal
      ariaLabel={title}
      bodyClassName="min-h-0"
      className="max-w-[min(25vw,25rem)] !rounded-none border-0 shadow-[0_26px_60px_rgba(12,55,145,0.28)]"
      closeOnOverlay={false}
      dismissible={false}
      isOpen={isOpen}
      onClose={onConfirm}
      overlayClassName="bg-[#2167df] px-4 py-8 sm:p-8"
      showCloseButton={false}
      showHeader={false}
      size="lg"
    >
      <div className="relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16">
        <div aria-hidden="true" className="absolute -right-24 -top-28 h-64 w-64 rounded-full border-[3rem] border-white/10" />
        <div aria-hidden="true" className="absolute -bottom-40 -left-24 h-72 w-72 rounded-full border-[3rem] border-water-100/60" />

        <h2 className="relative text-xl font-extrabold tracking-[-0.03em] text-navy-900 sm:text-2xl">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-md text-sm leading-6 text-slate-500 sm:text-base sm:leading-7">{description}</p>

        <div className="relative mx-auto mt-7 max-w-52">
          <button
            className="ww-primary-button flex min-h-11 w-full items-center justify-center px-5 text-sm"
            onClick={onConfirm}
            type="button"
          >
            Sign in again
          </button>
        </div>
      </div>
    </Modal>
  );
}
