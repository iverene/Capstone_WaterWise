import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  UserRound,
} from "lucide-react";
import Dropdown from "../components/Dropdown";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import { useToast } from "../components/Toast";
import { fetchConsumerDirectory } from "../services/consumerDirectoryAPI";
import { fetchRecordingContext } from "../services/meterReadingAPI";
import {
  fetchConsumerMeterIncidents,
  logMeterIncident,
  updateMeterIncident,
} from "../services/meterIncidentAPI";

const todayInManila = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const requestMessage = (error, fallback) =>
  error?.response?.data?.message ?? error.message ?? fallback;

const MAX_VISIBLE_RESIDENTS = 200;

const emptyForm = () => ({
  incidentType: "replacement",
  effectiveDate: todayInManila(),
  oldMeterSerial: "",
  oldFinalReading: "",
  newMeterSerial: "",
  newBaseline: "0",
  notes: "",
});

const openIncidentOf = (incidents = []) =>
  incidents.find((incident) => ["pending", "authorized"].includes(incident.status)) ?? null;

/**
 * The whole resident directory is shown at once, so a reader on a phone can scan
 * the route instead of guessing a name. Search and the purok filter only narrow
 * the same list.
 */
function ResidentIncidentList({ consumers, onSelect }) {
  if (consumers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="font-bold text-slate-700">No matching residents</p>
        <p className="mt-1 text-sm text-slate-500">
          Try a different name, account number, or purok.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      {consumers.map((consumer) => {
        const isInactive = consumer.status !== "active";
        return (
          <button
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition sm:gap-4 sm:rounded-2xl sm:p-4 ${
              isInactive
                ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
                : "border-slate-200 bg-white hover:border-water-300 hover:bg-water-50"
            }`}
            disabled={isInactive}
            key={consumer.id}
            onClick={() => onSelect(consumer)}
            type="button"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-water-100 text-water-700 sm:h-11 sm:w-11 sm:rounded-xl">
              <UserRound aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold text-slate-900 sm:text-base">
                {consumer.consumerName}
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                {consumer.consumerNo} · {consumer.purok}
                {isInactive ? " · Inactive account" : ""}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        );
      })}
    </div>
  );
}

export default function ReportMeterIncidentPage() {
  const toast = useToast();
  const [consumers, setConsumers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [purok, setPurok] = useState("all");
  const [consumerId, setConsumerId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [context, setContext] = useState(null);
  const [openIncident, setOpenIncident] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedConsumer = useMemo(
    () => consumers.find((consumer) => String(consumer.id) === String(consumerId)) ?? null,
    [consumers, consumerId],
  );

  const purokOptions = useMemo(() => [
    { label: "All puroks", value: "all" },
    ...[...new Set(consumers.map((consumer) => consumer.purok).filter((value) => value !== "Unassigned"))]
      .sort((left, right) => Number(left.replace(/\D/g, "")) - Number(right.replace(/\D/g, "")))
      .map((value) => ({ label: value, value })),
  ], [consumers]);

  const matchingConsumers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return consumers.filter((consumer) => {
      const matchesSearch = !term ||
        [consumer.consumerName, consumer.consumerNo, consumer.accountName, consumer.purok]
          .some((value) => String(value ?? "").toLowerCase().includes(term));
      const matchesPurok = purok === "all" || consumer.purok === purok;
      return matchesSearch && matchesPurok;
    });
  }, [consumers, purok, query]);

  const visibleConsumers = useMemo(
    () => matchingConsumers.slice(0, MAX_VISIBLE_RESIDENTS),
    [matchingConsumers],
  );

  const loadDirectory = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      setConsumers(await fetchConsumerDirectory());
    } catch (requestError) {
      setLoadError(requestMessage(requestError, "Unable to load the resident directory."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    if (!consumerId) {
      return undefined;
    }
    let active = true;
    fetchRecordingContext(consumerId)
      .then((result) => {
        if (!active) return;
        setContext(result);
      })
      .catch(() => {
        if (!active) return;
        setContext(null);
      });

    fetchConsumerMeterIncidents(consumerId)
      .then((incidents) => {
        if (!active) return;
        const existing = openIncidentOf(incidents);
        setOpenIncident(existing);
        if (existing) {
          setForm((current) => ({
            ...current,
            incidentType: existing.incidentType,
            effectiveDate: existing.effectiveDate ?? todayInManila(),
            oldMeterSerial: existing.oldMeterSerial ?? "",
            oldFinalReading: existing.oldFinalReading == null ? "" : String(existing.oldFinalReading),
            newMeterSerial: existing.newMeterSerial ?? "",
            newBaseline: String(existing.newBaseline ?? 0),
            notes: existing.notes ?? "",
          }));
        }
      })
      .catch(() => {
        if (active) setOpenIncident(null);
      })
      .finally(() => {
        if (active) setLookupLoading(false);
      });

    return () => {
      active = false;
    };
  }, [consumerId]);

  const selectResident = (consumer) => {
    setConsumerId(String(consumer.id));
    setForm(emptyForm());
    setOpenIncident(null);
    setContext(null);
    setLookupLoading(true);
  };

  const closeEntry = () => {
    if (saving) return;
    setConsumerId("");
    setForm(emptyForm());
    setOpenIncident(null);
    setContext(null);
  };

  const updateForm = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "effectiveDate" && value > todayInManila()) {
        // A field event cannot be dated in the future.
        next.effectiveDate = todayInManila();
      }
      return next;
    });
  };

  const lastRecorded = context?.latestPresentReading ?? null;

  const closingDerived = useMemo(() => {
    if (form.oldFinalReading === "") return null;
    const entered = Number(form.oldFinalReading);
    if (!Number.isFinite(entered)) return null;
    if (lastRecorded == null) return entered;
    return Math.round((entered - Number(lastRecorded)) * 100) / 100;
  }, [form.oldFinalReading, lastRecorded]);

  const baselineValue = form.newBaseline === "" ? 0 : Number(form.newBaseline);
  // An admin pre-authorization is authoritative. The reader applies it at the
  // next reading instead of editing it here.
  const canEdit = !openIncident || openIncident.source === "meter_reader";

  const hasClosingReading = form.oldFinalReading !== "";
  // The carry is either measured here (closing reading − last recorded reading)
  // or estimated when the reading is recorded. The system average is never shown
  // on this form: it belongs to the reading, where the meter itself shows
  // whether anything was measured at all.
  const carried = closingDerived;

  const submit = async (event) => {
    event.preventDefault();
    if (!consumerId) {
      toast.error("Resident required", "Select the resident whose meter changed.");
      return;
    }
    if (form.incidentType !== "defective" && !hasClosingReading && context && context.averageRecentConsumption == null) {
      toast.error(
        "Closing reading required",
        "Enter the old meter's closing reading. This resident has no actual readings to average yet.",
      );
      return;
    }
    if (form.incidentType !== "defective" && carried != null && (!Number.isFinite(carried) || carried < 0)) {
      toast.error(
        "Closing reading too low",
        "The old meter's closing reading cannot be lower than the last recorded reading.",
      );
      return;
    }

    const payload = {
      consumerId: Number(consumerId),
      incidentType: form.incidentType,
      effectiveDate: form.effectiveDate,
      oldMeterSerial: form.oldMeterSerial,
      oldFinalReading: hasClosingReading ? form.oldFinalReading : "",
      newMeterSerial: form.newMeterSerial,
      newBaseline: baselineValue,
      // Without a closing reading the carried usage is estimated from the
      // resident's average when the reading is recorded, not decided here.
      priorUsageBasis: hasClosingReading ? "final_reading" : "average",
      priorUsage: "",
      autoAuthorize: false,
      notes: form.notes,
    };

    try {
      setSaving(true);
      const saved = openIncident
        ? await updateMeterIncident(openIncident.id, payload)
        : await logMeterIncident(payload);
      if (saved?.warning) {
        toast.warning(
          openIncident ? "Meter incident updated" : "Meter incident saved",
          saved.warning,
        );
      } else if (saved?.reviewStatus === "approved") {
        toast.success(
          openIncident ? "Meter incident updated" : "Meter incident recorded",
          "No payment hold applies. The next reading will carry this usage automatically.",
        );
      } else {
        toast.warning(
          openIncident ? "Meter incident updated" : "Meter incident submitted",
          "The resident's payments stay on hold until an admin approves it.",
        );
      }
      setOpenIncident(saved);
      setForm((current) => ({ ...current, notes: "" }));
    } catch (requestError) {
      toast.error(
        "Incident not saved",
        requestMessage(requestError, "Unable to save the meter incident."),
      );
    } finally {
      setSaving(false);
    }
  };

  const isFiltered = Boolean(query.trim()) || purok !== "all";

  return (
    <main className="space-y-4 sm:space-y-6">
      <PageHeader
        description="Declare a meter swap or a broken meter at any time. The monthly reading picks it up automatically."
        title="Report Meter Incident"
      />

      {loadError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>{loadError}</span>
          <button className="font-bold underline" onClick={loadDirectory} type="button">Try again</button>
        </div>
      )}

      <div
        aria-label="Resident directory controls"
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        role="search"
      >
        <Search
          ariaLabel="Search residents by name, account number, or purok"
          className="min-w-0 flex-1"
          disabled={loading}
          onValueChange={setQuery}
          placeholder="Search name, account number, or purok"
          value={query}
        />
        <Dropdown
          ariaLabel="Filter residents by purok"
          className="w-full shrink-0 sm:w-52"
          disabled={loading}
          name="incidentPurok"
          onValueChange={setPurok}
          options={purokOptions}
          triggerClassName="border-slate-200 bg-white text-navy-900 shadow-sm"
          value={purok}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold text-slate-500">
          {loading
            ? "Loading residents…"
            : `${matchingConsumers.length} of ${consumers.length} resident${consumers.length === 1 ? "" : "s"}${isFiltered ? " matching" : ""}`}
        </p>
        {isFiltered && (
          <button
            className="text-xs font-bold text-water-700 hover:underline"
            onClick={() => { setQuery(""); setPurok("all"); }}
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton label="Loading residents" variant="list" />
      ) : (
        <ResidentIncidentList consumers={visibleConsumers} onSelect={selectResident} />
      )}

      {!loading && matchingConsumers.length > MAX_VISIBLE_RESIDENTS && (
        <p className="px-1 text-xs font-semibold text-slate-500">
          Showing the first {MAX_VISIBLE_RESIDENTS} residents — use search or the purok filter to narrow the list.
        </p>
      )}

      <Modal
        closeLabel="Close meter incident form"
        description="Report a replacement so the next reading carries the old meter's usage."
        dismissible={!saving}
        eyebrow="Field operations"
        isOpen={Boolean(selectedConsumer)}
        onClose={closeEntry}
        size="md"
        title={openIncident ? "Update meter incident" : "Log meter incident"}
      >
        {!selectedConsumer ? null : lookupLoading ? (
          <p className="p-5 text-sm font-semibold text-slate-500 sm:p-6">
            Checking the resident's meter history…
          </p>
        ) : !canEdit ? (
          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-bold text-navy-900">Resident</p>
              <p className="mt-1 text-xs text-slate-600">
                {selectedConsumer.consumerName} · Account {selectedConsumer.consumerNo} · {selectedConsumer.purok}
              </p>
            </div>
            <div className="rounded-xl border border-water-200 bg-water-50 p-3 text-sm">
              <p className="flex items-center gap-2 font-bold text-navy-900">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                Admin already authorized this replacement
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Carried over {Number(openIncident.priorUsage).toLocaleString()} m³ · new baseline{" "}
                {Number(openIncident.newBaseline).toLocaleString()} m³. Record the next monthly reading and
                it will be applied automatically.
              </p>
            </div>
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <button
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50"
                onClick={closeEntry}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form className="space-y-4 p-5 sm:p-6" onSubmit={submit}>
            <div className="block text-sm font-bold text-slate-700">
              <span>Resident</span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-water-100 text-water-700">
                  <UserRound aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-navy-900">
                    {selectedConsumer.consumerName}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                    Account {selectedConsumer.consumerNo} · {selectedConsumer.purok}
                  </span>
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-navy-900">Latest recorded reading</span>
                <span className="font-mono font-bold text-navy-900">
                  {context?.latestPresentReading == null
                    ? "none"
                    : `${Number(context.latestPresentReading).toLocaleString()} m³`}
                </span>
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                The closing reading is measured against this value. The actual usage is settled at the next reading.
              </p>
            </div>

            {openIncident && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <span className="block font-bold">This resident already has an open incident</span>
                <span className="capitalize">{openIncident.incidentType}</span> · {openIncident.reviewStatus === "approved"
                  ? "approved by an admin"
                  : "waiting for admin approval"}.
                Saving updates that record instead of creating a second one.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-700">
                Incident type
                <select className="ww-field mt-2 p-3" onChange={updateForm("incidentType")} value={form.incidentType}>
                  <option value="replacement">Meter replacement</option>
                  <option value="reset">Meter reset</option>
                  <option value="defective">Defective meter</option>
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Effective date
                <input className="ww-field mt-2 p-3" max={todayInManila()} onChange={updateForm("effectiveDate")} type="date" value={form.effectiveDate} />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Old meter serial
                <input className="ww-field mt-2 p-3" onChange={updateForm("oldMeterSerial")} placeholder="Optional" type="text" value={form.oldMeterSerial} />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Old meter closing reading
                <input
                  className="ww-field mt-2 p-3 font-mono tabular-nums"
                  inputMode="decimal"
                  onChange={updateForm("oldFinalReading")}
                  placeholder="e.g. 470"
                  type="text"
                  value={form.oldFinalReading}
                />
                <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                  {lastRecorded == null
                    ? "Leave blank when the old meter was not read. The carried usage is then taken from the resident's average."
                    : `When present, prior usage = closing reading − ${Number(lastRecorded).toLocaleString()} m³ (latest recorded).`}
                </span>
                {closingDerived != null && (
                  <span className={`mt-1.5 block text-xs font-semibold ${closingDerived < 0 ? "text-red-600" : "text-water-800"}`}>
                    {closingDerived < 0
                      ? "The closing reading is below the last recorded reading."
                      : `Carried usage: ${closingDerived.toLocaleString()} m³`}
                  </span>
                )}
              </label>
              <label className="block text-sm font-bold text-slate-700">
                New meter serial
                <input className="ww-field mt-2 p-3" onChange={updateForm("newMeterSerial")} placeholder="Optional" type="text" value={form.newMeterSerial} />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                New meter baseline
                <input className="ww-field mt-2 p-3 font-mono tabular-nums" inputMode="decimal" onChange={updateForm("newBaseline")} placeholder="0" type="text" value={form.newBaseline} />
                <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                  The first value printed on the new meter. Use 0 when it starts at zero.
                </span>
              </label>
            </div>

            <label className="block text-sm font-bold text-slate-700">
              Notes
              <textarea className="ww-field mt-2 min-h-20 p-3" onChange={updateForm("notes")} placeholder="Reason, witness, or field observations" value={form.notes} />
            </label>

            <div className={`rounded-xl border p-3 text-xs leading-5 ${form.incidentType === "defective" || (carried != null && Number(carried) === 0) ? "border-water-200 bg-water-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {form.incidentType === "defective" ? (
                <>A defective meter carries nothing yet, so no payment is held. Once the new meter is installed, edit this record with the closing reading and the baseline.</>
              ) : carried == null ? (
                <>The old meter was not read. The carried usage is taken from the resident&apos;s average of recent actual readings, and the next reading applies it. The bill stays on hold until an admin approves the incident.</>
              ) : Number(carried) === 0 ? (
                <>The old meter did not move since the last reading, so 0 m³ is carried and this record is approved on the spot. If the new meter also shows no usage at the next reading, that reading is estimated from the resident&apos;s average and held for admin review.</>
              ) : (
                <>
                  This carries
                  <span className="mx-1 font-mono font-bold text-navy-900">{Number(carried).toLocaleString()} m³</span>
                  into the next reading, so the resident&apos;s payments are held until an admin reviews the incident.
                </>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50"
                onClick={closeEntry}
                type="button"
              >
                Cancel
              </button>
              <button className="ww-primary-button min-h-11 px-5 text-sm" disabled={saving || lookupLoading} type="submit">
                {saving ? "Saving…" : openIncident ? "Update incident" : "Log incident"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </main>
  );
}
