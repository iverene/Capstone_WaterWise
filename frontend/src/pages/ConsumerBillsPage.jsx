import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BillingHistoryTable from "../components/BillingHistoryTable";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import PaymentReceiptModal from "../components/PaymentReceiptModal";
import { useToast } from "../components/Toast";
import { fetchBillingHistory } from "../services/billingAPI";
import { fetchPaymentByBillingId } from "../services/paymentAPI";

export default function ConsumerBillsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const residentId = searchParams.get("residentId") ?? "";
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("");
  const [receiptView, setReceiptView] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  useEffect(() => {
    let active = true;
    fetchBillingHistory()
      .then((records) => {
        if (active) setBillings(records);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const consumerBillings = useMemo(() => billings
    .filter((billing) => String(billing.raw?.user_id ?? "") === residentId)
    .sort((first, second) =>
      String(second.raw?.billing_date ?? "").localeCompare(String(first.raw?.billing_date ?? "")) ||
      Number(second.id) - Number(first.id),
    ), [billings, residentId]);
  const consumer = consumerBillings[0] ?? null;

  const openReceipt = async (bill) => {
    if (bill.status === "Unpaid") return;
    setSelectedPayment(null);
    setLoadingReceipt(true);
    try {
      const payments = await fetchPaymentByBillingId(bill.id);
      const payment = payments.find((record) => Number(record.balanceAfterPayment ?? record.remainingBalance) === 0)
        ?? payments[0];
      if (!payment) {
        toast.error(
          "Payment receipt unavailable",
          "This bill has no recorded payment transaction yet.",
        );
        return;
      }
      setSelectedPayment({
        ...payment,
        consumerName: payment.consumerName?.startsWith("Billing #")
          ? (bill.consumerName ?? payment.consumerName)
          : payment.consumerName,
      });
      setReceiptView("payment");
    } catch (requestError) {
      toast.error("Payment receipt unavailable", requestError.message);
    } finally {
      setLoadingReceipt(false);
    }
  };

  const closeReceipt = () => {
    setReceiptView(null);
    setSelectedPayment(null);
  };

  const yearOptions = useMemo(() => [...new Set(
    consumerBillings
      .map((billing) => String(billing.raw?.billing_date ?? billing.readingDate ?? "").slice(0, 4))
      .filter((value) => /^\d{4}$/.test(value)),
  )].sort((left, right) => right.localeCompare(left)), [consumerBillings]);
  const activeYear = yearOptions.includes(year) ? year : yearOptions[0] ?? "";
  const filteredBillings = activeYear
    ? consumerBillings.filter((billing) => String(billing.raw?.billing_date ?? billing.readingDate ?? "").startsWith(activeYear))
    : consumerBillings;

  return (
    <main className="min-w-0 space-y-4 sm:space-y-5">
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900"
        onClick={() => navigate("/admin/billings")}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to billings
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <PageHeader compact title={consumer?.consumerName ?? "Consumer Bills"} />
          {consumer && (
            <p className="mt-1 text-sm text-slate-500">
              {consumer.purok ?? "Unassigned"}
            </p>
          )}
        </div>
        {!loading && yearOptions.length > 0 && (
          <Filter
            ariaLabel="Filter bills by year"
            className="w-full sm:w-44"
            onValueChange={setYear}
            options={yearOptions.map((option) => ({ label: option, value: option }))}
            value={activeYear}
          />
        )}
      </div>

      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="font-bold underline" onClick={() => window.location.reload()} type="button">Try again</button></div>}
      {loading ? (
        <LoadingSkeleton label="Loading consumer bills" variant="table" />
      ) : (
        <BillingHistoryTable
          canViewReceipt={(row) => row.status !== "Unpaid"}
          historyData={filteredBillings}
          onViewReceipt={loadingReceipt ? undefined : openReceipt}
          showConsumerDetails={false}
        />
      )}

      <PaymentReceiptModal
        isOpen={receiptView === "payment" && Boolean(selectedPayment)}
        onClose={closeReceipt}
        receiptData={selectedPayment}
      />
    </main>
  );
}
