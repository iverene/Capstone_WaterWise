import { CalendarDays, CheckCircle2, Clock3, ReceiptText } from "lucide-react";
import { AnimatedKPIValue } from "./KPI";

const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value ?? 0));

export default function CurrentBillingCard({ outstandingBalance = 0, dueDate = "", pendingCount = 0, overdue = false }) {
  const paymentNeeded = Number(outstandingBalance) > 0;
  const StatusIcon = paymentNeeded ? Clock3 : CheckCircle2;

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
      data-testid="current-billing-card"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700">
              <ReceiptText aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Outstanding bills</p>
              <h2 className="mt-0.5 text-sm font-bold text-navy-900">Total outstanding balance</h2>
            </div>
          </div>
          <p
            className="mt-4 font-sans text-2xl font-extrabold tracking-tight text-navy-900 tabular-nums sm:mt-5 sm:text-3xl"
            data-testid="outstanding-balance"
          >
            <AnimatedKPIValue value={currency(outstandingBalance)} />
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col items-start gap-3 sm:w-auto sm:min-w-[18rem] sm:items-end">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold ${
            paymentNeeded
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {paymentNeeded ? overdue ? "Overdue balance" : "Payment needed" : "Up to date"}
          </span>

          <div className="flex w-full items-start gap-2.5 sm:justify-end sm:text-right">
            <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-water-700 sm:order-2" />
            <div className="min-w-0 flex-1 sm:order-1">
              <div className="flex items-baseline justify-between gap-3 sm:justify-end sm:gap-2">
                <p className="text-xs font-semibold text-slate-500">{pendingCount > 1 ? "Oldest bill due date" : "Due date"}</p>
                <p className="font-mono text-sm font-bold text-navy-900" data-testid="due-date">
                  {dueDate || "No pending due date"}
                </p>
              </div>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                {paymentNeeded ? overdue ? "The oldest unpaid bill is past due. Please settle outstanding bills at the water office." : pendingCount > 1 ? `Total across ${pendingCount} unpaid bills. The date shown belongs to the oldest unpaid bill.` : "Pay this bill on or before the due date." : "You have no outstanding water bill balance."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
