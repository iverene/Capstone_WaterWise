import { useCallback, useEffect, useState } from "react";
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
  recordPayment as recordPaymentRequest,
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
    };
  });
}

export default function PaymentProcessingPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedBillingId = Number(searchParams.get("billingId"));
  const [payments, setPayments] = useState([]);
  const [billingRecords, setBillingRecords] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(
    Boolean(searchParams.get("billingId")),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");

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
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const closePaymentModal = useCallback(() => {
    setIsPaymentModalOpen(false);
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
    setIsPaymentModalOpen(true);
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
      const consumerKey = String(billing.raw?.user_id ?? billing.consumerName);
      const targetBillings = payment.paymentScope === "all"
        ? billingRecords
            .filter(
              (record) =>
                Number(record.outstandingBalance) > 0 &&
                String(record.raw?.user_id ?? record.consumerName) === consumerKey,
            )
            .sort((first, second) =>
              String(first.raw?.billing_date ?? "").localeCompare(
                String(second.raw?.billing_date ?? ""),
              ) || Number(first.id) - Number(second.id),
            )
        : [billing];
      const savedPayments = [];

      for (let index = 0; index < targetBillings.length; index += 1) {
        const targetBilling = targetBillings[index];
        const isLastBilling = index === targetBillings.length - 1;
        const amountPaid = payment.paymentScope === "all"
          ? Number(targetBilling.outstandingBalance)
          : payment.amountPaid;
        const amountTendered = payment.paymentMethod === "Cash" && isLastBilling
          ? amountPaid + Number(payment.changeGiven || 0)
          : amountPaid;
        const result = await recordPaymentRequest({
          amountPaid,
          amountTendered,
          billingId: targetBilling.id,
          idempotencyKey: `${payment.idempotencyKey}:${targetBilling.id}`,
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod,
          referenceNumber: payment.referenceNumber,
        });
        savedPayments.push({
          ...result.payment,
          address: targetBilling.address,
          amountDue: result.payment.amountPaid,
          billingId: targetBilling.id,
          consumerName: targetBilling.consumerName,
          currentReading: targetBilling.currentReading,
          invoiceNumber: targetBilling.invoiceNumber,
          name: targetBilling.consumerName,
          paymentStatus: result.billing.status,
          previousReading: targetBilling.previousReading,
          remainingBalance: Number(result.billing.remaining_balance),
        });
      }

      setPayments((current) => [
        ...savedPayments,
        ...current.filter(
          (existingPayment) =>
            !savedPayments.some((savedPayment) => existingPayment.id === savedPayment.id),
        ),
      ]);
      setBillingRecords(await fetchBillingHistory());
      const totalSaved = savedPayments.reduce(
        (total, savedPayment) => total + Number(savedPayment.amountPaid || 0),
        0,
      );
      toast.success(
        payment.paymentScope === "all" ? "All bills paid" : "Payment recorded",
        `${billing.consumerName}'s payment of ₱${totalSaved.toLocaleString("en-PH", { minimumFractionDigits: 2 })} was saved.`,
      );
      return payment.paymentScope === "all"
        ? {
            ...savedPayments[0],
            amountPaid: totalSaved,
            paymentCount: savedPayments.length,
            payments: savedPayments,
          }
        : savedPayments[0];
    } catch (requestError) {
      const message = requestError?.response?.data?.message ?? requestError.message ?? "Unable to record payment.";
      setError(message);
      toast.error("Payment not recorded", message);
      return false;
    }
  };

  const totalCollected = payments.reduce(
    (sum, payment) => sum + Number(payment.amountPaid || 0),
    0,
  );
  const fullyPaid = payments.filter((payment) => payment.paymentStatus === "Paid").length;
  const unpaidBillings = billingRecords
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
        purok: oldestBilling.purok,
        statuses: residentBills.map((billing) => billing.status),
        totalOutstanding: residentBills.reduce(
          (total, billing) => total + Number(billing.outstandingBalance || 0),
          0,
        ),
      };
    },
  );
  const paymentSearchTerm = paymentQuery.trim().toLowerCase();
  const visibleUnpaidBillings = paymentRows.filter((resident) => {
    const matchesName =
      !paymentSearchTerm ||
      String(resident.consumerName ?? "").toLowerCase().includes(paymentSearchTerm);
    const matchesStatus =
      paymentStatus === "all" || resident.statuses.includes(paymentStatus);

    return matchesName && matchesStatus;
  });

  return (
    <main className="min-w-0 space-y-6">
      <PageHeader description="Select a resident with an outstanding balance, then securely record their payment." eyebrow="Payment administration" title="Payment processing" />

      <section aria-label="Payment summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <KPI className="col-span-2 sm:col-span-1" description="Across recorded transactions" icon={Banknote} title="All-time collected" value={`₱${totalCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
        <KPI description="Completed payment records" icon={ReceiptText} title="All transactions" value={payments.length} />
        <KPI description="Transactions with no balance" icon={CheckCircle2} title="Bills fully paid" value={fullyPaid} />
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

      <div
        aria-label="Outstanding payment list controls"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <Search
          ariaLabel="Search residents with outstanding balances by name"
          className="flex-1"
          onValueChange={setPaymentQuery}
          placeholder="Search resident name"
          value={paymentQuery}
        />
        <Filter
          ariaLabel="Filter outstanding bills by status"
          className="w-full sm:w-48"
          onValueChange={setPaymentStatus}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Unpaid", value: "Unpaid" },
            { label: "Partially paid", value: "Partially Paid" },
          ]}
          value={paymentStatus}
        />
      </div>

      <section aria-labelledby="outstanding-payments-heading" className="space-y-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-navy-900" id="outstanding-payments-heading">
            Residents needing payment
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {paymentRows.length} {paymentRows.length === 1 ? "resident" : "residents"} with {unpaidBillings.length} outstanding {unpaidBillings.length === 1 ? "bill" : "bills"}.
          </p>
        </div>

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
            data={visibleUnpaidBillings}
            emptyDescription={
              unpaidBillings.length
                ? "No outstanding bills match the current search and filter."
                : "Residents will appear here when they have a bill with an outstanding balance."
            }
            emptyTitle={
              unpaidBillings.length ? "No matching residents" : "No residents need payment"
            }
            getRowKey={(resident) => resident.id}
            rowClassName="grid grid-cols-2 gap-x-3 gap-y-3 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0"
            tableClassName="block w-full text-left text-sm md:table"
            renderRow={(resident) => (
              <>
                <td className="px-4 py-4">
                  <p className="font-bold text-slate-900">{resident.consumerName}</p>
                  <p className="mt-1 text-xs text-slate-500">{resident.purok}</p>
                </td>
                <td className="px-4 py-4 font-mono font-extrabold text-navy-900">
                  {resident.outstandingBillCount}
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-slate-700">
                    {resident.oldestBilling.billingPeriod}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {resident.oldestBilling.invoiceNumber} · Due {resident.oldestBilling.dueDate || "Not available"}
                  </p>
                </td>
                <td className="px-4 py-4 text-right font-mono font-extrabold tabular-nums text-navy-900">
                  ₱{resident.totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                    <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                    {resident.outstandingBillCount} outstanding
                  </span>
                </td>
                <td className="col-span-2 pt-1 md:px-4 md:py-4 md:text-right">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-water-600 px-4 font-bold text-white transition-colors hover:bg-water-700"
                    onClick={() => openPaymentModal(resident.oldestBilling)}
                    type="button"
                  >
                    <WalletCards aria-hidden="true" className="h-4 w-4" />
                    Record payment
                  </button>
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
