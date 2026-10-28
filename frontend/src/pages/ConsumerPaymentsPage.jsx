import { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, CheckCircle2, Clock3, Eye, ReceiptText } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Dropdown from "../components/Dropdown";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import PaymentReceiptModal from "../components/PaymentReceiptModal";
import Table from "../components/Table";
import { fetchBillingLedger } from "../services/consumerPortal.service";
import { isCanceledRequest } from "../services/apiClient";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const formatMonth = (monthKey) => {
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? monthKey
    : new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
};

function PaymentSummaryCard({ badge, badgeTone = "water", detailLabel, detailValue, icon: Icon, title, transactionCount, value }) {
  const badgeClasses = badgeTone === "positive"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : badgeTone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-water-200 bg-water-50 text-water-700";
  const BadgeIcon = badgeTone === "positive" ? CheckCircle2 : badgeTone === "warning" ? Clock3 : ReceiptText;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Payment history</p>
              <h2 className="mt-0.5 text-sm font-bold text-navy-900">{title}</h2>
            </div>
          </div>
          <p className="mt-4 font-sans text-2xl font-extrabold tracking-tight text-navy-900 tabular-nums sm:mt-5 sm:text-3xl">{value}</p>
        </div>

        <div className="hidden w-full shrink-0 flex-col items-start gap-3 sm:flex sm:w-auto sm:min-w-[15rem] sm:items-end">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold ${badgeClasses}`}>
            <BadgeIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {badge}
          </span>
          <div className="flex w-full items-start gap-2.5 sm:justify-end sm:text-right">
            <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-water-700 sm:order-2" />
            <div className="min-w-0 flex-1 sm:order-1">
              <div className="flex items-baseline justify-between gap-3 sm:justify-end sm:gap-2">
                <p className="text-xs font-semibold text-slate-500">{detailLabel}</p>
                <p className="font-mono text-sm font-bold text-navy-900">{detailValue}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 sm:hidden">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">Transactions</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-navy-900">{Number(transactionCount ?? 0).toLocaleString()}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">Latest payment</p>
          <p className="mt-1 break-words font-mono text-sm font-bold text-navy-900">{detailValue}</p>
        </div>
      </div>
    </article>
  );
}

function MobilePaymentCard({ onViewReceipt, payment }) {
  const fieldLabel = "mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-400";
  const fieldValue = "block min-w-0 truncate text-xs font-semibold text-slate-700";

  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="min-w-0">
        <span className={fieldLabel}>Transaction</span>
        <span className="block truncate font-mono text-xs font-bold text-navy-900">PAY-{payment.id}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{payment.paymentStatus}</span>
      </div>
      <div className="min-w-0">
        <span className={fieldLabel}>Payment date</span>
        <span className={`${fieldValue} font-mono`}>{payment.paymentDate}</span>
      </div>
      <div className="min-w-0">
        <span className={fieldLabel}>Amount paid</span>
        <span className="block truncate font-mono text-xs font-bold tabular-nums text-navy-900">{currency(payment.amountPaid)}</span>
      </div>
      <div className="min-w-0">
        <span className={fieldLabel}>Remaining balance</span>
        <span className={`${fieldValue} block font-mono tabular-nums`}>{currency(payment.balanceAfterPayment)}</span>
      </div>
      <div className="min-w-0">
        <span className={fieldLabel}>Receipt</span>
        <button
          aria-label={`View receipt for payment PAY-${payment.id}`}
          className="inline-flex h-6 w-6 items-center justify-start text-slate-600 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
          onClick={() => onViewReceipt(payment)}
          type="button"
        >
          <Eye aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export default function ConsumerPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [paymentMonth, setPaymentMonth] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchBillingLedger({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setLedger(data);
      })
      .catch((requestError) => {
        if (!isCanceledRequest(requestError) && !controller.signal.aborted) {
          setError(requestError.message ?? "Unable to load your payment history.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [requestVersion]);

  const payments = useMemo(() => ledger?.payments ?? [], [ledger?.payments]);
  const requestedPaymentId = Number(searchParams.get("paymentId"));
  const requestedPayment = useMemo(() => {
    if (!Number.isInteger(requestedPaymentId) || requestedPaymentId < 1) return null;
    return payments.find((item) => Number(item.id) === requestedPaymentId) ?? null;
  }, [payments, requestedPaymentId]);
  const activePayment = selectedPayment ?? requestedPayment;

  const closeReceipt = () => {
    setSelectedPayment(null);
    if (searchParams.has("paymentId")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("paymentId");
      setSearchParams(nextParams, { replace: true });
    }
  };

  const paymentMonthOptions = useMemo(() => [...new Set(
    payments
      .map((payment) => String(payment.paymentDate ?? "").slice(0, 7))
      .filter((month) => /^\d{4}-\d{2}$/.test(month)),
  )].sort((first, second) => second.localeCompare(first)), [payments]);

  const visiblePayments = paymentMonth === "all"
    ? payments
    : payments.filter((payment) => String(payment.paymentDate ?? "").startsWith(paymentMonth));

  const totalPaid = visiblePayments.reduce((total, payment) => total + Number(payment.amountPaid ?? 0), 0);
  const latestPayment = visiblePayments[0] ?? null;

  const retry = () => {
    setError("");
    setIsLoading(true);
    setRequestVersion((version) => version + 1);
  };

  return (
    <main className="min-w-0 space-y-5 sm:space-y-6">
      <PageHeader description="Review your payment history and open a receipt for any transaction." mobileCompact title="Payments" />

      {error && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 sm:flex-row sm:items-center sm:justify-between sm:text-sm" role="alert">
          <span>{error}</span>
          <button className="min-h-11 shrink-0 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800" onClick={retry} type="button">Try again</button>
        </div>
      )}

      {isLoading ? <LoadingSkeleton label="Loading payment history" variant="billing" /> : (
        <>
          <section aria-label="Payment history summary">
            <PaymentSummaryCard
              badge={`${visiblePayments.length.toLocaleString()} ${visiblePayments.length === 1 ? "transaction" : "transactions"}`}
              badgeTone={visiblePayments.length ? "positive" : "water"}
              detailLabel="Latest payment"
              detailValue={latestPayment?.paymentDate ?? "Not available"}
              icon={Banknote}
              title="Total paid"
              transactionCount={visiblePayments.length}
              value={currency(totalPaid)}
            />
          </section>

          <div aria-label="Payment history controls" className="flex items-end justify-between gap-3 sm:gap-4">
            <h2 className="pl-4 text-xl font-extrabold tracking-[-0.02em] text-navy-900">History</h2>
            <Dropdown
              ariaLabel="Filter payments by payment date"
              className="w-44 shrink-0 sm:w-56"
              compact
              onValueChange={setPaymentMonth}
              options={[
                { label: "All payment dates", value: "all" },
                ...paymentMonthOptions.map((month) => ({ label: formatMonth(month), value: month })),
              ]}
              value={paymentMonth}
            />
          </div>

          <ul aria-label="Your payment history" className="space-y-3 md:hidden">
            {visiblePayments.length ? visiblePayments.map((payment) => (
              <MobilePaymentCard key={payment.id} onViewReceipt={setSelectedPayment} payment={payment} />
            )) : (
              <li className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
                <p className="font-bold text-navy-900">{payments.length ? "No payments for this date" : "No payment history yet"}</p>
                <p className="mt-1 text-sm text-slate-500">{payments.length ? "No payments were recorded during this period." : "Your recorded payments will appear here."}</p>
              </li>
            )}
          </ul>

          <div className="hidden md:block">
          <Table
            ariaLabel="Your payment history"
            columns={[
              { key: "transaction", label: "Transaction" },
              { key: "bill", label: "Bill" },
              { key: "date", label: "Payment Date" },
              { key: "method", label: "Method" },
              { key: "amount", label: "Amount Paid", className: "text-right" },
              { key: "balance", label: "Remaining Balance", className: "text-right" },
              { key: "receipt", label: "Receipt", className: "text-right" },
            ]}
            data={visiblePayments}
            emptyDescription={payments.length ? "No payments were recorded during this period." : "Your recorded payments will appear here."}
            emptyTitle={payments.length ? "No payments for this date" : "No payment history yet"}
            getRowKey={(payment) => payment.id}
            rowClassName="md:table-row md:p-0"
            tableClassName="block w-full text-left text-xs md:table md:text-sm"
            renderRow={(payment) => (
              <>
                <td className="font-mono font-bold text-navy-900 md:px-4 md:py-4">
                  <span className="block">PAY-{payment.id}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">{payment.paymentStatus}</span>
                </td>
                <td className="font-mono font-semibold text-slate-700 md:px-4 md:py-4">{payment.invoiceNumber}</td>
                <td className="font-mono text-slate-700 md:px-4 md:py-4">{payment.paymentDate}</td>
                <td className="font-semibold text-slate-700 md:px-4 md:py-4">{payment.paymentMethod}</td>
                <td className="font-mono font-bold tabular-nums text-navy-900 md:px-4 md:py-4 md:text-right">{currency(payment.amountPaid)}</td>
                <td className="font-mono tabular-nums text-slate-700 md:px-4 md:py-4 md:text-right">{currency(payment.balanceAfterPayment)}</td>
                <td className="md:px-4 md:py-4 md:text-right">
                  <button aria-label={`View receipt for payment PAY-${payment.id}`} className="inline-flex min-h-11 w-11 items-center justify-center text-slate-600 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => setSelectedPayment(payment)} type="button">
                    <Eye aria-hidden="true" className="h-4 w-4" />
                  </button>
                </td>
              </>
            )}
          />
          </div>
        </>
      )}

      <PaymentReceiptModal isOpen={Boolean(activePayment)} onClose={closeReceipt} receiptData={activePayment} />
    </main>
  );
}
