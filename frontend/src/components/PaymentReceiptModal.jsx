import { CheckCircle2, Clock3, ReceiptText } from "lucide-react";
import { FiDownload, FiPrinter } from "react-icons/fi";
import { downloadReceiptImage } from "../utils/downloadReceiptImage";
import Modal from "./Modal";
import { useToast } from "./Toast";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function ReceiptLine({ label, testId, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 sm:gap-4 sm:py-3 last:border-0">
      <dt className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</dt>
      <dd
        className="max-w-[60%] text-right font-mono text-xs font-bold tabular-nums text-navy-900 sm:text-sm"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

export default function PaymentReceiptModal({ isOpen, receiptData, onClose, onViewConsumptionReceipt }) {
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
  const isCash = paymentMethod === "Cash";
  const paid = paymentStatus === "Paid";
  const StatusIcon = paid ? CheckCircle2 : Clock3;
  const transactionNumber = receiptData.id ? `PAY-${receiptData.id}` : "Not available";

  const handleDownload = () => {
    const lines = [
      ["Date", receiptData.paymentDate ?? "Not available"],
      ["Invoice", receiptData.invoiceNumber ?? "Not available"],
      ["Transaction Number", transactionNumber],
      ["Name", receiptData.name ?? receiptData.consumerName ?? "Not available"],
      ["Amount", currency(amountPaid)],
      ...(isCash
        ? [
            ["Cash Received", currency(amountTendered)],
            ["Change", currency(changeGiven)],
          ]
        : []),
      ["Status", paymentStatus],
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
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6"
      closeButtonProps={{
        "data-testid": "close-modal-btn",
        className: "!h-9 !w-9 rounded-lg sm:!h-11 sm:!w-11 sm:rounded-xl [&_svg]:!h-4 [&_svg]:!w-4 sm:[&_svg]:!h-5 sm:[&_svg]:!w-5",
      }}
      closeLabel="Close payment receipt"
      description={<span className="font-mono text-xs font-semibold">{transactionNumber}</span>}
      eyebrow="Sucol Water System"
      headerActions={
        <>
            <button
              aria-label="Download payment receipt"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 sm:h-11 sm:w-11 sm:rounded-xl"
              data-testid="download-receipt-image"
              onClick={handleDownload}
              type="button"
            >
              <FiDownload aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <button
              aria-label="Print payment receipt"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 sm:h-11 sm:w-11 sm:rounded-xl"
              onClick={handlePrint}
              type="button"
            >
              <FiPrinter aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
        </>
      }
      headerActionsProps={{ "data-document-actions": true }}
      headerClassName="px-3 py-3 sm:px-6 sm:py-4 [&_h2]:text-lg sm:[&_h2]:text-2xl"
      headerProps={{ "data-document-header": true }}
      isOpen={isOpen}
      onClose={onClose}
      overlayProps={{ "data-print-document-overlay": true, "data-testid": "receipt-modal-overlay" }}
      panelProps={{ className: "!max-h-[90dvh] !max-w-[22rem] sm:!max-h-[94dvh] sm:!max-w-2xl", "data-printable-document": true, "data-testid": "receipt-modal-content" }}
      size="md"
      title="Payment Receipt"
    >
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">Date</p>
              <p className="mt-1 text-xs font-bold text-navy-900 sm:text-sm">
                {receiptData.paymentDate ?? "Not available"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500">Invoice</p>
              <p
                className="mt-1 font-mono text-xs font-bold tabular-nums text-navy-900 sm:text-sm"
                data-testid="receipt-invoice"
              >
                {receiptData.invoiceNumber ?? "Not available"}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-500 sm:mt-3">Transaction Number</p>
              <p className="mt-1 font-mono text-xs font-bold tabular-nums text-navy-900 sm:text-sm">
                {transactionNumber}
              </p>
            </div>
          </div>

          <div className="mt-3 sm:mt-4">
            <p className="text-xs font-semibold text-slate-500">Name</p>
            <p
              className="mt-1 text-xs font-bold text-navy-900 sm:text-sm"
              data-testid="receipt-name"
            >
              {receiptData.name ?? receiptData.consumerName ?? "Not available"}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4 sm:gap-4">
            <p className="text-xs font-semibold text-slate-500">Amount</p>
            <p
              className="font-mono text-lg font-extrabold tabular-nums text-navy-900 sm:text-xl"
              data-testid="receipt-total-payable"
            >
              {currency(amountPaid)}
            </p>
          </div>

          <hr className="my-4 border-slate-200 sm:my-5" />

          <dl>
            {isCash && (
              <>
                <ReceiptLine label="Cash Received" value={currency(amountTendered)} />
                <ReceiptLine label="Change" value={currency(changeGiven)} />
              </>
            )}
            <div className="flex items-start justify-between gap-3 py-2 sm:gap-4 sm:py-3">
              <dt className="text-xs font-semibold text-slate-500 sm:text-sm">Status</dt>
              <dd>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold sm:px-3 sm:py-1 sm:text-xs ${
                    paid
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <StatusIcon aria-hidden="true" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {paymentStatus}
                </span>
              </dd>
            </div>
          </dl>

          {onViewConsumptionReceipt && (
            <button
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-water-700 hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 sm:mt-5 sm:min-h-11 sm:px-4 sm:text-sm"
              onClick={onViewConsumptionReceipt}
              type="button"
            >
              <ReceiptText aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              View consumption receipt
            </button>
          )}

          <p
            className="mt-4 text-center text-[11px] font-medium text-slate-400 sm:mt-5 sm:text-xs"
            data-document-footer
          >
            Payment recorded by WaterWise · Keep this receipt for your records
          </p>
    </Modal>
  );
}
