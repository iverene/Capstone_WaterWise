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

function ArrearsStat({ label, testId, value }) {
  return (
    <div className="rounded-xl bg-white p-2.5 ring-1 ring-inset ring-slate-200 sm:p-3">
      <p className="text-[11px] font-semibold text-slate-500 sm:text-xs">{label}</p>
      <p
        className="mt-1 font-mono text-xs font-extrabold tabular-nums text-navy-900 sm:text-sm"
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
        bodyClassName="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6"
        closeButtonProps={{ className: "!h-9 !w-9 rounded-lg sm:!h-11 sm:!w-11 sm:rounded-xl [&_svg]:!h-4 [&_svg]:!w-4 sm:[&_svg]:!h-5 sm:[&_svg]:!w-5" }}
        closeLabel="Close consumption receipt"
        description={residentName}
        dismissible={false}
        eyebrow="Sucol Water System"
        headerClassName="px-3 py-3 sm:px-6 sm:py-4 [&_h2]:text-lg sm:[&_h2]:text-2xl"
        isOpen={isOpen}
        onClose={onClose}
        panelProps={{ className: "!max-h-[90dvh] !max-w-[22rem] sm:!max-h-[94dvh] sm:!max-w-2xl" }}
        size="md"
        title="Consumption Receipt"
      >
        <LoadingSkeleton className="p-3 sm:p-6" label="Loading consumption receipt" variant="card" />
      </Modal>
    );
  }

  const {
    meterName,
    runDate,
    previousReading,
    presentReading,
    consumption,
    readingSource = "actual",
    carriedConsumption = 0,
    meterIncidentId = null,
    newBaseline = null,
    baselineBill,
    billBreakdown = null,
    arrears30Days = 0,
    arrears60Days = 0,
    arrears90Days = 0,
  } = receiptData;
  const isIncidentReading =
    readingSource === "incident" ||
    meterIncidentId != null ||
    newBaseline != null ||
    Number(carriedConsumption) > 0;

  const cubicMetersUsed = Number((Number(consumption) || 0).toFixed(2));
  const carriedUsed = Number(carriedConsumption) || 0;
  const baselineUsed = Number(newBaseline ?? 0);
  const currentUsed = isIncidentReading
    ? Number((Number(presentReading || 0) - baselineUsed).toFixed(2))
    : Number(presentReading) || 0;
  const incidentPreviousReading = `New / ${baselineUsed}`;
  const usageLabel = isIncidentReading
    ? `Carried: ${carriedUsed} + Current: ${currentUsed} = ${cubicMetersUsed} m³`
    : `${cubicMetersUsed} m³`;
  const totalArrears = arrears30Days + arrears60Days + arrears90Days;
  const totalOverallBill = baselineBill + totalArrears;

  const handleDownload = () => {
    downloadReceiptImage({
      filename: `${meterName}-consumption-receipt.png`,
      title: "Consumption Receipt",
      lines: [
        ["Meter Name", meterName],
        ["Run Date", runDate],
        [
          isIncidentReading ? "Previous Reading" : "Previous Reading",
          isIncidentReading ? incidentPreviousReading : `${previousReading} m³`,
        ],
        [
          isIncidentReading ? "New Meter Reading" : "Present Reading",
          `${presentReading} m³`,
        ],
        ...(isIncidentReading
          ? [["New Meter Starts At", `${Number(newBaseline ?? 0)} m³`]]
          : []),
        ["Cubic Meters Used", usageLabel],
        ...(Array.isArray(billBreakdown)
          ? billBreakdown.map((line) => [line.label, `₱${Number(line.amount).toFixed(2)}`])
          : []),
        ["Current Consumption Bill", `₱${baselineBill.toFixed(2)}`],
        ["Over 30 Days", `₱${arrears30Days.toFixed(2)}`],
        ["Over 60 Days", `₱${arrears60Days.toFixed(2)}`],
        ["Over 90 Days", `₱${arrears90Days.toFixed(2)}`],
        ["Total Overall Bill", `₱${totalOverallBill.toFixed(2)}`],
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
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6"
      closeButtonProps={{ "data-testid": "close-modal" }}
      closeLabel="Close consumption receipt"
      closeButtonProps={{ className: "!h-9 !w-9 rounded-lg sm:!h-11 sm:!w-11 sm:rounded-xl [&_svg]:!h-4 [&_svg]:!w-4 sm:[&_svg]:!h-5 sm:[&_svg]:!w-5" }}
      eyebrow="Sucol Water System"
      headerActions={
        <>
          <button
            aria-label="Download consumption receipt"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 sm:h-11 sm:w-11 sm:rounded-xl"
            data-testid="download-official-receipt-image"
            onClick={handleDownload}
            type="button"
          >
            <FiDownload aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <button aria-label="Print official receipt" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 sm:h-11 sm:w-11 sm:rounded-xl" onClick={handlePrint} type="button"><FiPrinter aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
        </>
      }
      headerActionsProps={{ "data-document-actions": true }}
      headerClassName="px-3 py-3 sm:px-6 sm:py-4 [&_h2]:text-lg sm:[&_h2]:text-2xl"
      headerProps={{ "data-document-header": true }}
      isOpen={isOpen}
      onClose={onClose}
      overlayProps={{ "data-print-document-overlay": true, "data-testid": "receipt-modal" }}
      panelProps={{ className: "!max-h-[90dvh] !max-w-[22rem] sm:!max-h-[94dvh] sm:!max-w-2xl", "data-printable-document": true }}
      size="md"
      title="Consumption Receipt"
    >
      <section className="rounded-2xl bg-navy-950 p-4 text-white sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-200">
          Total bill
        </p>
        <p
          className="mt-1.5 font-mono text-2xl font-extrabold tabular-nums text-white sm:mt-2 sm:text-3xl"
          data-testid="receipt-current-bill"
        >
          {currency(baselineBill)}
        </p>
        <p className="mt-1.5 text-xs text-slate-300 sm:mt-2 sm:text-sm">
          {usageLabel} · Current consumption bill
        </p>
      </section>

      <div className="mt-4 grid gap-4 sm:mt-5 sm:grid-cols-2 sm:gap-5">
        <section aria-labelledby="receipt-meter-heading">
          <h3
            className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
            id="receipt-meter-heading"
          >
            Meter
          </h3>
          <dl className="mt-1.5 sm:mt-2">
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
          <dl className="mt-1.5 sm:mt-2">
            <ReceiptLine
              label="Previous"
              testId="telemetry-prev"
              value={isIncidentReading ? incidentPreviousReading : `${previousReading} m³`}
            />
            <ReceiptLine
              label={isIncidentReading ? "New meter reading" : "Present"}
              testId="telemetry-pres"
              value={`${presentReading} m³`}
            />
            {isIncidentReading && (
              <ReceiptLine
                label="New meter starts at"
                testId="telemetry-new-baseline"
                value={`${Number(newBaseline ?? 0)} m³`}
              />
            )}
            <ReceiptLine label="Cubic used" testId="telemetry-used" value={usageLabel} />
            <ReceiptLine label="Current consumption bill" testId="telemetry-baseline" value={currency(baselineBill)} />
            {Array.isArray(billBreakdown) && billBreakdown.length > 0 && (
              <div className="mt-2 rounded-xl bg-slate-50 p-2.5 sm:p-3">
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

      <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:mt-5 sm:p-4" aria-labelledby="receipt-arrears-heading">
        <h3
          className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
          id="receipt-arrears-heading"
        >
          Arrears breakdown
        </h3>
        <div className="mt-2 grid gap-2 sm:mt-3 sm:grid-cols-3 sm:gap-3" data-testid="arrears-matrix">
          <ArrearsStat label="Over 30 days" testId="arrears-30" value={arrears30Days} />
          <ArrearsStat label="Over 60 days" testId="arrears-60" value={arrears60Days} />
          <ArrearsStat label="Over 90 days" testId="arrears-90" value={arrears90Days} />
        </div>
      </section>

      <section aria-label="Total overall bill" className="mt-3 rounded-2xl border border-water-200 bg-water-50 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-water-800">Total overall bill</h3>
            <p className="mt-1 text-xs text-slate-600">Current consumption plus overdue balances</p>
          </div>
          <p className="font-mono text-lg font-extrabold tabular-nums text-navy-900 sm:text-xl" data-testid="receipt-final-total">
            {currency(totalOverallBill)}
          </p>
        </div>
      </section>

      {onViewPaymentReceipt && (
        <button
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-water-700 hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 sm:mt-5 sm:min-h-11 sm:px-4 sm:text-sm"
          onClick={onViewPaymentReceipt}
          type="button"
        >
          <ReceiptText aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          View payment receipt
        </button>
      )}

      <p className="mt-4 text-center text-[11px] font-medium text-slate-400 sm:mt-5 sm:text-xs" data-document-footer>
        System-generated receipt · Keep this copy for your records
      </p>
    </Modal>
  );
}
