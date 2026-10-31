import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, Clock3, ReceiptText, WalletCards } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PaymentReceiptModal from "../components/PaymentReceiptModal";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import KPI from "../components/KPI";
import PageHeader from "../components/PageHeader";
import PaymentModal from "../components/PaymentModal";
import Search from "../components/Search";
import Table from "../components/Table";
import { useToast } from "../components/Toast";
import { fetchBillingHistory } from "../services/billingAPI";
import {
  fetchPaymentHistory,
  recordWaterfallPayment,
} from "../services/paymentAPI";

function enrichPayments(paymentHistory, billings) {
  return paymentHistory.map((payment) => {
    const billing = billings.find((record) => record.id === payment.billingId);

    return {
      ...payment,
      address: billing?.address ?? "",
      amountDue: payment.amountPaid,
      consumerName: billing?.consumerName ?? payment.consumerName,
      currentReading: billing?.currentReading ?? 0,
      invoiceNumber: billing?.invoiceNumber ?? `INV-${payment.billingId}`,
      name: billing?.consumerName ?? payment.consumerName,
      previousReading: billing?.previousReading ?? 0,
      purok: billing?.purok ?? "",
    };
  });
}

export default function PaymentProcessingPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedBillingId = Number(searchParams.get("billingId"));
  // Data-change events can remount this page while a payment is in flight.
  // Keep visibility in the URL so the completing request closes the current modal too.
  const isPaymentModalOpen = Boolean(searchParams.get("billingId"));
  const [payments, setPayments] = useState([]);
  const [billingRecords, setBillingRecords] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [purokFilter, setPurokFilter] = useState("all");
  const [paymentCountFilter, setPaymentCountFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");

  const preselectedBilling = billingRecords.find(
    (record) => record.id === requestedBillingId && record.outstandingBalance > 0,
  );

  const loadPaymentData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [billings, paymentHistory] = await Promise.all([
        fetchBillingHistory(),
        fetchPaymentHistory(),
      ]);
      setBillingRecords(billings);
      setPayments(enrichPayments(paymentHistory, billings));
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError.message ??
          "Unable to load payment data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      Promise.all([fetchBillingHistory(), fetchPaymentHistory()])
        .then(([billings, paymentHistory]) => {
          if (active) {
            setBillingRecords(billings);
            setPayments(enrichPayments(paymentHistory, billings));
            setError("");
          }
        })
        .catch((requestError) => {
          if (active) {
            setError(
              requestError?.response?.data?.message ??
                requestError.message ??
                "Unable to load payment data.",
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    refresh();
    const intervalId = window.setInterval(refresh, 15000);
    const handleTargetedRefresh = (event) => {
      if (event.detail?.path === "/admin/payments") void refresh();
    };
    window.addEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    };
  }, []);

  const closePaymentModal = useCallback(() => {
    setError("");
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const recordAnotherPayment = useCallback(() => {
    setError("");
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const openPaymentModal = (billing) => {
    setError("");
    setSearchParams({ billingId: String(billing.id) }, { replace: true });
  };

  const recordPayment = async (payment) => {
    const billing = billingRecords.find((record) => record.id === payment.billingId);
    if (!billing) {
      const message = "The selected billing record is no longer available. Select it again.";
      setError(message);
      toast.warning("Billing record unavailable", message);
      return false;
    }

    try {
      setError("");
      const consumerId = Number(billing.raw?.user_id);
      if (!Number.isFinite(consumerId) || consumerId <= 0) {
        const message = "The selected resident has no valid account ID. Reload the billing list and try again.";
        setError(message);
        toast.warning("Billing record unavailable", message);
        return false;
      }
      const { payments: apiPayments, totalApplied } = await recordWaterfallPayment({
        amountTendered: Number(payment.amountTendered ?? payment.totalApplied),
        consumerId,
        idempotencyKey: payment.idempotencyKey,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        referenceNumber: payment.referenceNumber,
        totalApplied: Number(payment.totalApplied),
      });
      const savedPayments = apiPayments.map((p) => {
        const target = billingRecords.find((r) => r.id === p.billingId) ?? billing;
        return { ...p, address: target.address, amountDue: p.amountPaid, billingId: p.billingId, consumerName: target.consumerName, currentReading: target.currentReading, invoiceNumber: target.invoiceNumber, name: target.consumerName, paymentStatus: p.paymentStatus, previousReading: target.previousReading, purok: target.purok ?? "", remainingBalance: p.remainingBalance };
      });

      setPayments((current) => [
        ...savedPayments,
        ...current.filter(
          (existingPayment) =>
            !savedPayments.some((savedPayment) => existingPayment.id === savedPayment.id),
        ),
      ]);
      // Close from the page that owns the modal before refreshing billings.
      // A paid bill disappears from preselectedBilling and remounts the form.
      closePaymentModal();
      try {
        setBillingRecords(await fetchBillingHistory());
      } catch {
        toast.warning("Payment saved", "The billing list could not refresh. Reload the page to see the updated balances.");
      }
      const totalSaved = Number(totalApplied ?? 0);
      toast.success(
        "Payment recorded",
        `${billing.consumerName}'s payment of ₱${totalSaved.toLocaleString("en-PH", { minimumFractionDigits: 2 })} was saved.`,
      );
      return { ...savedPayments[0], amountPaid: totalApplied, paymentCount: savedPayments.length, payments: savedPayments };
    } catch (requestError) {
      const message = requestError?.response?.data?.message ?? requestError.message ?? "Unable to record payment.";
      setError(message);
      toast.error("Payment not recorded", message);
      return false;
    }
  };

  const purokOptions = useMemo(() => [...new Set(
    billingRecords.map((billing) => String(billing.purok ?? "").trim()).filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })), [billingRecords]);
  const purokPayments = purokFilter === "all"
    ? payments
    : payments.filter((payment) => payment.purok === purokFilter);
  const totalCollected = purokPayments.reduce(
    (sum, payment) => sum + Number(payment.amountPaid || 0),
    0,
  );
  const fullyPaid = purokPayments.filter((payment) => payment.paymentStatus === "Paid").length;
  const purokBillings = purokFilter === "all"
    ? billingRecords
    : billingRecords.filter((billing) => billing.purok === purokFilter);
  const unpaidBillings = purokBillings
    .filter((billing) => Number(billing.outstandingBalance) > 0)
    .sort((first, second) => {
      const dateComparison = String(first.raw?.billing_date ?? "").localeCompare(
        String(second.raw?.billing_date ?? ""),
      );
      return dateComparison || Number(first.id) - Number(second.id);
    });
  const unpaidBillsByResident = unpaidBillings.reduce((groups, billing) => {
    const residentId = String(billing.raw?.user_id ?? billing.consumerName);
    const residentBills = groups.get(residentId) ?? [];
    residentBills.push(billing);
    groups.set(residentId, residentBills);
    return groups;
  }, new Map());
  const paymentRows = Array.from(unpaidBillsByResident.entries()).map(
    ([residentId, residentBills]) => {
      const oldestBilling = residentBills[0];
      return {
        id: residentId,
        consumerName: oldestBilling.consumerName,
        oldestBilling,
        outstandingBillCount: residentBills.length,
        paymentStatus: "unpaid",
        purok: oldestBilling.purok,
        totalOutstanding: residentBills.reduce(
          (total, billing) => total + Number(billing.outstandingBalance || 0),
          0,
        ),
      };
    },
  );
  const paidResidentRows = Array.from(
    purokBillings.reduce((groups, billing) => {
      const residentId = String(billing.raw?.user_id ?? billing.consumerName);
      const residentBills = groups.get(residentId) ?? [];
      residentBills.push(billing);
      groups.set(residentId, residentBills);
      return groups;
    }, new Map()).entries(),
  )
    .filter(([, residentBills]) => residentBills.length > 0 && residentBills.every(
      (billing) => Number(billing.outstandingBalance ?? 0) <= 0,
    ))
    .map(([residentId, residentBills]) => {
      const latestBilling = [...residentBills].sort((first, second) =>
        String(second.raw?.billing_date ?? "").localeCompare(String(first.raw?.billing_date ?? "")) ||
        Number(second.id) - Number(first.id),
      )[0];
      return {
        id: residentId,
        consumerName: latestBilling.consumerName,
        oldestBilling: null,
        outstandingBillCount: 0,
        paymentStatus: "paid",
        purok: latestBilling.purok,
        totalOutstanding: 0,
      };
    });
  const allPaymentRows = [...paymentRows, ...paidResidentRows];
  const paymentSearchTerm = paymentQuery.trim().toLowerCase();
  const visiblePaymentRows = allPaymentRows.filter((resident) => {
    const matchesName =
      !paymentSearchTerm ||
      String(resident.consumerName ?? "").toLowerCase().includes(paymentSearchTerm);
    const matchesStatus = paymentStatusFilter === "all" || resident.paymentStatus === paymentStatusFilter;
    const matchesPurok = purokFilter === "all" || resident.purok === purokFilter;
    const matchesCount =
      resident.paymentStatus === "paid" ||
      paymentCountFilter === "all" ||
      (paymentCountFilter === "1" && resident.outstandingBillCount === 1) ||
      (paymentCountFilter === "2" && resident.outstandingBillCount === 2) ||
      (paymentCountFilter === "3+" && resident.outstandingBillCount >= 3);

    return matchesName && matchesStatus && matchesCount && matchesPurok;
  });

  return (
    <main className="min-w-0 space-y-6">
      <PageHeader description="Select a resident with an outstanding balance, then securely record their payment." title="Payment Processing" />

      <section aria-label="Payment summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <KPI animateValue compact className="col-span-2 sm:col-span-1" description="On Record" icon={Banknote} title="All-Time Collected" value={`₱${totalCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
        <KPI animateValue compact description="Completed" icon={ReceiptText} title="All Transactions" value={payments.length} />
        <KPI animateValue compact description="No Balance" icon={CheckCircle2} title="Bills Fully Paid" value={fullyPaid} />
      </section>

      {error && !isPaymentModalOpen && (
        <div
          className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          <span>{error}</span>
          <button className="min-h-11 font-bold underline" onClick={loadPaymentData} type="button">
            Try again
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-navy-900" id="outstanding-payments-heading">
          {paymentStatusFilter === "paid"
            ? "Residents with no outstanding balance"
            : paymentStatusFilter === "all" ? "Residents by payment status" : "Residents needing payment"}
        </h2>
        <p aria-live="polite" className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">
          {paymentStatusFilter === "paid"
            ? `${visiblePaymentRows.length} paid resident${visiblePaymentRows.length === 1 ? "" : "s"}.`
            : paymentStatusFilter === "all"
              ? `${visiblePaymentRows.length} residents shown · ${unpaidBillings.length} outstanding bills.`
              : `${paymentRows.length} ${paymentRows.length === 1 ? "resident" : "residents"} with ${unpaidBillings.length} outstanding ${unpaidBillings.length === 1 ? "bill" : "bills"}.`}
        </p>
      </div>

      <div
        aria-label="Outstanding payment list controls"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <Search
          ariaLabel="Search residents by name"
          className="flex-1"
          onValueChange={setPaymentQuery}
          placeholder="Search resident name"
          value={paymentQuery}
        />
        <Filter
          ariaLabel="Filter residents by payment status"
          className="w-full sm:w-48"
          onValueChange={setPaymentStatusFilter}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Paid", value: "paid" },
          ]}
          value={paymentStatusFilter}
        />
        <Filter
          ariaLabel="Filter residents by purok"
          className="w-full sm:w-44"
          onValueChange={setPurokFilter}
          options={[{ label: "All puroks", value: "all" }, ...purokOptions.map((option) => ({ label: option, value: option }))]}
          value={purokFilter}
        />
        {paymentStatusFilter !== "paid" && (
        <Filter
          ariaLabel="Filter residents by outstanding bill count"
          className="w-full sm:w-56"
          onValueChange={setPaymentCountFilter}
          options={[
            { label: "All bill counts", value: "all" },
            { label: "1 outstanding bill", value: "1" },
            { label: "2 outstanding bills", value: "2" },
            { label: "3+ outstanding bills", value: "3+" },
          ]}
          value={paymentCountFilter}
        />
        )}
      </div>

      <section aria-labelledby="outstanding-payments-heading" className="space-y-3">
        {loading ? (
          <LoadingSkeleton label="Loading residents with outstanding balances" variant="table" />
        ) : (
          <Table
            ariaLabel="Residents with outstanding balances"
            columns={[
              { key: "consumer", label: "Name" },
              { key: "count", label: "Outstanding bills" },
              { key: "oldest", label: "Oldest unpaid bill" },
              { key: "balance", label: "Total balance", className: "text-right" },
              { key: "status", label: "Status" },
              { key: "action", label: "Action", className: "text-right" },
            ]}
            data={visiblePaymentRows}
            emptyDescription={
              paymentStatusFilter === "paid"
                ? "Residents with no outstanding bills will appear here."
                : paymentStatusFilter === "all"
                  ? allPaymentRows.length
                    ? "No residents match the current search and filters."
                    : "Residents will appear here when they have a billing record."
                  : paymentRows.length
                    ? "No outstanding bills match the current search and filter."
                    : "Residents will appear here when they have a bill with an outstanding balance."
            }
            emptyTitle={
              paymentStatusFilter === "paid"
                ? "No paid residents found"
                : paymentStatusFilter === "all"
                  ? allPaymentRows.length ? "No matching residents" : "No billing records"
                  : paymentRows.length ? "No matching residents" : "No residents need payment"
            }
            getRowKey={(resident) => resident.id}
            rowClassName="grid grid-cols-2 gap-x-3 gap-y-2 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0"
            tableClassName="block w-full text-left text-sm md:table"
            renderRow={(resident) => (
              <>
                <td className="col-span-2 md:col-span-1 md:px-4 md:py-4">
                  <p className="font-extrabold leading-5 text-navy-900">{resident.consumerName}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{resident.purok}</p>
                </td>
                <td className={`font-mono font-extrabold md:px-4 md:py-4 ${resident.outstandingBillCount >= 2 ? "text-red-700" : "text-navy-900"}`}>
                  {resident.outstandingBillCount}
                </td>
                <td className="md:px-4 md:py-4">
                  <p className="font-semibold text-slate-700">
                    {resident.oldestBilling?.billingPeriod ?? "No outstanding bills"}
                  </p>
                  {resident.oldestBilling && (
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {resident.oldestBilling.invoiceNumber} · Due {resident.oldestBilling.dueDate || "Not available"}
                    </p>
                  )}
                </td>
                <td className="font-mono font-extrabold tabular-nums text-navy-900 md:px-4 md:py-4 md:text-right">
                  ₱{resident.totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td className="md:px-4 md:py-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${resident.paymentStatus === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {resident.paymentStatus === "paid" ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />}
                    {resident.paymentStatus === "paid" ? "Paid" : `${resident.outstandingBillCount} outstanding`}
                  </span>
                </td>
                <td className="col-span-2 pt-1 md:col-span-1 md:px-4 md:py-4 md:text-right">
                  {resident.oldestBilling ? (
                    <button
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-water-600 px-4 font-bold text-white transition-colors hover:bg-water-700 md:w-auto"
                      onClick={() => openPaymentModal(resident.oldestBilling)}
                      type="button"
                    >
                      <WalletCards aria-hidden="true" className="h-4 w-4" />
                      Record Payment
                    </button>
                  ) : <span className="text-xs font-semibold text-emerald-700">No payment due</span>}
                </td>
              </>
            )}
          />
        )}
      </section>

      <PaymentModal
        key={`${isPaymentModalOpen ? "open" : "closed"}-${requestedBillingId || "manual"}`}
        billingRecords={billingRecords}
        error={error}
        initialBilling={preselectedBilling}
        isOpen={isPaymentModalOpen}
        onClose={closePaymentModal}
        onRecordAnother={recordAnotherPayment}
        onSubmit={recordPayment}
        onViewReceipt={setSelectedPayment}
      />
      <PaymentReceiptModal
        isOpen={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        receiptData={selectedPayment}
      />
    </main>
  );
}
