import { CheckCircle2, Clock3 } from "lucide-react";
import { FiDownload, FiPrinter } from "react-icons/fi";
import { downloadReceiptImage } from "../utils/downloadReceiptImage";
import Modal from "./Modal";
import { useToast } from "./Toast";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function ReceiptLine({ label, testId, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-sm font-semibold text-slate-500">{label}</dt>
      <dd
        className="max-w-[60%] text-right font-mono text-sm font-bold tabular-nums text-navy-900"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

export default function PaymentReceiptModal({ isOpen, receiptData, onClose }) {
  const toast = useToast();
  if (!isOpen || !receiptData) return null;

  const amountPaid = Number(receiptData.amountPaid ?? receiptData.amountDue ?? 0);
  const amountTendered = Number(receiptData.amountTendered ?? amountPaid);
  const changeGiven = Number(
    receiptData.changeGiven ?? Math.max(amountTendered - amountPaid, 0),
  );
  const remainingBalance = Number(receiptData.balanceAfterPayment ?? receiptData.remainingBalance ?? 0);
  const paymentMethod = receiptData.paymentMethod ?? "Cash";
  const paymentStatus = receiptData.statusAfterPayment
    ?? receiptData.paymentStatus
    ?? (remainingBalance === 0 ? "Paid" : "Partially Paid");
  const currentBillStatus = receiptData.currentBillStatus ?? paymentStatus;
  const currentBillRemainingBalance = Number(
    receiptData.currentBillRemainingBalance ?? remainingBalance,
  );
  const billStatusChanged = currentBillStatus !== paymentStatus
    || currentBillRemainingBalance !== remainingBalance;
  const isCash = paymentMethod === "Cash";
  const paid = paymentStatus === "Paid";
  const StatusIcon = paid ? CheckCircle2 : Clock3;
  const transactionNumber = receiptData.id ? `PAY-${receiptData.id}` : "Not available";

  const handleDownload = () => {
    const lines = [
      ["Transaction Number", transactionNumber],
      ["Invoice Number", receiptData.invoiceNumber ?? "Not available"],
      ["Resident", receiptData.name ?? receiptData.consumerName ?? "Not available"],
      ["Payment Date", receiptData.paymentDate ?? "Not available"],
      ["Payment Method", paymentMethod],
      ...(receiptData.referenceNumber
        ? [["Reference Number", receiptData.referenceNumber]]
        : []),
      ...(isCash
        ? [
            ["Cash Received", currency(amountTendered)],
            ["Change Given", currency(changeGiven)],
          ]
        : []),
      ["Balance After Payment", currency(remainingBalance)],
      ["Status After Payment", paymentStatus],
      ["Current Bill Balance", currency(currentBillRemainingBalance)],
      ["Current Bill Status", currentBillStatus],
      ["Amount Paid", currency(amountPaid)],
    ];

    downloadReceiptImage({
      filename: `${transactionNumber.toLowerCase()}-payment-receipt.png`,
      title: "Payment Receipt",
      lines,
    });
    toast.success("Receipt downloaded", `${transactionNumber.toLowerCase()}-payment-receipt.png was saved.`);
  };

  const handlePrint = () => {
    window.print();
    toast.info("Print dialog opened", "Choose a printer or save the payment receipt as a PDF.");
  };

  return (
    <Modal
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
      closeButtonProps={{ "data-testid": "close-modal-btn" }}
      closeLabel="Close payment receipt"
      description={<span className="font-mono text-xs font-semibold">{transactionNumber}</span>}
      eyebrow="Sucol Water System"
      headerActions={
        <>
            <button
              aria-label="Download payment receipt"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              data-testid="download-receipt-image"
              onClick={handleDownload}
              type="button"
            >
              <FiDownload aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              aria-label="Print payment receipt"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              onClick={handlePrint}
              type="button"
            >
              <FiPrinter aria-hidden="true" className="h-4 w-4" />
            </button>
        </>
      }
      headerActionsProps={{ "data-document-actions": true }}
      headerProps={{ "data-document-header": true }}
      isOpen={isOpen}
      onClose={onClose}
      overlayProps={{ "data-print-document-overlay": true, "data-testid": "receipt-modal-overlay" }}
      panelProps={{ "data-printable-document": true, "data-testid": "receipt-modal-content" }}
      size="md"
      title="Payment receipt"
    >
          <section className="rounded-2xl bg-navy-950 p-5 text-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-200">
                  Amount paid
                </p>
                <p
                  className="mt-2 font-mono text-3xl font-extrabold tabular-nums text-white"
                  data-testid="receipt-total-payable"
                >
                  {currency(amountPaid)}
                </p>
              </div>
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  paid
                    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                    : "border-amber-400/40 bg-amber-400/15 text-amber-200"
                }`}
              >
                <StatusIcon aria-hidden="true" className="h-4 w-4" />
                {paymentStatus} after payment
              </span>
            </div>
          </section>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <section aria-labelledby="receipt-account-heading">
              <h3
                className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
                id="receipt-account-heading"
              >
                Account
              </h3>
              <dl className="mt-2">
                <ReceiptLine
                  label="Resident"
                  testId="receipt-name"
                  value={receiptData.name ?? receiptData.consumerName ?? "Not available"}
                />
                <ReceiptLine
                  label="Invoice"
                  testId="receipt-invoice"
                  value={receiptData.invoiceNumber ?? "Not available"}
                />
                <ReceiptLine label="Transaction" value={transactionNumber} />
              </dl>
            </section>

            <section aria-labelledby="receipt-payment-heading">
              <h3
                className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
                id="receipt-payment-heading"
              >
                Payment
              </h3>
              <dl className="mt-2">
                <ReceiptLine label="Date" value={receiptData.paymentDate ?? "Not available"} />
                <ReceiptLine label="Method" value={paymentMethod} />
                {receiptData.referenceNumber && (
                  <ReceiptLine label="Reference" value={receiptData.referenceNumber} />
                )}
              </dl>
            </section>
          </div>

          {isCash && (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Cash breakdown
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Cash received</p>
                  <p className="mt-1 font-mono text-lg font-extrabold tabular-nums text-navy-900">
                    {currency(amountTendered)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Applied to bill</p>
                  <p className="mt-1 font-mono text-lg font-extrabold tabular-nums text-navy-900">
                    {currency(amountPaid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Change</p>
                  <p className="mt-1 font-mono text-lg font-extrabold tabular-nums text-emerald-700">
                    {currency(changeGiven)}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="mt-5 rounded-2xl border border-slate-200 p-4" aria-labelledby="receipt-balance-heading">
            <h3 className="text-sm font-bold text-navy-900" id="receipt-balance-heading">Bill balance and status</h3>
            <dl className="mt-2">
              <ReceiptLine label="Balance after this payment" value={currency(remainingBalance)} />
              <ReceiptLine label="Status after this payment" value={paymentStatus} />
              {billStatusChanged && (
                <>
                  <ReceiptLine label="Current bill balance" value={currency(currentBillRemainingBalance)} />
                  <ReceiptLine label="Current bill status" value={currentBillStatus} />
                </>
              )}
            </dl>
            {billStatusChanged && (
              <p className="mt-3 rounded-xl bg-water-50 p-3 text-xs leading-5 text-water-800">
                This bill changed after this payment was recorded. The values above preserve the transaction history while the current values show the latest bill state.
              </p>
            )}
          </section>

          <p
            className="mt-5 text-center text-xs font-medium text-slate-400"
            data-document-footer
          >
            Payment recorded by WaterWise · Keep this receipt for your records
          </p>
    </Modal>
  );
}
