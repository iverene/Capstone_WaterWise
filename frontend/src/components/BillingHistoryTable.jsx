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

  return {
    Icon: AlertCircle,
    className: "border-red-200 bg-red-50 text-red-700",
  };
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
        { key: "date", label: "Reading Date" },
        { key: "consumption", label: "Consumption" },
        { key: "amount", label: "Total Bill", className: "text-right" },
        { key: "status", label: "Status" },
        { key: "balance", label: "Balance", className: "text-right" },
      ]}
      data={historyData}
      emptyDescription={emptyDescription}
      emptyTestId="billing-history-empty-state"
      emptyTitle={emptyTitle}
      getRowKey={(row) => row.invoiceNumber}
      rowClassName={(row) => `grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-navy-900 transition-colors md:table-row md:p-0 ${
        Number(row.id) === Number(highlightedBillingId)
          ? "bg-water-50 ring-2 ring-inset ring-water-500"
          : "hover:bg-slate-50"
      }`}
      tableClassName={`block w-full text-left text-sm md:table ${
        showConsumerDetails ? "md:min-w-[1020px]" : onViewReceipt ? "md:min-w-[880px]" : "md:min-w-[760px]"
      }`}
      testId="billing-history-table"
      renderRow={(row) => {
        const { Icon: StatusIcon, className: statusClassName } = getStatusConfig(row.status);

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
              className="flex flex-col gap-1 font-mono text-slate-600 md:table-cell md:px-4 md:py-4"
              data-testid="row-reading-date"
            >
              {row.readingDate}
            </td>
            <td
              className="flex flex-col gap-1 font-mono md:table-cell md:px-4 md:py-4"
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
            <td className="flex flex-col gap-1 md:table-cell md:px-4 md:py-4 md:col-span-1">
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${statusClassName}`}
                data-status={row.status}
                data-testid="row-status"
              >
                <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {row.status}
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
  );
}
