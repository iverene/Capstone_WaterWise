import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, UserRound, CloudOff } from "lucide-react";

export default function ConsumerSelectionList({ consumers = [], emptyDescription, emptyTitle, onSelect, selectedId, selectingId }) {
  return (
    <section className="ww-glass-strong overflow-hidden rounded-2xl">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <p className="ww-eyebrow !text-water-700">Step 1 of 3</p>
        <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Select a resident</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Choose an available resident to record a reading, or open the receipt for one already recorded this month.</p>
      </div>
      <div className="max-h-[46rem] space-y-3 overflow-y-auto p-4 sm:p-6">
        {consumers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-bold text-slate-700">{emptyTitle ?? "No residents found"}</p><p className="mt-1 text-sm text-slate-500">{emptyDescription ?? "Check the spelling or try a different account number or purok."}</p></div>
        ) : consumers.map((consumer) => {
          const disabled = (!consumer.hasReadingInSelectedMonth && !consumer.canRecord) || selectingId != null;
          return (
            <button
              className={`flex min-h-24 w-full items-center gap-4 rounded-2xl border p-4 text-left transition sm:p-5 ${selectedId === consumer.id ? "border-water-500 bg-water-50 ring-4 ring-water-100" : consumer.hasReadingInSelectedMonth ? "border-water-200 bg-water-50/60 hover:border-water-400 hover:bg-water-50" : "border-slate-200 bg-white hover:border-water-300 hover:bg-water-50"} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70`}
              disabled={disabled}
              key={consumer.id}
              onClick={() => onSelect(consumer)}
              type="button"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block truncate font-extrabold text-slate-900">{consumer.consumerName}</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">{consumer.consumerNo} · {consumer.purok}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                  {consumer.hasPendingReading ? (
                    <span className="inline-flex items-center gap-1 text-amber-700"><CloudOff aria-hidden="true" className="h-3.5 w-3.5" /> Saved offline · Waiting to sync</span>
                  ) : consumer.hasReadingInSelectedMonth ? (
                    <span className="inline-flex items-center gap-1 text-water-700"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Recorded this month · View receipt</span>
                  ) : selectingId === consumer.id ? (
                    <span className="inline-flex items-center gap-1 text-water-700"><LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Checking latest reading</span>
                  ) : consumer.status !== "active" ? (
                    <span className="text-slate-500">Inactive account</span>
                  ) : consumer.purok === "Unassigned" ? (
                    <span className="text-amber-700">Assign a purok before recording</span>
                  ) : !consumer.canRecord ? (
                    <span className="inline-flex items-start gap-1 text-amber-700"><AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" /> {consumer.recordingBlockReason ?? "Reading unavailable"}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" /> {consumer.hasPreviousRecord ? `Latest: ${Number(consumer.latestPresentReading).toLocaleString()} m³ on ${consumer.latestReadingDate}` : "First digital record"}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
