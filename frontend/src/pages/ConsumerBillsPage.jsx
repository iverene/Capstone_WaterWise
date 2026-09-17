import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BillingHistoryTable from "../components/BillingHistoryTable";
import ConsumptionReceiptModal from "../components/ConsumptionReceiptModal";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import PaymentReceiptModal from "../components/PaymentReceiptModal";
import { useToast } from "../components/Toast";
import { fetchBillingHistory } from "../services/billingAPI";
import { fetchPaymentByBillingId } from "../services/paymentAPI";

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

const buildConsumptionReceipt = (bill, consumerName, billings) => {
  if (!bill) return null;
  const readingTime = Date.parse(`${bill.readingDate}T00:00:00Z`);
  const arrears = billings.reduce((totals, record) => {
    const balance = Number(record.outstandingBalance ?? 0);
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

export default function ConsumerBillsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const residentId = searchParams.get("residentId") ?? "";
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("");
  const [selectedBill, setSelectedBill] = useState(null);
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
  const selectedConsumptionReceipt = buildConsumptionReceipt(
    selectedBill,
    consumer?.consumerName,
    consumerBillings,
  );

  const openReceipt = async (bill) => {
    setSelectedBill(bill);
    setSelectedPayment(null);
    if (bill.status !== "Paid") {
      setReceiptView("consumption");
      return;
    }
    setLoadingReceipt(true);
    try {
      const payments = await fetchPaymentByBillingId(bill.id);
      const payment = payments.find((record) => Number(record.balanceAfterPayment ?? record.remainingBalance) === 0)
        ?? payments[0];
      if (!payment) {
        toast.error(
          "Payment receipt unavailable",
          "This paid bill has no recorded payment transaction. It may be a legacy record.",
        );
        return;
      }
      setSelectedPayment(payment);
      setReceiptView("payment");
    } catch (requestError) {
      toast.error("Payment receipt unavailable", requestError.message);
    } finally {
      setLoadingReceipt(false);
    }
  };

  const closeReceipt = () => {
    setReceiptView(null);
    setSelectedBill(null);
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
    <main className="min-w-0 space-y-6">
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900"
        onClick={() => navigate("/admin/billings")}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to billings
      </button>
      <div>
        <PageHeader compact title={consumer?.consumerName ?? "Consumer Bills"} />
        {consumer && (
          <p className="mt-1 text-sm text-slate-500">
            {consumer.purok ?? "Unassigned"}
          </p>
        )}
      </div>

      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="font-bold underline" onClick={() => window.location.reload()} type="button">Try again</button></div>}
      {!loading && yearOptions.length > 0 && (
        <div className="flex justify-end">
          <Filter
            ariaLabel="Filter bills by year"
            className="w-full sm:w-32"
            onValueChange={setYear}
            options={yearOptions.map((option) => ({ label: option, value: option }))}
            value={activeYear}
          />
        </div>
      )}
      {loading ? (
        <LoadingSkeleton label="Loading consumer bills" variant="table" />
      ) : (
        <BillingHistoryTable
          historyData={filteredBillings}
          onViewReceipt={loadingReceipt ? undefined : openReceipt}
          showConsumerDetails={false}
        />
      )}

      <ConsumptionReceiptModal
        isOpen={receiptView === "consumption" && Boolean(selectedConsumptionReceipt)}
        onClose={closeReceipt}
        receiptData={selectedConsumptionReceipt}
        residentName={consumer?.consumerName}
      />
      <PaymentReceiptModal
        isOpen={receiptView === "payment" && Boolean(selectedPayment)}
        onClose={closeReceipt}
        receiptData={selectedPayment}
      />
    </main>
  );
}
