import { Trash2 } from "lucide-react";
import { useRef } from "react";
import Modal from "./Modal";

/**
 * Shared warning for forms with unsaved input. The layout mirrors the sign-out
 * confirmation so destructive actions use the same visual language.
 */
export default function DiscardChangesDialog({
  description = "Are you sure you want to discard your changes?",
  discardLabel = "Discard changes",
  isOpen,
  keepLabel = "Cancel",
  onDiscard,
  onKeepEditing,
  title = "Discard changes?",
}) {
  const cancelButtonRef = useRef(null);

  return (
    <Modal
      ariaLabel={title}
      className="max-w-md"
      initialFocusRef={cancelButtonRef}
      isOpen={isOpen}
      onClose={onKeepEditing}
      showCloseButton={false}
      showHeader={false}
      size="sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <Trash2 aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-xl font-extrabold tracking-[-0.03em] text-navy-900">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
            onClick={onKeepEditing}
            ref={cancelButtonRef}
            type="button"
          >
            {keepLabel}
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-bold text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
            onClick={onDiscard}
            type="button"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {discardLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
