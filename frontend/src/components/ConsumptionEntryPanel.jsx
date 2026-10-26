import { useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Gauge,
  RefreshCw,
  ReceiptText,
} from "lucide-react";
import { TIER_DEFAULTS, breakdownTieredBill, computeTieredBill } from "../utils/waterBill";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const SummaryItem = ({ label, value, tone = "" }) => (
  <div className={`rounded-xl border p-4 ${tone || "border-slate-200 bg-slate-50"}`}>
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 font-mono text-lg font-extrabold tabular-nums text-navy-900">{value}</dd>
  </div>
);

const acceptsDecimal = (value) => /^\d*(\.\d{0,2})?$/.test(value);
const createIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `meter-reading-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ConsumptionEntryPanel({ consumer, onCancel, onDirtyChange, onSave, rates = TIER_DEFAULTS, saving = false }) {
  const navigate = useNavigate();
  const [requestKey] = useState(createIdempotencyKey);
  const [initialPreviousReading, setInitialPreviousReading] = useState("");
  const [currentReading, setCurrentReading] = useState("");
  const [error, setError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [anomalyAcknowledged, setAnomalyAcknowledged] = useState(false);
  const [noEstimate, setNoEstimate] = useState(false);

  if (!consumer) return null;

  // Meter replacements and resets are recorded on the Meter Incidents page. This
  // panel only consumes an incident that is already open — it never creates one.
  const openIncident = consumer.openIncident ?? null;
  // A defective-meter report carries no billable usage yet, so it cannot be
  // applied. The reader updates it after the swap.
  const appliesIncident = Boolean(openIncident) && openIncident.incidentType !== "defective";

  const previousReading = consumer.hasPreviousRecord ? consumer.latestPresentReading : initialPreviousReading;
  const previousValue = Number(previousReading);
  const currentValue = Number(currentReading);
  const hasValues = previousReading !== "" && previousReading != null && currentReading !== "";
  const belowPrevious = hasValues && Number.isFinite(previousValue) && Number.isFinite(currentValue) && currentValue < previousValue;

  const priorUsage = appliesIncident ? Number(openIncident.priorUsage ?? 0) : null;
  const carryIsEstimate = appliesIncident && openIncident.priorUsageBasis === "average";
  const baselineValue = Number(openIncident?.newBaseline ?? 0);
  const meterAverage = consumer.averageRecentConsumption == null
    ? null
    : Number(consumer.averageRecentConsumption);
  const averageAvailable = Number.isFinite(meterAverage) && meterAverage > 0;

  // Mirrors the billing function so the reader sees the number that will actually
  // be billed: a meter change that measured nothing at all is estimated from the
  // resident's own average, unless the reader refuses the estimate.
  const newMeterUsage = hasValues ? Number((currentValue - baselineValue).toFixed(2)) : 0;
  const effectiveCarry = noEstimate && carryIsEstimate ? 0 : Number(priorUsage ?? 0);
  const measuredConsumption = hasValues ? effectiveCarry + newMeterUsage : 0;
  const averageInPlay = appliesIncident && hasValues && averageAvailable && (
    carryIsEstimate || (Number(priorUsage ?? 0) === 0 && newMeterUsage === 0)
  );
  const estimateApplies = averageInPlay && !noEstimate && measuredConsumption === 0;
  const consumption = !hasValues
    ? 0
    : appliesIncident
      ? (estimateApplies ? meterAverage : measuredConsumption)
      : currentValue - previousValue;
  const safeConsumption = hasValues && Number.isFinite(consumption) ? Math.max(consumption, 0) : 0;
  const estimatedBill = computeTieredBill(safeConsumption, rates);
  const billBreakdown = breakdownTieredBill(safeConsumption, rates);
  const anomalyBaseline = consumer.averageRecentConsumption;
  // An incident reading carries the old meter's usage on purpose, so only the new
  // meter's own volume can be a typo.
  const anomalyValue = appliesIncident ? newMeterUsage : safeConsumption;
  const showsAnomaly = hasValues && anomalyValue > 50 && (
    anomalyBaseline == null || anomalyValue > Math.max(anomalyBaseline * 1.75, anomalyBaseline + 25)
  );

  const changeDecimal = (setter) => (event) => {
    const { value } = event.target;
    if (!acceptsDecimal(value)) return;
    setter(value);
    const nextPreviousReading = setter === setInitialPreviousReading ? value : initialPreviousReading;
    const nextCurrentReading = setter === setCurrentReading ? value : currentReading;
    onDirtyChange?.(Boolean(nextPreviousReading || nextCurrentReading));
    setAnomalyAcknowledged(false);
    setNoEstimate(false);
    setError("");
  };

  const review = (event) => {
    event.preventDefault();
    if (!consumer.hasPreviousRecord && initialPreviousReading === "") {
      setError("Enter the last reading from the manual logbook.");
      return;
    }
    if (!hasValues || !Number.isFinite(previousValue) || !Number.isFinite(currentValue) || currentValue < 0) {
      setError("Enter a valid current reading.");
      return;
    }
    if (appliesIncident) {
      if (currentValue < baselineValue) {
        setError(`The current reading cannot be lower than the new meter baseline (${baselineValue.toLocaleString()} m³).`);
        return;
      }
    } else if (currentValue < previousValue) {
      setError("The current reading is lower than the previous reading. Record the meter replacement or reset in Meter Incidents first, then record the reading.");
      return;
    }
    if (consumer.hasReadingInSelectedMonth) {
      setError("This resident already has a reading for the current month.");
      return;
    }
    setError("");
    setIsReviewing(true);
  };

  const submit = async () => {
    if (showsAnomaly && !anomalyAcknowledged) {
      setError("Check the meter and acknowledge the unusual consumption before recording.");
      return;
    }
    setError("");
    const incident = appliesIncident
      ? {
          id: openIncident.id,
          ...(noEstimate && averageInPlay ? { forceZero: true } : {}),
        }
      : undefined;

    await onSave({
      consumerId: consumer.id,
      consumerName: consumer.consumerName,
      currentReading: Number(currentReading),
      idempotencyKey: requestKey,
      ...(!consumer.hasPreviousRecord ? { initialPreviousReading: Number(initialPreviousReading) } : {}),
      ...(incident ? { incident } : {}),
    });
  };

  const reviewItems = appliesIncident
    ? [
        ["Old meter carried", `${Number(effectiveCarry).toLocaleString()} m³`],
        ["New meter baseline", `${baselineValue.toLocaleString()} m³`],
        ["New meter usage", `${Number(newMeterUsage).toLocaleString()} m³`],
        ...(estimateApplies
          ? [["System average used", `${Number(meterAverage).toLocaleString()} m³`]]
          : []),
        ["Water consumed", `${Number(consumption).toLocaleString()} m³`],
        ["Estimated bill", currency(estimatedBill)],
      ]
    : [
        ["Previous reading", `${Number(previousReading).toLocaleString()} m³`],
        ["Current reading", `${Number(currentReading).toLocaleString()} m³`],
        ["Water consumed", `${consumption.toLocaleString()} m³`],
        ["Estimated bill", currency(estimatedBill)],
      ];

  return (
    <section className="p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-water-100 text-water-700 sm:h-11 sm:w-11 sm:rounded-xl"><Gauge aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
        <div>
          <p className="ww-eyebrow !text-water-700">{isReviewing ? "Step 3 of 3" : "Step 2 of 3"}</p>
          <h3 className="mt-1 text-xl font-extrabold text-navy-900">{isReviewing ? "Review before recording" : "Enter the cumulative reading"}</h3>
          <p className="mt-1 text-[13px] leading-5 text-slate-600 sm:text-sm sm:leading-6">{isReviewing ? "Confirm the meter values below." : "Type the exact value displayed on the resident’s meter."}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-water-100 bg-water-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div><p className="font-extrabold text-navy-900">{consumer.consumerName}</p><p className="mt-1 text-xs font-semibold text-slate-600">Account {consumer.consumerNo} · {consumer.purok}</p></div>
        <div className="rounded-xl bg-white px-3 py-2 text-left sm:text-right"><p className="text-xs font-semibold text-slate-500">Latest digital reading</p><p className="mt-0.5 font-mono font-extrabold text-navy-900">{consumer.hasPreviousRecord ? `${Number(consumer.latestPresentReading).toLocaleString()} m³` : "No record"}</p></div>
      </div>

      {!isReviewing ? (
        <form className="mt-5 space-y-4" onSubmit={review}>
          <div className="grid gap-4 sm:grid-cols-2">
            {appliesIncident && consumer.hasPreviousRecord ? (
              <label className="text-sm font-bold text-slate-700">
                New meter baseline
                <input className="ww-field mt-2 cursor-not-allowed bg-slate-100 p-3 font-mono text-lg tabular-nums" inputMode="decimal" readOnly type="text" value={baselineValue.toLocaleString()} />
                <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">The new meter started here. Type its current value on the right; it cannot be lower than this.</span>
              </label>
            ) : (
              <label className="text-sm font-bold text-slate-700">
                {appliesIncident ? "Old meter last reading" : "Previous reading"}
                <input className={`ww-field mt-2 p-3 font-mono text-lg tabular-nums ${consumer.hasPreviousRecord ? "cursor-not-allowed bg-slate-100" : ""}`} inputMode="decimal" onChange={changeDecimal(setInitialPreviousReading)} placeholder={consumer.hasPreviousRecord ? undefined : "From manual logbook"} readOnly={consumer.hasPreviousRecord} required type="text" value={previousReading ?? ""} />
                {!consumer.hasPreviousRecord && <span className="mt-1.5 block text-xs font-medium leading-5 text-amber-700">First digital entry: copy the last cumulative value from the manual logbook.</span>}
              </label>
            )}
            <label className="text-sm font-bold text-slate-700">
              {appliesIncident ? "New meter reading" : "Current reading"}
              <input autoComplete="off" autoFocus className="ww-field mt-2 p-3 font-mono text-lg tabular-nums" inputMode="decimal" onChange={changeDecimal(setCurrentReading)} placeholder="Type meter value" required type="text" value={currentReading} />
              {appliesIncident && <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">Type the value on the new meter. The old meter&apos;s usage is carried automatically.</span>}
            </label>
          </div>

          {consumer.hasPreviousRecord && openIncident && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-water-50 text-water-700"><RefreshCw aria-hidden="true" className="h-4 w-4" /></span>
                <div>
                  <p className="text-sm font-bold text-navy-900">Open meter record</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">
                    Carried over <span className="font-mono font-bold text-navy-900">{Number(openIncident.priorUsage).toLocaleString()} m³</span>
                    {carryIsEstimate ? " (system average)" : ""}
                    {" "}· New baseline <span className="font-mono font-bold text-navy-900">{Number(openIncident.newBaseline).toLocaleString()} m³</span>
                    {openIncident.newMeterSerial ? ` · Meter ${openIncident.newMeterSerial}` : ""}
                  </p>
                </div>
              </div>

              {openIncident.incidentType === "defective" ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
                  This only records a defective meter, so no usage is carried yet. Record the reading normally. Once the new meter is installed, update this record in Meter Incidents with the closing reading and baseline.
                </p>
              ) : (
                <p className="mt-3 rounded-xl border border-water-200 bg-water-50 p-3 text-xs font-semibold leading-5 text-water-800">
                  {estimateApplies
                    ? "This replacement is applied to the reading, but the system had to estimate the usage."
                    : "This replacement is applied automatically. The old meter's usage is carried into this reading."}
                </p>
              )}
            </div>
          )}

          {appliesIncident && averageInPlay && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><BarChart3 aria-hidden="true" className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900">
                    {carryIsEstimate
                      ? "The old meter's closing reading was not recorded"
                      : "Nothing was measured on the new meter"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    {carryIsEstimate
                      ? "The usage carried over is an estimate from the resident's recent average."
                      : "The new meter still shows its baseline, and the old meter did not measure this period either. The usage is estimated from the resident's recent average."}
                  </p>
                  <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                    System average{" "}
                    <span className="font-mono text-base font-extrabold text-navy-900">{Number(meterAverage).toLocaleString()} m³</span>
                    <span className="ml-1 font-medium text-slate-500">
                      from {consumer.averageSampleCount} actual reading{consumer.averageSampleCount === 1 ? "" : "s"} · window {consumer.averageWindow} months
                    </span>
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-300 bg-white p-3 transition hover:border-amber-400">
                    <input checked={noEstimate} className="mt-0.5 h-4 w-4 shrink-0 accent-water-600" onChange={(event) => setNoEstimate(event.target.checked)} type="checkbox" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-700">Do not estimate — bill only what the meter shows</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-600">Tick this only when the household really used no water, for example a vacant house or a disconnected service.</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {consumer.hasPreviousRecord && belowPrevious && !appliesIncident && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
              <p className="flex items-start gap-2 font-semibold">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                This reading is below the previous reading. A meter cannot go backwards, so the replacement or reset has to be reported first.
              </p>
              <button
                className="mt-2 font-bold text-water-800 underline underline-offset-2 hover:text-water-900"
                onClick={() => navigate(`/meter-reader/meter-incidents?consumerId=${encodeURIComponent(consumer.id)}`)}
                type="button"
              >
                Go to Meter Incidents
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-water-200 bg-water-50 p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-water-700 ring-1 ring-inset ring-water-100">
                  <CalendarClock aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-6 text-navy-900">Date and time are automatic</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">The system records the exact timestamp when you confirm.</p>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-2">
                <div className="min-w-0 rounded-xl bg-white px-4 py-2.5">
                  <p className="text-xs font-bold text-water-700">Calculated consumption</p>
                  <p className="mt-0.5 font-mono text-xl font-extrabold tabular-nums text-water-800">{safeConsumption.toLocaleString()} m³</p>
                  {appliesIncident && hasValues && (
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                      {estimateApplies
                        ? `Nothing measured — ${Number(meterAverage).toLocaleString()} m³ estimated from the system average`
                        : `${Number(effectiveCarry).toLocaleString()} m³ carried + ${Number(newMeterUsage).toLocaleString()} m³ on the new meter`}
                    </p>
                  )}
                </div>
                <div className="min-w-0 rounded-xl bg-navy-950 px-4 py-2.5">
                  <p className="text-xs font-bold text-water-200">Estimated bill</p>
                  <p className="mt-0.5 font-mono text-xl font-extrabold tabular-nums text-white">{currency(hasValues ? estimatedBill : 0)}</p>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <button className="ww-primary-button px-5 py-3 sm:order-2" type="submit">Review reading</button>
            <button className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 font-bold text-navy-900 hover:bg-slate-50 sm:order-1" onClick={onCancel} type="button">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-5">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {reviewItems.map(([label, value]) => <SummaryItem key={label} label={label} value={value} />)}
          </dl>
          <section aria-label="Estimated bill breakdown" className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><ReceiptText aria-hidden="true" className="h-4 w-4" /> Bill breakdown</h4>
            <dl className="mt-2">
              {billBreakdown.map((line) => (
                <div key={line.label} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
                  <dt className="text-sm font-semibold text-slate-500">{line.label}</dt>
                  <dd className="font-mono text-sm font-bold tabular-nums text-navy-900">{currency(line.amount)}</dd>
                </div>
              ))}
              <div className="flex items-start justify-between gap-4 pt-2">
                <dt className="text-sm font-extrabold text-navy-900">Total bill</dt>
                <dd className="font-mono text-base font-extrabold tabular-nums text-water-800">{currency(estimatedBill)}</dd>
              </div>
            </dl>
          </section>
          {appliesIncident && (
            <div className="mt-4 rounded-xl border border-water-200 bg-water-50 p-4 text-sm leading-6 text-slate-700">
              <p className="flex items-center gap-2 font-bold">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                Meter replacement applied
              </p>
              <p className="mt-1 text-xs leading-5">
                {estimateApplies
                  ? "This reading carries the old meter's usage, but the estimate below was used because the meter measured nothing."
                  : "This reading carries the old meter's usage automatically."}
              </p>
            </div>
          )}
          {appliesIncident && estimateApplies && (
            <p className="mt-4 rounded-xl border border-water-200 bg-water-50 p-3 text-xs font-semibold leading-5 text-water-800">
              This bill includes {Number(meterAverage).toLocaleString()} m³ estimated from the system average.
            </p>
          )}
          {showsAnomaly && <label className="mt-4 flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><input checked={anomalyAcknowledged} className="mt-1 h-5 w-5 accent-water-600" onChange={(event) => setAnomalyAcknowledged(event.target.checked)} type="checkbox" /><span><span className="flex items-center gap-2 text-sm font-bold text-amber-700"><AlertTriangle aria-hidden="true" className="h-4 w-4" /> Unusual consumption</span><span className="mt-1 block text-sm leading-6 text-slate-600">This usage is much higher than the resident’s recent consumption. I checked the meter and confirm it is correct.</span></span></label>}
          {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          <div className="mt-5 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <button className="ww-primary-button order-1 flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3 sm:order-3 sm:min-h-11 sm:w-auto" disabled={saving} onClick={submit} type="button"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />{saving ? "Recording..." : "Confirm and record"}</button>
            <button className="order-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-bold text-navy-900 hover:border-water-300 hover:bg-water-50 sm:order-2 sm:min-h-11 sm:w-auto" disabled={saving} onClick={() => { setIsReviewing(false); setError(""); setAnomalyAcknowledged(false); }} type="button"><ArrowLeft aria-hidden="true" className="h-4 w-4" /> Edit reading</button>
            <button className="order-3 min-h-12 w-full rounded-xl px-4 font-bold text-slate-600 hover:bg-slate-100 hover:text-navy-900 sm:order-1 sm:min-h-11 sm:w-fit" disabled={saving} onClick={onCancel} type="button">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
