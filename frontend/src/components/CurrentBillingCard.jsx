import { CalendarDays, CheckCircle2, Clock3, ReceiptText } from "lucide-react";

const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value ?? 0));

export default function CurrentBillingCard({ outstandingBalance = 0, dueDate = "" }) {
  const paymentNeeded = Number(outstandingBalance) > 0;
  const StatusIcon = paymentNeeded ? Clock3 : CheckCircle2;

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
      data-testid="current-billing-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700">
            <ReceiptText aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-water-700 sm:text-xs">Current billing</p>
            <h2 className="mt-0.5 text-sm font-bold text-navy-900 sm:text-base">Amount due</h2>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold ${
          paymentNeeded
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {paymentNeeded ? "Payment needed" : "Up to date"}
        </span>
      </div>

      <p
        className="mt-4 font-sans text-2xl font-extrabold tracking-tight text-navy-900 tabular-nums sm:mt-5 sm:text-4xl"
        data-testid="outstanding-balance"
      >
        {currency(outstandingBalance)}
      </p>

      <div className="mt-4 flex items-start gap-3 border-t border-slate-200 pt-4 sm:mt-5">
        <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-water-700 sm:h-5 sm:w-5" />
        <div>
          <p className="text-xs font-semibold text-slate-500">Due date</p>
          <p className="mt-1 font-mono text-sm font-bold text-navy-900 sm:text-base" data-testid="due-date">
            {dueDate || "No pending due date"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {paymentNeeded ? "Pay on or before this date to keep your account current." : "You have no outstanding water bill balance."}
          </p>
        </div>
      </div>
    </section>
  );
}
