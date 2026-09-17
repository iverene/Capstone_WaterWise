import { AlertCircle, CheckCircle2, Clock3, ReceiptText } from "lucide-react";
import Table from "./Table";

function getStatusConfig(status) {
  if (status === "Paid") {
    return {
      Icon: CheckCircle2,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (status === "Partially Paid") {
    return {
      Icon: Clock3,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  if (status === "Overdue") {
    return {
      Icon: AlertCircle,
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  return {
    Icon: AlertCircle,
    className: "border-red-200 bg-red-50 text-red-700",
  };
}

function MobileBillCard({ onViewReceipt, row, showConsumerDetails }) {
  const { Icon: StatusIcon, className: statusClassName } = getStatusConfig(row.status);
  const title = showConsumerDetails ? (row.consumerName ?? "Unknown consumer") : row.billingPeriod;
  const subtitle = showConsumerDetails ? row.billingPeriod : `${row.cubicMetersConsumed} m³`;
  const statusLabel = row.status === "Overdue" && Number(row.overdueDays) > 0
    ? `Overdue ${row.overdueDays}d`
    : row.status;
  const Wrapper = onViewReceipt ? "button" : "div";

  return (
    <Wrapper
      aria-label={onViewReceipt ? `View receipt for ${title}` : undefined}
      className={`flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-card ${onViewReceipt ? "cursor-pointer transition-colors active:bg-slate-50" : ""}`}
      onClick={onViewReceipt ? () => onViewReceipt(row) : undefined}
      type={onViewReceipt ? "button" : undefined}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-navy-900">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{subtitle}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="font-mono text-sm font-extrabold tabular-nums text-navy-900">
          ₱{Number(row.amountDue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClassName}`}
          data-status={row.status}
        >
          <StatusIcon aria-hidden="true" className="h-3 w-3" />
          {statusLabel}
        </span>
      </span>
    </Wrapper>
  );
}

export default function BillingHistoryTable({
  emptyDescription = "There are no billing records yet.",
  emptyTitle = "No billing records",
  highlightedBillingId,
  historyData = [],
  onViewReceipt,
  showConsumerDetails = true,
}) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {historyData.length === 0 ? (
          <li className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center" data-testid="billing-history-empty-state">
            <p className="font-bold text-navy-900">{emptyTitle}</p>
            <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
          </li>
        ) : (
          historyData.map((row) => (
            <li key={row.invoiceNumber ?? row.id}>
              <MobileBillCard
                onViewReceipt={onViewReceipt}
                row={row}
                showConsumerDetails={showConsumerDetails}
              />
            </li>
          ))
        )}
      </ul>
      <div className="hidden md:block">
      <Table
      ariaLabel="Billing history"
      columns={[
        ...(showConsumerDetails
          ? [
              { key: "consumer", label: "Consumer Name" },
              { key: "purok", label: "Purok" },
            ]
          : []),
        { key: "invoice", label: "Invoice" },
        { key: "period", label: "Billing Period" },
        { key: "date", label: "Reading Date", className: "text-center" },
        { key: "consumption", label: "Consumption", className: "text-center" },
        { key: "amount", label: "Total Bill", className: "text-right" },
        { key: "status", label: "Status", className: "text-center" },
        { key: "balance", label: "Balance", className: "text-right" },
      ]}
      data={historyData}
      emptyDescription={emptyDescription}
      emptyTestId="billing-history-empty-state"
      emptyTitle={emptyTitle}
      getRowKey={(row) => row.invoiceNumber}
      rowClassName={(row) => `grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-navy-900 transition-colors md:table-row md:p-0 ${
        Number(row.id) === Number(highlightedBillingId)
          ? "bg-water-50"
          : "hover:bg-slate-50"
      }`}
      tableClassName={`block w-full text-left text-sm md:table ${
        showConsumerDetails ? "md:min-w-[1020px]" : onViewReceipt ? "md:min-w-[880px]" : "md:min-w-[760px]"
      }`}
      testId="billing-history-table"
      renderRow={(row) => {
        const { Icon: StatusIcon, className: statusClassName } = getStatusConfig(row.status);
        const statusLabel = row.status === "Overdue" && Number(row.overdueDays) > 0
          ? `Overdue ${row.overdueDays}d`
          : row.status;

        return (
          <>
            {showConsumerDetails && (
              <td
                className="col-span-2 flex flex-col border-b border-slate-100 pb-3 font-extrabold md:col-span-1 md:table-cell md:border-0 md:px-4 md:py-4 md:text-sm"
                data-testid="row-consumer-name"
              >
                {row.consumerName ?? "Unknown consumer"}
              </td>
            )}
            {showConsumerDetails && (
              <td
                className="flex flex-col gap-1 text-slate-600 md:table-cell md:px-4 md:py-4"
                data-testid="row-purok"
              >
                {row.purok ?? "Unassigned"}
              </td>
            )}
            <td className="flex flex-col gap-1 font-mono text-xs font-bold text-water-700 md:table-cell md:px-4 md:py-4">
              {row.invoiceNumber}
            </td>
            <td
              className="col-span-2 flex items-center justify-between border-b border-slate-100 pb-3 text-sm font-extrabold md:col-span-1 md:table-cell md:border-0 md:px-4 md:py-4 md:text-sm"
              data-testid="row-month"
            >
              {row.billingPeriod}
            </td>
            <td
              className="flex flex-col gap-1 font-mono text-slate-600 md:table-cell md:px-4 md:py-4 md:text-center"
              data-testid="row-reading-date"
            >
              {row.readingDate}
            </td>
            <td
              className="flex flex-col gap-1 font-mono md:table-cell md:px-4 md:py-4 md:text-center"
              data-testid="row-consumption"
            >
              {row.cubicMetersConsumed} m³
            </td>
            <td
              className="flex flex-col gap-1 font-mono font-bold tabular-nums md:table-cell md:px-4 md:py-4 md:text-right"
              data-testid="row-amount-due"
            >
              ₱{Number(row.amountDue ?? 0).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </td>
            <td className="flex flex-col items-start gap-1 md:table-cell md:items-center md:px-4 md:py-4 md:text-center md:col-span-1">
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${statusClassName}`}
                data-status={row.status}
                data-testid="row-status"
              >
                <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {statusLabel}
              </span>
            </td>
            <td className="hidden font-mono font-bold tabular-nums text-slate-700 md:table-cell md:px-4 md:py-4 md:text-right">
              ₱{Number(row.outstandingBalance ?? row.amountDue ?? 0).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </td>
            {onViewReceipt && (
              <td className="col-span-2 flex items-center justify-end md:col-span-1 md:table-cell md:px-4 md:py-4 md:text-right">
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-water-700 hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 md:w-auto"
                  onClick={() => onViewReceipt(row)}
                  type="button"
                >
                  <ReceiptText aria-hidden="true" className="h-4 w-4" />
                  View receipt
                </button>
              </td>
            )}
          </>
        );
      }}
      />
      </div>
    </>
  );
}
