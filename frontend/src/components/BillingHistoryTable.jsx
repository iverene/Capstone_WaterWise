import { AlertCircle, CheckCircle2, Clock3, Eye } from "lucide-react";
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

function MobileBillCard({ canViewReceipt, onViewReceipt, row, showConsumerDetails }) {
  const receiptAvailable = onViewReceipt && (canViewReceipt ? canViewReceipt(row) : true);
  const { Icon: StatusIcon, className: statusClassName } = getStatusConfig(row.status);
  const title = showConsumerDetails ? (row.consumerName ?? "Unknown consumer") : row.billingPeriod;
  const subtitle = showConsumerDetails ? row.billingPeriod : `${row.cubicMetersConsumed} m³`;
  const statusLabel = row.status === "Overdue" && Number(row.overdueDays) > 0
    ? `Overdue ${row.overdueDays}d`
    : row.status;
  const Wrapper = receiptAvailable ? "button" : "div";

  return (
    <Wrapper
      aria-label={receiptAvailable ? `View receipt for ${title}` : undefined}
      className={`flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-card ${receiptAvailable ? "cursor-pointer transition-colors active:bg-slate-50" : ""}`}
      onClick={receiptAvailable ? () => onViewReceipt(row) : undefined}
      type={receiptAvailable ? "button" : undefined}
    >
      <span className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-3">
        {showConsumerDetails ? (
          <>
            <span className="col-span-2 min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Resident</span>
              <span className="block truncate text-sm font-extrabold text-navy-900">{title}</span>
            </span>
            <span className="min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Purok</span>
              <span className="block truncate text-xs font-semibold text-slate-700">{row.purok ?? "Unassigned"}</span>
            </span>
            <span className="min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Billing period</span>
              <span className="block truncate text-xs font-semibold text-slate-700">{subtitle}</span>
            </span>
          </>
        ) : (
          <>
            <span className="col-span-2 min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Billing period</span>
              <span className="block truncate text-sm font-extrabold text-navy-900">{title}</span>
            </span>
          </>
        )}
        {!showConsumerDetails && (
          <span className="col-span-2 grid grid-cols-2 items-center gap-x-3 gap-y-3">
            <span className="min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Consumption</span>
              <span className="block font-mono text-xs font-semibold text-slate-700">{row.cubicMetersConsumed} m³</span>
            </span>
            <span className="min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Total bill</span>
              <span className="block truncate font-mono text-xs font-extrabold tabular-nums text-navy-900">{"\u20B1"}{Number(row.amountDue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </span>
            <span className="min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Status</span>
              <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClassName}`} data-status={row.status}>
                <StatusIcon aria-hidden="true" className="h-3 w-3" />
                {statusLabel}
              </span>
            </span>
            {receiptAvailable && (
              <span className="min-w-0">
                <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Receipt</span>
                <Eye aria-hidden="true" className="h-4 w-4 text-slate-500" />
              </span>
            )}
          </span>
        )}
        {showConsumerDetails && (
          <>
            <span className="min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Total bill</span>
              <span className="block truncate font-mono text-xs font-extrabold tabular-nums text-navy-900">{"\u20B1"}{Number(row.amountDue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </span>
            <span className="min-w-0">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Due date</span>
              <span className="block truncate font-mono text-xs font-semibold text-slate-700">{row.dueDate || "Not available"}</span>
            </span>
          </>
        )}
        {showConsumerDetails && <span className="min-w-0">
          <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Status</span>
          <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClassName}`} data-status={row.status}>
            <StatusIcon aria-hidden="true" className="h-3 w-3" />
            {statusLabel}
          </span>
        </span>}
        {showConsumerDetails && (
          <span className="min-w-0">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Balance</span>
            <span className="block truncate font-mono text-xs font-semibold tabular-nums text-slate-700">{"\u20B1"}{Number(row.outstandingBalance ?? row.amountDue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </span>
        )}
        {showConsumerDetails && receiptAvailable && (
          <span className="col-start-2 min-w-0">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400">Receipt</span>
            <Eye aria-hidden="true" className="h-4 w-4 text-slate-500" />
          </span>
        )}
      </span>
    </Wrapper>
  );
}

export default function BillingHistoryTable({
  canViewReceipt,
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
                canViewReceipt={canViewReceipt}
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
        ...(onViewReceipt ? [{ key: "receipt", label: "Receipt", className: "text-center" }] : []),
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
        const receiptAvailable = onViewReceipt && (canViewReceipt ? canViewReceipt(row) : true);
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
              {"\u20B1"}{Number(row.amountDue ?? 0).toLocaleString("en-US", {
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
              {"\u20B1"}{Number(row.outstandingBalance ?? row.amountDue ?? 0).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </td>
            {receiptAvailable && (
              <td className="col-span-2 flex items-center justify-center md:col-span-1 md:table-cell md:px-4 md:py-4 md:text-center">
                <button
                  aria-label={`View receipt for ${row.billingPeriod}`}
                  className="inline-flex min-h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                  onClick={() => onViewReceipt(row)}
                  type="button"
                >
                  <Eye aria-hidden="true" className="h-4 w-4" />
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
