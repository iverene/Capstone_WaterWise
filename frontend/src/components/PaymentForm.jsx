import { useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Search,
  UserRound,
} from "lucide-react";
import Dropdown from "./Dropdown";

const today = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Manila",
      year: "numeric",
    })
      .formatToParts(new Date())
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
};
const createIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const residentKey = (record) => String(record.raw?.user_id ?? record.consumerName);
const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function createInitialPayment(initialData, billingRecords) {
  const billing = billingRecords.find(
    (record) => String(record.id) === String(initialData?.billingId ?? ""),
  );
  const selectedResidentKey = billing ? residentKey(billing) : "";
  const oldestBilling = billingRecords
    .filter(
      (record) =>
        record.outstandingBalance > 0 && residentKey(record) === selectedResidentKey,
    )
    .sort((first, second) =>
      String(first.raw?.billing_date ?? "").localeCompare(
        String(second.raw?.billing_date ?? ""),
      ) || Number(first.id) - Number(second.id),
    )[0];

  return {
    amountReceived: String(initialData?.amountReceived ?? initialData?.amountPaid ?? ""),
    billingId: oldestBilling?.id ?? "",
    consumerName: initialData?.consumerName ?? billing?.consumerName ?? "",
    currentBalance: String(oldestBilling?.outstandingBalance ?? ""),
    paymentDate: initialData?.paymentDate ?? today(),
    paymentMethod: initialData?.paymentMethod ?? "Cash",
    referenceNumber: initialData?.referenceNumber ?? "",
    residentKey: selectedResidentKey,
  };
}

function PaymentStatus({ status }) {
  const config =
    status === "Paid"
      ? {
          Icon: CheckCircle2,
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        }
      : status === "Partially Paid"
        ? {
            Icon: Clock3,
            className: "border-amber-200 bg-amber-50 text-amber-800",
          }
        : {
            Icon: AlertCircle,
            className: "border-red-200 bg-red-50 text-red-700",
          };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${config.className}`}
    >
      <config.Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-sm font-semibold text-slate-500">{label}</dt>
      <dd className="text-right font-mono text-sm font-bold tabular-nums text-navy-900">
        {value}
      </dd>
    </div>
  );
}

export default function PaymentForm({
  billingRecords = [],
  initialData = null,
  onCancel,
  onSubmit = () => {},
  onSuccess,
}) {
  const formRef = useRef(null);
  const reviewHeadingRef = useRef(null);
  const idempotencyKeyRef = useRef(createIdempotencyKey());
  const [form, setForm] = useState(() => createInitialPayment(initialData, billingRecords));
  const [residentQuery, setResidentQuery] = useState(initialData?.consumerName ?? "");
  const [errors, setErrors] = useState({});
  const [stage, setStage] = useState("details");
  const [submitting, setSubmitting] = useState(false);

  const unpaidBillings = billingRecords.filter((record) => record.outstandingBalance > 0);
  const residentOptions = Array.from(
    new Map(
      unpaidBillings.map((record) => [
        residentKey(record),
        {
          key: residentKey(record),
          name: record.consumerName,
          purok: record.purok,
        },
      ]),
    ).values(),
  );
  const residentSearchTerm = residentQuery.trim().toLowerCase();
  const matchingResidents = residentOptions.filter((resident) =>
    resident.name.toLowerCase().includes(residentSearchTerm),
  );
  const selectedResident = residentOptions.find((resident) => resident.key === form.residentKey);
  const residentBills = unpaidBillings
    .filter((record) => residentKey(record) === form.residentKey)
    .sort((first, second) =>
      String(first.raw?.billing_date ?? "").localeCompare(
        String(second.raw?.billing_date ?? ""),
      ) || Number(first.id) - Number(second.id),
    );
  const selectedBilling = billingRecords.find(
    (record) => String(record.id) === String(form.billingId),
  );
  const residentBillsSorted = residentBills; // already oldest-first sorted above
  const totalOutstanding = Number(residentBillsSorted.reduce((t, b) => t + Number(b.outstandingBalance || 0), 0).toFixed(2));
  const balance = totalOutstanding;
  const amountReceived = Number(form.amountReceived) || 0;
  const amountApplied = Math.min(amountReceived, totalOutstanding);
  const changeGiven = form.paymentMethod === "Cash" ? Math.max(amountReceived - amountApplied, 0) : 0;
  const remainingBalance = Math.max(totalOutstanding - amountApplied, 0);
  const previewAllocations = residentBillsSorted.reduce(
    (state, b) => {
      const outstanding = Number(b.outstandingBalance || 0);
      const slice = Math.min(outstanding, state.left);
      if (slice <= 0) return state;
      return {
        left: Math.max(state.left - slice, 0),
        items: [
          ...state.items,
          { id: b.id, period: b.billingPeriod, invoice: b.invoiceNumber, outstanding, slice, leftAfter: Math.max(outstanding - slice, 0) },
        ],
      };
    },
    { left: amountApplied, items: [] },
  ).items;
  const paymentStatus =
    amountApplied <= 0
      ? "Unpaid"
      : amountApplied >= totalOutstanding
        ? "Paid"
        : "Partially Paid";

  const inputClass = (name, readOnly = false) =>
    [
      "mt-2 min-h-12 w-full rounded-xl border bg-white px-4 font-mono tabular-nums text-navy-900 outline-none transition-colors placeholder:font-sans placeholder:text-slate-400 focus:ring-4",
      errors[name]
        ? "border-red-600 focus:border-red-600 focus:ring-red-100"
        : "border-slate-300 focus:border-water-600 focus:ring-water-100",
      readOnly ? "bg-slate-100 text-slate-600" : "",
    ].join(" ");
  const accessibility = (name) => ({
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
    "aria-invalid": Boolean(errors[name]),
  });
  const error = (name) =>
    errors[name] && (
      <p className="mt-1.5 text-sm font-semibold text-red-700" id={`${name}-error`} role="alert">
        {errors[name]}
      </p>
    );

  const selectResident = (resident) => {
    const oldestBilling = unpaidBillings
      .filter((record) => residentKey(record) === resident.key)
      .sort((first, second) =>
        String(first.raw?.billing_date ?? "").localeCompare(
          String(second.raw?.billing_date ?? ""),
        ) || Number(first.id) - Number(second.id),
      )[0];
    setResidentQuery(resident.name);
    setForm((previous) => ({
      ...previous,
      amountReceived: "",
      billingId: oldestBilling?.id ?? "",
      consumerName: resident.name,
      currentBalance: String(oldestBilling?.outstandingBalance ?? ""),
      residentKey: resident.key,
    }));
    setErrors((previous) => ({ ...previous, billingId: "", resident: "" }));
  };

  const handleChange = ({ target }) => {
    const { name, value } = target;
    if (name === "amountReceived" && !/^\d*\.?\d{0,2}$/.test(value)) return;

    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "paymentMethod" && value === "Cash" ? { referenceNumber: "" } : {}),
    }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.residentKey) nextErrors.resident = "Select a resident with an unpaid bill.";
    if (!form.billingId) nextErrors.billingId = "Select the billing record being paid.";
    if (!form.currentBalance) nextErrors.currentBalance = "The current balance is unavailable.";
    if (!form.amountReceived) nextErrors.amountReceived = "Enter the amount received.";
    else if (Number(form.amountReceived) <= 0) {
      nextErrors.amountReceived = "The amount must be greater than zero.";
    } else if (form.paymentMethod !== "Cash" && Number(form.amountReceived) > totalOutstanding) {
      nextErrors.amountReceived = "Electronic payments cannot exceed the total outstanding balance.";
    }
    if (!form.paymentMethod) nextErrors.paymentMethod = "Select a payment method.";
    if (form.paymentMethod !== "Cash" && !form.referenceNumber.trim()) {
      nextErrors.referenceNumber = "Enter the electronic payment reference number.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector('[aria-invalid="true"]')?.focus(),
      );
    }
    return Object.keys(nextErrors).length === 0;
  };

  const reviewPayment = (event) => {
    event.preventDefault();
    if (!validate()) return;
    setStage("review");
    requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  };

  const confirmPayment = async () => {
    try {
      setSubmitting(true);
      const saved = await onSubmit({
        ...form,
        consumerId: Number(selectedBilling?.raw?.user_id ?? residentBills[0]?.raw?.user_id),
        totalApplied: amountApplied,
        amountReceived,
        amountTendered: amountReceived,
        idempotencyKey: idempotencyKeyRef.current,
        paymentStatus: amountApplied >= totalOutstanding ? "Paid" : "Partially Paid",
        remainingBalance,
        changeGiven,
        allocations: previewAllocations,
      });

      if (saved !== false) {
        idempotencyKeyRef.current = createIdempotencyKey();
        onSuccess?.(saved);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="p-5 sm:p-6" onSubmit={reviewPayment} ref={formRef}>
      <ol className="mb-6 grid grid-cols-2 gap-2" aria-label="Payment steps">
        {["Payment details", "Review"].map((label, index) => {
          const active = (stage === "details" ? 0 : 1) >= index;
          return (
            <li
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                active ? "bg-water-50 text-water-700" : "bg-slate-50 text-slate-400"
              }`}
              key={label}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full font-mono ${
                  active ? "bg-water-600 text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {index + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {stage === "details" ? (
        <div className="space-y-6">
          <section>
            {!selectedResident ? (
              <div className="mt-4">
                <label className="text-sm font-bold text-navy-900" htmlFor="payment-resident-search">
                  Resident name
                </label>
                <div className="relative mt-2">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    {...accessibility("resident")}
                    className={`${inputClass("resident")} mt-0 pl-11 font-sans`}
                    id="payment-resident-search"
                    onChange={(event) => {
                      setResidentQuery(event.target.value);
                      setErrors((previous) => ({ ...previous, resident: "" }));
                    }}
                    placeholder="Search resident name"
                    type="search"
                    value={residentQuery}
                  />
                </div>
                {error("resident")}

                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto" role="list">
                  {matchingResidents.slice(0, 8).map((resident) => (
                    <button
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                      key={resident.key}
                      onClick={() => selectResident(resident)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <UserRound aria-hidden="true" className="h-5 w-5 shrink-0 text-water-600" />
                        <span className="truncate font-bold text-navy-900">{resident.name}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-slate-500">
                        {resident.purok}
                      </span>
                    </button>
                  ))}
                  {residentQuery && matchingResidents.length === 0 && (
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      No resident with an unpaid bill matches that name.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-water-200 bg-water-50 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-bold text-navy-900">{selectedResident.name}</p>
                  <p className="font-mono text-xl font-extrabold tabular-nums text-navy-900">
                    {currency(selectedBilling?.outstandingBalance)}
                  </p>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-600">{selectedResident.purok}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-water-200/70 pt-3 text-xs text-slate-600">
                  <span>
                    <span className="font-semibold">Invoice </span>
                    <span className="font-mono font-bold text-water-700">{selectedBilling?.invoiceNumber}</span>
                  </span>
                  <span>
                    <span className="font-semibold">Billing </span>
                    {selectedBilling?.billingPeriod}
                  </span>
                  <span>
                    <span className="font-semibold">Due </span>
                    {selectedBilling?.dueDate || "Not available"}
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold text-water-700">
                  {`${residentBills.length} outstanding bill(s) · Total ${currency(totalOutstanding)} · Any amount pays oldest first`}
                </p>
              </div>
            )}

            {selectedResident && previewAllocations.length > 0 && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-sm font-bold text-navy-900">Waterfall preview</p>
                  <div className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {previewAllocations.map((allocation) => (
                      <div className="flex items-center justify-between gap-4 px-4 py-3" key={allocation.id}>
                        <div>
                          <p className="font-semibold text-navy-900">{allocation.period}</p>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">
                            {allocation.invoice} · {currency(allocation.slice)} applied
                          </p>
                        </div>
                        <p className="font-mono text-sm font-extrabold text-slate-700">
                          {currency(allocation.leftAfter)} left
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-bold text-navy-900" htmlFor="amountReceived">
                    {form.paymentMethod === "Cash" ? "Cash received" : "Amount received"}
                  </label>
                  {selectedBilling && (
                    <button
                      className="text-xs font-bold text-water-700 hover:underline"
                      onClick={() => {
                        setForm((previous) => ({
                          ...previous,
                          amountReceived: String(balance),
                        }));
                        setErrors((previous) => ({ ...previous, amountReceived: "" }));
                      }}
                      type="button"
                    >
                      Pay full balance
                    </button>
                  )}
                </div>
                <input
                  {...accessibility("amountReceived")}
                  className={inputClass("amountReceived")}
                  id="amountReceived"
                  inputMode="decimal"
                  name="amountReceived"
                  onChange={handleChange}
                  placeholder="0.00"
                  type="text"
                  value={form.amountReceived}
                />
                {error("amountReceived")}
              </div>

              <div>
                <label className="text-sm font-bold text-navy-900" htmlFor="paymentMethod">
                  Payment method
                </label>
                <Dropdown
                  ariaDescribedBy={accessibility("paymentMethod")["aria-describedby"]}
                  ariaInvalid={accessibility("paymentMethod")["aria-invalid"]}
                  ariaLabel="Select payment method"
                  className="mt-2"
                  id="paymentMethod"
                  name="paymentMethod"
                  onValueChange={(value) => handleChange({ target: { name: "paymentMethod", value } })}
                  options={[
                    { label: "Cash", value: "Cash" },
                    { label: "GCash", value: "GCash" },
                  ]}
                  value={form.paymentMethod}
                />
                {error("paymentMethod")}
              </div>

              {form.paymentMethod !== "Cash" && (
                <div className="sm:col-span-2">
                  <label className="text-sm font-bold text-navy-900" htmlFor="referenceNumber">
                    Reference number
                  </label>
                  <input
                    {...accessibility("referenceNumber")}
                    className={inputClass("referenceNumber")}
                    id="referenceNumber"
                    maxLength={100}
                    name="referenceNumber"
                    onChange={handleChange}
                    placeholder="Enter the electronic transaction reference"
                    type="text"
                    value={form.referenceNumber}
                  />
                  {error("referenceNumber")}
                </div>
              )}
            </div>
          </section>

          <div
            className={`grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 ${
              form.paymentMethod === "Cash" ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            <div>
              <p className="text-xs font-semibold text-slate-500">Remaining balance</p>
              <p className="mt-1 font-mono text-xl font-extrabold tabular-nums text-navy-900">
                {currency(remainingBalance)}
              </p>
            </div>
            {form.paymentMethod === "Cash" && (
              <div>
                <p className="text-xs font-semibold text-slate-500">Change</p>
                <p className="mt-1 font-mono text-xl font-extrabold tabular-nums text-emerald-700">
                  {currency(changeGiven)}
                </p>
              </div>
            )}
            <div className="sm:text-right">
              <p className="mb-2 text-xs font-semibold text-slate-500">Current status</p>
              <PaymentStatus status={selectedBilling?.status ?? "Unpaid"} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="order-2 min-h-12 rounded-xl border border-slate-300 bg-white px-5 font-bold text-navy-900 hover:bg-slate-50 sm:order-1"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="order-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-water-600 px-5 font-bold text-white hover:bg-water-700 sm:order-2"
              type="submit"
            >
              Review payment
            </button>
          </div>
        </div>
      ) : (
        <section aria-labelledby="payment-review-heading">
          <h3
            className="mt-3 text-xl font-extrabold text-navy-900 outline-none"
            id="payment-review-heading"
            ref={reviewHeadingRef}
            tabIndex={-1}
          >
            Confirm Payment
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Verify these details before creating the financial transaction.
          </p>

          <dl className="mt-5 rounded-2xl border border-slate-200 bg-white px-4">
            <ReviewRow label="Resident" value={selectedBilling?.consumerName} />
            <ReviewRow
              label="Payment coverage"
              value={`${residentBills.length} outstanding bill(s) · Oldest first`}
            />
            <ReviewRow label="Starting invoice" value={selectedBilling?.invoiceNumber} />
            <ReviewRow label="Starting billing period" value={selectedBilling?.billingPeriod} />
            <ReviewRow label="Payment method" value={form.paymentMethod} />
            {form.referenceNumber && (
              <ReviewRow label="Reference" value={form.referenceNumber} />
            )}
            {form.paymentMethod === "Cash" ? (
              <>
                <ReviewRow label="Cash received" value={currency(amountReceived)} />
                <ReviewRow label="Amount applied to bill" value={currency(amountApplied)} />
                <ReviewRow label="Change" value={currency(changeGiven)} />
              </>
            ) : (
              <ReviewRow label="Amount paid" value={currency(amountApplied)} />
            )}
            <ReviewRow label="Remaining balance" value={currency(remainingBalance)} />
          </dl>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
            <span className="text-sm font-bold text-navy-900">Resulting bill status</span>
            <PaymentStatus status={paymentStatus} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <button
              className="order-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-bold text-navy-900 hover:bg-slate-50 disabled:opacity-60 sm:order-1"
              disabled={submitting}
              onClick={() => setStage("details")}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Back
            </button>
            <button
              className="ww-primary-button order-1 min-h-12 sm:order-2"
              disabled={submitting}
              onClick={confirmPayment}
              type="button"
            >
              {submitting ? "Confirming…" : "Confirm"}
            </button>
          </div>
        </section>
      )}
    </form>
  );
}
