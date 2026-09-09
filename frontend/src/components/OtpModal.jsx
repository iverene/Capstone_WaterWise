import Modal from "./Modal";

/** Shared shell for the account-security OTP dialogs. */
export default function OtpModal({ className = "", ...props }) {
  return <Modal
    {...props}
    size="sm"
    eyebrow="Account security"
    headerClassName="!px-4 !py-4 sm:!px-6 [&_h2]:!text-xl sm:[&_h2]:!text-2xl"
    closeButtonProps={{ className: "!h-11 !w-11" }}
    className={`[&_[role=group]]:gap-2 [&_[role=group]_input]:h-12 [&_[role=group]_input]:rounded-lg [&_[role=group]_input]:text-xl ${className}`}
  />;
}
