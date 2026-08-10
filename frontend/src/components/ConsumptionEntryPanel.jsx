import { useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Gauge } from "lucide-react";

const SummaryItem = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 font-mono text-lg font-extrabold tabular-nums text-navy-900">{value}</dd>
  </div>
);

const acceptsDecimal = (value) => /^\d*(\.\d{0,2})?$/.test(value);
const createIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `meter-reading-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ConsumptionEntryPanel({ consumer, onCancel, onSave, saving = false }) {
  const [requestKey] = useState(createIdempotencyKey);
  const [initialPreviousReading, setInitialPreviousReading] = useState("");
  const [currentReading, setCurrentReading] = useState("");
  const [error, setError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [anomalyAcknowledged, setAnomalyAcknowledged] = useState(false);

  if (!consumer) return null;

  const previousReading = consumer.hasPreviousRecord ? consumer.latestPresentReading : initialPreviousReading;
  const hasValues = previousReading !== "" && previousReading != null && currentReading !== "";
  const consumption = hasValues ? Number(currentReading) - Number(previousReading) : 0;
  const anomalyBaseline = consumer.averageRecentConsumption;
  const showsAnomaly = hasValues && consumption > 50 && (
    anomalyBaseline == null || consumption > Math.max(anomalyBaseline * 1.75, anomalyBaseline + 25)
  );

  const changeDecimal = (setter) => (event) => {
    const { value } = event.target;
    if (!acceptsDecimal(value)) return;
    setter(value);
    setAnomalyAcknowledged(false);
    setError("");
  };

  const review = (event) => {
    event.preventDefault();
    if (!consumer.hasPreviousRecord && initialPreviousReading === "") {
      setError("Enter the last reading from the manual logbook.");
      return;
    }
    if (!hasValues || Number(previousReading) < 0 || Number(currentReading) < Number(previousReading)) {
      setError("Enter a current reading that is equal to or greater than the previous reading.");
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
    await onSave({
      consumerId: consumer.id,
      consumerName: consumer.consumerName,
      currentReading: Number(currentReading),
      idempotencyKey: requestKey,
      ...(!consumer.hasPreviousRecord ? { initialPreviousReading: Number(initialPreviousReading) } : {}),
    });
  };

  const reviewItems = [
    ["Previous reading", `${Number(previousReading).toLocaleString()} m³`],
    ["Current reading", `${Number(currentReading).toLocaleString()} m³`],
    ["Water consumed", `${consumption.toLocaleString()} m³`],
  ];

  return (
    <section className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><Gauge aria-hidden="true" className="h-5 w-5" /></span>
        <div>
          <p className="ww-eyebrow !text-water-700">{isReviewing ? "Step 3 of 3" : "Step 2 of 3"}</p>
          <h3 className="mt-1 text-xl font-extrabold text-navy-900">{isReviewing ? "Review before recording" : "Enter the cumulative reading"}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{isReviewing ? "Confirm the meter values below." : "Type the exact value displayed on the resident’s meter."}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-water-100 bg-water-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div><p className="font-extrabold text-navy-900">{consumer.consumerName}</p><p className="mt-1 text-xs font-semibold text-slate-600">Account {consumer.consumerNo} · {consumer.purok}</p></div>
        <div className="rounded-xl bg-white px-3 py-2 text-left sm:text-right"><p className="text-xs font-semibold text-slate-500">Latest digital reading</p><p className="mt-0.5 font-mono font-extrabold text-navy-900">{consumer.hasPreviousRecord ? `${Number(consumer.latestPresentReading).toLocaleString()} m³` : "No record"}</p></div>
      </div>

      {!isReviewing ? (
        <form className="mt-5 space-y-4" onSubmit={review}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">
              Previous reading
              <input className={`ww-field mt-2 p-3 font-mono text-lg tabular-nums ${consumer.hasPreviousRecord ? "cursor-not-allowed bg-slate-100" : ""}`} inputMode="decimal" onChange={changeDecimal(setInitialPreviousReading)} placeholder={consumer.hasPreviousRecord ? undefined : "From manual logbook"} readOnly={consumer.hasPreviousRecord} required type="text" value={previousReading ?? ""} />
              {!consumer.hasPreviousRecord && <span className="mt-1.5 block text-xs font-medium leading-5 text-amber-700">First digital entry: copy the last cumulative value from the manual logbook.</span>}
            </label>
            <label className="text-sm font-bold text-slate-700">
              Current reading
              <input autoComplete="off" autoFocus className="ww-field mt-2 p-3 font-mono text-lg tabular-nums" inputMode="decimal" onChange={changeDecimal(setCurrentReading)} placeholder="Type meter value" required type="text" value={currentReading} />
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl border border-water-200 bg-water-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex items-start gap-3"><CalendarClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-water-700" /><div><p className="text-sm font-bold text-navy-900">Date and time are automatic</p><p className="mt-1 text-xs leading-5 text-slate-600">The system records the exact timestamp when you confirm.</p></div></div>
            <div className="rounded-xl bg-white px-4 py-3"><p className="text-xs font-bold text-water-700">Calculated consumption</p><p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-water-800">{Math.max(consumption, 0).toLocaleString()} m³</p></div>
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <button className="ww-primary-button px-5 py-3 sm:order-2" type="submit">Review reading</button>
            <button className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 font-bold text-navy-900 hover:bg-slate-50 sm:order-1" onClick={onCancel} type="button">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-5">
          <dl className="grid gap-3 sm:grid-cols-3">{reviewItems.map(([label, value]) => <SummaryItem key={label} label={label} value={value} />)}</dl>
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
