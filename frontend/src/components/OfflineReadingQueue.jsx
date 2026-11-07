import { useEffect, useState } from "react";
import { getPendingMeterReadings, retryPendingMeterReading } from "../services/offlineMeterReadings";

function ReadingCorrection({ record }) {
  const [currentReading, setCurrentReading] = useState(String(record.currentReading ?? ""));
  const [previousReading, setPreviousReading] = useState(String(record.initialPreviousReading ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retry = async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await retryPendingMeterReading(record.idempotencyKey, {
        currentReading,
        ...(record.initialPreviousReading != null ? { initialPreviousReading: previousReading } : {}),
      });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <form className="space-y-3 rounded-xl border border-amber-200 bg-white p-4" onSubmit={retry}>
      <p className="font-bold text-navy-900">{record.consumerName ?? `Resident #${record.consumerId}`}</p>
      <p className="text-sm text-amber-900">{record.syncError}</p>
      <p className="text-xs text-slate-600">Saved on this device. Correct the meter value or retry after the reported issue is resolved.</p>
      <label className="block text-sm font-semibold">Current meter reading
        <input className="ww-field mt-1 w-full" disabled={busy} inputMode="decimal" min="0" onChange={e => setCurrentReading(e.target.value)} required step="0.01" type="number" value={currentReading} />
      </label>
      {record.initialPreviousReading != null && <label className="block text-sm font-semibold">Initial previous reading
        <input className="ww-field mt-1 w-full" disabled={busy} inputMode="decimal" min="0" onChange={e => setPreviousReading(e.target.value)} required step="0.01" type="number" value={previousReading} />
      </label>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button className="ww-primary-button min-h-11 px-4 py-2 text-sm disabled:opacity-50" disabled={busy} type="submit">{busy ? "Retrying…" : "Save correction and retry"}</button>
    </form>
  );
}

export default function OfflineReadingQueue() {
  const [records, setRecords] = useState([]);
  useEffect(() => {
    let active = true;
    const refresh = () => getPendingMeterReadings().then(items => { if (active) setRecords(items.filter(item => item.syncError)); }).catch(() => {});
    void refresh();
    window.addEventListener("waterwise:offline-queue-changed", refresh);
    return () => { active = false; window.removeEventListener("waterwise:offline-queue-changed", refresh); };
  }, []);
  if (!records.length) return null;
  return <section aria-label="Readings needing attention" className="space-y-3">
    <h2 className="font-extrabold text-navy-900">Readings needing attention</h2>
    {records.map(record => <ReadingCorrection key={`${record.idempotencyKey}:${record.failedAt}`} record={record} />)}
  </section>;
}
