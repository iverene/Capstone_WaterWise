import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import BillingHistoryTable from "../components/BillingHistoryTable";
import ConsumptionReceiptModal from "../components/ConsumptionReceiptModal";
import CurrentBillingCard from "../components/CurrentBillingCard";
import Dropdown from "../components/Dropdown";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { fetchBillingLedger } from "../services/consumerPortal.service";
import { isCanceledRequest } from "../services/apiClient";

const formatReceiptDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: String(value).includes("T") ? "short" : undefined,
    timeZone: String(value).includes("T") ? "Asia/Manila" : "UTC",
  }).format(date);
};

const consumptionReceipt = (bill, consumerName, billings) => {
  if (!bill) return null;
  const readingTime = Date.parse(`${bill.readingDate}T00:00:00Z`);
  const arrears = billings.reduce((totals, record) => {
    const balance = Number(record.remainingBalance ?? 0);
    if (record.id === bill.id || record.status === "Paid" || balance <= 0 || !record.dueDate) {
      return totals;
    }
    const overdueDays = Math.floor(
      (readingTime - Date.parse(`${record.dueDate}T00:00:00Z`)) / 86_400_000,
    );
    if (overdueDays >= 90) totals.arrears90Days += balance;
    else if (overdueDays >= 60) totals.arrears60Days += balance;
    else if (overdueDays >= 30) totals.arrears30Days += balance;
    return totals;
  }, { arrears30Days: 0, arrears60Days: 0, arrears90Days: 0 });

  return {
    meterName: consumerName,
    runDate: formatReceiptDate(bill.createdAt ?? bill.readingDate),
    previousReading: bill.previousReading,
    presentReading: bill.currentReading,
    baselineBill: bill.amountDue,
    ...arrears,
  };
};

export default function BillingLedger({
  historyData: historyDataProp,
  ledgerAccount: ledgerAccountProp,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const usesApi = historyDataProp === undefined;
  const [ledger, setLedger] = useState(null);
  const [isLoading, setIsLoading] = useState(usesApi);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const retry = useCallback(() => {
    setError("");
    setLedger(null);
    setIsLoading(true);
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!usesApi) return undefined;

    const controller = new AbortController();
    fetchBillingLedger({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setLedger(data);
          setIsLoading(false);
        }
      })
      .catch((requestError) => {
        if (!isCanceledRequest(requestError) && !controller.signal.aborted) {
          setError(requestError.message);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [usesApi, requestVersion]);

  const historyData = usesApi ? ledger?.historyData ?? [] : historyDataProp;
  const ledgerAccount = usesApi ? ledger?.ledgerAccount : ledgerAccountProp;
  const requestedBillingId = Number(searchParams.get("billingId"));
  const requestedView = searchParams.get("view");
  const selectedBill = historyData.find((record) => record.id === requestedBillingId);
  const periodOptions = [...new Set(historyData.map((record) => record.billingPeriod))];
  const hasActiveFilters = periodFilter !== "all" || statusFilter !== "all";
  const filteredHistoryData = historyData.filter((record) =>
    (periodFilter === "all" || record.billingPeriod === periodFilter) &&
    (statusFilter === "all" || record.status === statusFilter),
  );
  const displayedHistoryData = selectedBill && filteredHistoryData.includes(selectedBill)
    ? [selectedBill, ...filteredHistoryData.filter((record) => record.id !== selectedBill.id)]
    : filteredHistoryData;
  const selectedConsumptionReceipt = consumptionReceipt(
    selectedBill,
    ledgerAccount?.name,
    historyData,
  );
  const pageHeader = <PageHeader title="Bills" />;

  useEffect(() => {
    if (!ledger || !requestedBillingId || requestedView) return;
    document.getElementById("consumer-billing-history")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [ledger, requestedBillingId, requestedView]);

  const closeRelatedModal = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("view");
    nextParams.delete("paymentId");
    setSearchParams(nextParams, { replace: true });
  };

  const openReceipt = (bill) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("billingId", String(bill.id));
    nextParams.delete("paymentId");
    nextParams.set("view", "consumption-receipt");
    setSearchParams(nextParams);
  };

  if (error) {
    return (
      <div className="space-y-5">
        {pageHeader}
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{error}</span>
          {usesApi && (
            <button className="min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800" onClick={retry} type="button">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  // Loading vs empty are distinct: a loaded ledger with no account row is an
  // empty state, not an infinite skeleton.
  if (usesApi ? isLoading : !ledgerAccount) {
    return (
      <div className="space-y-5">
        {pageHeader}
        <LoadingSkeleton label="Loading billing ledger" variant="billing" />
      </div>
    );
  }

  if (!ledgerAccount) {
    return (
      <div className="space-y-5">
        {pageHeader}
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center" role="status">
          <p className="text-sm font-bold text-navy-900">No billing records found</p>
          <p className="mt-1 text-sm text-slate-500">Your billing history will appear here once available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {pageHeader}

      <CurrentBillingCard
        dueDate={ledgerAccount.dueDate}
        outstandingBalance={ledgerAccount.outstandingBalance}
      />

      <section className="space-y-4" id="consumer-billing-history">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h3 className="pl-4 text-xl font-extrabold tracking-[-0.02em] text-navy-900">
              History
            </h3>
          </div>
          <div aria-label="Bill filters" className="grid grid-cols-2 gap-2 sm:hidden">
            <Dropdown
              ariaLabel="Filter bills by billing period"
              className="min-w-0"
              compact
              name="billing-period-filter-mobile"
              onValueChange={setPeriodFilter}
              options={[
                { label: "All billing periods", value: "all" },
                ...periodOptions.map((period) => ({ label: period, value: period })),
              ]}
              value={periodFilter}
            />
            <Dropdown
              ariaLabel="Filter bills by status"
              className="min-w-0"
              compact
              name="billing-status-filter-mobile"
              onValueChange={setStatusFilter}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Paid", value: "Paid" },
                { label: "Partially paid", value: "Partially Paid" },
                { label: "Unpaid", value: "Unpaid" },
                { label: "Overdue", value: "Overdue" },
              ]}
              value={statusFilter}
            />
          </div>
          <Filter
            ariaLabel="Filter billing history"
            className="hidden shrink-0 sm:block"
            description="Choose a billing period or payment status to narrow your bill history."
            filters={[
              {
                ariaLabel: "Filter bills by billing period",
                className: "w-52",
                id: "billing-period-filter",
                label: "Billing period",
                onValueChange: setPeriodFilter,
                options: [
                  { label: "All billing periods", value: "all" },
                  ...periodOptions.map((period) => ({ label: period, value: period })),
                ],
                value: periodFilter,
              },
              {
                ariaLabel: "Filter bills by status",
                className: "w-48",
                id: "billing-status-filter",
                label: "Status",
                onValueChange: setStatusFilter,
                options: [
                  { label: "All statuses", value: "all" },
                  { label: "Paid", value: "Paid" },
                  { label: "Partially paid", value: "Partially Paid" },
                  { label: "Unpaid", value: "Unpaid" },
                  { label: "Overdue", value: "Overdue" },
                ],
                value: statusFilter,
              },
            ]}
            title="Bill Filters"
          />
        </div>

        <BillingHistoryTable
          emptyDescription={hasActiveFilters ? "Adjust or clear the billing period and status filters to see other records." : "Your billing records will appear here after a meter reading is recorded."}
          emptyTitle={hasActiveFilters ? "No bills match these filters" : "No billing records"}
          historyData={displayedHistoryData}
          highlightedBillingId={requestedBillingId}
          onViewReceipt={openReceipt}
          showConsumerDetails={false}
        />
      </section>

      <ConsumptionReceiptModal
        isOpen={requestedView === "consumption-receipt" && Boolean(selectedConsumptionReceipt)}
        onClose={closeRelatedModal}
        receiptData={selectedConsumptionReceipt}
        residentName={ledgerAccount.name}
      />
    </div>
  );
}
