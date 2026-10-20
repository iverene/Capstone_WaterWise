// Tracks the open dialogs.
//
// The app remounts its route tree whenever data changes anywhere in the
// system. Doing that while a dialog is open tears the dialog down and
// destroys its state, so a write flow that spans a dialog (e.g. the
// resident password verification code) would never complete. The app uses
// this to defer the remount until the last dialog closes.
//
// It lives in its own module so that Modal.jsx only exports a component and
// React Fast Refresh keeps working on it.

export const modalStack = [];
const modalStackListeners = new Set();

/** Tells the app whether any dialog is currently open. */
export function isAnyModalOpen() {
  return modalStack.length > 0;
}

/** Notifies subscribers whenever a dialog opens or closes. */
export function subscribeToModalStack(listener) {
  modalStackListeners.add(listener);
  return () => modalStackListeners.delete(listener);
}

export function pushModal(token) {
  modalStack.push(token);
  notifyModalStack();
}

export function removeModal(token) {
  const stackIndex = modalStack.lastIndexOf(token);
  if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
  notifyModalStack();
}

// The body scroll lock has to be captured once, when the first dialog opens.
// Capturing it per dialog would let the second dialog record "hidden" as the
// value to restore, and the page would stay unscrollable after the last
// dialog closed.
let bodyOverflowBeforeModals = null;

export function lockBodyScroll() {
  if (modalStack.length === 0) {
    bodyOverflowBeforeModals = document.body.style.overflow;
  }
  document.body.style.overflow = "hidden";
}

export function unlockBodyScroll() {
  if (modalStack.length > 0) return;
  document.body.style.overflow = bodyOverflowBeforeModals ?? "";
  bodyOverflowBeforeModals = null;
}

function notifyModalStack() {
  const open = modalStack.length > 0;
  for (const listener of modalStackListeners) listener(open);
}
