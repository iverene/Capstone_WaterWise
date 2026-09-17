import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Plus } from "lucide-react";
import Modal from "./Modal";
import PaymentForm from "./PaymentForm";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function PaymentModal({
  billingRecords = [],
  error = "",
  initialBilling = null,
  isOpen,
  onClose,
  onRecordAnother,
  onSubmit,
  onViewReceipt,
}) {
  const successHeadingRef = useRef(null);
  const [completedPayment, setCompletedPayment] = useState(null);
  const [formVersion, setFormVersion] = useState(0);
  const [useInitialBilling, setUseInitialBilling] = useState(true);

  useEffect(() => {
    if (completedPayment) {
      requestAnimationFrame(() => successHeadingRef.current?.focus());
    }
  }, [completedPayment]);

  if (!isOpen) return null;

  const effectiveInitialBilling = useInitialBilling ? initialBilling : null;
  const initialData = effectiveInitialBilling
    ? {
        billingId: effectiveInitialBilling.id,
        consumerName: effectiveInitialBilling.consumerName,
        currentBalance: effectiveInitialBilling.outstandingBalance,
      }
    : null;

  const recordAnother = () => {
    setCompletedPayment(null);
    setUseInitialBilling(false);
    setFormVersion((version) => version + 1);
    onRecordAnother?.();
  };

  return (
    <Modal
      closeLabel="Close payment modal"
      eyebrow="Payment administration"
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={Boolean(completedPayment)}
      title={completedPayment ? "Payment Recorded" : "Record Payment"}
      zIndexClass="z-40"
    >
          {completedPayment ? (
            <div className="flex min-h-full flex-col justify-center p-5 sm:p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 aria-hidden="true" className="h-6 w-6" />
              </span>
              <h3
                className="mt-4 text-xl font-extrabold text-navy-900 outline-none"
                ref={successHeadingRef}
                tabIndex={-1}
              >
                Payment saved successfully
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {completedPayment.paymentCount > 1
                  ? `${completedPayment.paymentCount} bills were paid from oldest to newest.`
                  : "The transaction is in the payment ledger and the billing balance has been updated."}
              </p>

              <dl className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-sm font-semibold text-emerald-800">
                    {completedPayment.paymentCount > 1 ? "Transactions" : "Transaction"}
                  </dt>
                  <dd className="font-mono text-sm font-bold text-emerald-950">
                    {completedPayment.paymentCount > 1
                      ? completedPayment.paymentCount
                      : `#${completedPayment.id}`}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-sm font-semibold text-emerald-800">Resident</dt>
                  <dd className="text-right text-sm font-bold text-emerald-950">
                    {completedPayment.consumerName}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-sm font-semibold text-emerald-800">Amount received</dt>
                  <dd className="font-mono text-lg font-extrabold text-emerald-950">
                    {currency(completedPayment.amountPaid)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {(completedPayment.paymentCount ?? 1) <= 1 && (
                  <button
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-water-600 px-4 font-bold text-white hover:bg-water-700"
                    onClick={() => onViewReceipt?.(completedPayment)}
                    type="button"
                  >
                    <FileText aria-hidden="true" className="h-4 w-4" />
                    View receipt
                  </button>
                )}
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-bold text-navy-900 hover:bg-slate-50"
                  onClick={recordAnother}
                  type="button"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Record another
                </button>
              </div>
              <button
                className="mt-3 min-h-11 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={onClose}
                type="button"
              >
                Return to payment history
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="sticky top-0 z-10 mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-card sm:mx-6"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <PaymentForm
                key={`${effectiveInitialBilling?.id ?? "new"}-${formVersion}`}
                billingRecords={billingRecords}
                initialData={initialData}
                onCancel={onClose}
                onSubmit={onSubmit}
                onSuccess={setCompletedPayment}
              />
            </>
          )}
    </Modal>
  );
}
