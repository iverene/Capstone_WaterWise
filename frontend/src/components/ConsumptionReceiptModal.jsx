import { FiDownload, FiPrinter } from "react-icons/fi";
import { ReceiptText } from "lucide-react";
import { downloadReceiptImage } from "../utils/downloadReceiptImage";
import LoadingSkeleton from "./LoadingSkeleton";
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

function ArrearsStat({ label, testId, value }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-inset ring-slate-200">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p
        className="mt-1 font-mono text-sm font-extrabold tabular-nums text-navy-900"
        data-testid={testId}
      >
        {currency(value)}
      </p>
    </div>
  );
}

export default function ConsumptionReceiptModal({ isOpen, loading = false, onClose, onViewPaymentReceipt, receiptData, residentName }) {
  const toast = useToast();
  if (!isOpen) return null;
  if (loading || !receiptData) {
    return (
      <Modal
        closeLabel="Close consumption receipt"
        description={residentName}
        dismissible={false}
        eyebrow="Sucol Water System"
        isOpen={isOpen}
        onClose={onClose}
        size="md"
        title="Consumption Receipt"
      >
        <LoadingSkeleton className="p-5 sm:p-6" label="Loading consumption receipt" variant="card" />
      </Modal>
    );
  }

  const {
    meterName,
    runDate,
    previousReading,
    presentReading,
    consumption,
    baselineBill,
    billBreakdown = null,
    arrears30Days = 0,
    arrears60Days = 0,
    arrears90Days = 0,
  } = receiptData;

  const cubicMetersUsed = Number(
    (Number(consumption ?? presentReading - previousReading) || 0).toFixed(2),
  );
  const totalArrears = arrears30Days + arrears60Days + arrears90Days;
  const finalTotalBill = baselineBill + totalArrears;

  const handleDownload = () => {
    downloadReceiptImage({
      filename: `${meterName}-consumption-receipt.png`,
      title: "Consumption Receipt",
      lines: [
        ["Meter Name", meterName],
        ["Run Date", runDate],
        ["Previous Reading", `${previousReading} m³`],
        ["Present Reading", `${presentReading} m³`],
        ["Cubic Meters Used", `${cubicMetersUsed} m³`],
        ...(Array.isArray(billBreakdown)
          ? billBreakdown.map((line) => [line.label, `₱${Number(line.amount).toFixed(2)}`])
          : []),
        ["Baseline Water Bill", `₱${baselineBill.toFixed(2)}`],
        ["Over 30 Days", `₱${arrears30Days.toFixed(2)}`],
        ["Over 60 Days", `₱${arrears60Days.toFixed(2)}`],
        ["Over 90 Days", `₱${arrears90Days.toFixed(2)}`],
        ["Total Bill Sum", `₱${finalTotalBill.toFixed(2)}`],
      ],
    });
    toast.success("Receipt downloaded", `${meterName}-consumption-receipt.png was saved.`);
  };

  const handlePrint = () => {
    window.print();
    toast.info("Print dialog opened", "Choose a printer or save the receipt as a PDF.");
  };

  return (
    <Modal
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
      closeButtonProps={{ "data-testid": "close-modal" }}
      closeLabel="Close consumption receipt"
      eyebrow="Sucol Water System"
      headerActions={
        <>
          <button
            aria-label="Download consumption receipt"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
            data-testid="download-official-receipt-image"
            onClick={handleDownload}
            type="button"
          >
            <FiDownload aria-hidden="true" className="h-4 w-4" />
          </button>
          <button aria-label="Print official receipt" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={handlePrint} type="button"><FiPrinter aria-hidden="true" className="h-4 w-4" /></button>
        </>
      }
      headerActionsProps={{ "data-document-actions": true }}
      headerProps={{ "data-document-header": true }}
      isOpen={isOpen}
      onClose={onClose}
      overlayProps={{ "data-print-document-overlay": true, "data-testid": "receipt-modal" }}
      panelProps={{ "data-printable-document": true }}
      size="md"
      title="Consumption Receipt"
    >
      <section className="rounded-2xl bg-navy-950 p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-200">
          Total bill
        </p>
        <p
          className="mt-2 font-mono text-3xl font-extrabold tabular-nums text-white"
          data-testid="receipt-final-total"
        >
          {currency(finalTotalBill)}
        </p>
        <p className="mt-2 text-sm text-slate-300">
          {cubicMetersUsed.toLocaleString("en-US")} m³ used · Baseline {currency(baselineBill)}
        </p>
      </section>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <section aria-labelledby="receipt-meter-heading">
          <h3
            className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
            id="receipt-meter-heading"
          >
            Meter
          </h3>
          <dl className="mt-2">
            <ReceiptLine label="Name" testId="receipt-meter-name" value={meterName} />
            <ReceiptLine label="Run date" testId="receipt-run-date" value={runDate} />
          </dl>
        </section>

        <section aria-labelledby="receipt-readings-heading">
          <h3
            className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
            id="receipt-readings-heading"
          >
            Readings
          </h3>
          <dl className="mt-2">
            <ReceiptLine label="Previous" testId="telemetry-prev" value={`${previousReading} m³`} />
            <ReceiptLine label="Present" testId="telemetry-pres" value={`${presentReading} m³`} />
            <ReceiptLine label="Used" testId="telemetry-used" value={`${cubicMetersUsed} m³`} />
            <ReceiptLine label="Baseline bill" testId="telemetry-baseline" value={currency(baselineBill)} />
            {Array.isArray(billBreakdown) && billBreakdown.length > 0 && (
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                {billBreakdown.map((line) => (
                  <div key={line.label} className="flex items-start justify-between gap-4 py-1">
                    <dt className="text-xs font-semibold text-slate-500">{line.label}</dt>
                    <dd className="font-mono text-xs font-bold tabular-nums text-navy-900">
                      {currency(line.amount)}
                    </dd>
                  </div>
                ))}
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="receipt-arrears-heading">
        <h3
          className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
          id="receipt-arrears-heading"
        >
          Arrears breakdown
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="arrears-matrix">
          <ArrearsStat label="Over 30 days" testId="arrears-30" value={arrears30Days} />
          <ArrearsStat label="Over 60 days" testId="arrears-60" value={arrears60Days} />
          <ArrearsStat label="Over 90 days" testId="arrears-90" value={arrears90Days} />
        </div>
      </section>

      {onViewPaymentReceipt && (
        <button
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-water-700 hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
          onClick={onViewPaymentReceipt}
          type="button"
        >
          <ReceiptText aria-hidden="true" className="h-4 w-4" />
          View payment receipt
        </button>
      )}

      <p className="mt-5 text-center text-xs font-medium text-slate-400" data-document-footer>
        System-generated receipt · Keep this copy for your records
      </p>
    </Modal>
  );
}
