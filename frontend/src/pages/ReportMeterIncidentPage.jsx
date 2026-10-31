import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Search as SearchIcon,
  UserRound,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router";
import DiscardChangesDialog from "../components/DiscardChangesDialog";
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
  fetchMeterIncidents,
  logMeterIncident,
} from "../services/meterIncidentAPI";

const requestMessage = (error, fallback) =>
  error?.response?.data?.message ?? error.message ?? fallback;

// Same filter as Record Meter Reading: digits with up to two decimal places.
const acceptsDecimal = (value) => /^\d*(\.\d{0,2})?$/.test(value);

const INCIDENT_STATUS_LABELS = {
  pending: "Not applied",
  authorized: "Recorded",
  consumed: "Applied to a reading",
};

const PRIOR_USAGE_BASIS_LABELS = {
  final_reading: "Old meter closing reading",
  previous_consumption: "Previous consumption",
  previous_reading_fallback: "Latest reading fallback",
  zero_carry: "No carried usage",
  minimum_charge: "Minimum charge",
  three_month_average: "Three-month average",
  reported: "Resident reported",
  average: "System average",
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(date);
};

const METER_FILTER_OPTIONS = [
  { label: "All residents", value: "all" },
  { label: "Meter changed", value: "changed" },
];

// A replacement stays open until the next reading consumes it. Once that
// happens the resident drops out of "Meter changed" but remains under "All
// residents" with a normal consumption history.
const isOpenMeterChangeIncident = (incident) =>
  Boolean(incident) &&
  ["pending", "authorized"].includes(incident.status) &&
  incident.incidentType === "replacement";

const emptyForm = () => ({
  oldFinalReading: "",
  newMeterSerial: "",
  newBaseline: "0",
});

const openIncidentOf = (incidents = []) =>
  incidents.find((incident) => ["pending", "authorized"].includes(incident.status)) ?? null;

/**
 * The whole resident directory is shown at once, so a reader on a phone can scan
 * the route instead of guessing a name. Search and the purok filter only narrow
 * the same list.
 */
function ResidentIncidentList({ consumers, meterChangedConsumerIds, onSelect }) {
  if (consumers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="font-bold text-slate-700">No matching residents</p>
        <p className="mt-1 text-sm text-slate-500">
          Try a different name, account number, purok, or filter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      {consumers.map((consumer) => {
        const isInactive = consumer.status !== "active";
        const hasMeterChange = meterChangedConsumerIds.has(String(consumer.id));
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
                {isInactive ? " · Disconnected account" : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {hasMeterChange && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-300"
                  title="Open meter change waiting for the next reading"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Meter changed
                </span>
              )}
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ReportMeterIncidentPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedConsumerId = searchParams.get("consumerId")?.trim() ?? "";
  const requestedConsumerIdRef = useRef(requestedConsumerId);
  const prefillHandledRef = useRef(false);
  const [consumers, setConsumers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [meterFilterError, setMeterFilterError] = useState("");
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [purok, setPurok] = useState("all");
  const [meterFilter, setMeterFilter] = useState("all");
  const [meterChangedConsumerIds, setMeterChangedConsumerIds] = useState(() => new Set());
  const [consumerId, setConsumerId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [context, setContext] = useState(null);
  const [openIncident, setOpenIncident] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  useEffect(() => {
    requestedConsumerIdRef.current = requestedConsumerId;
  }, [requestedConsumerId]);

  const selectedConsumer = useMemo(
    () => consumers.find((consumer) => String(consumer.id) === String(consumerId)) ?? null,
    [consumers, consumerId],
  );

  const hasUnsavedEntry =
    !openIncident &&
    (form.oldFinalReading !== "" ||
      form.newMeterSerial !== "" ||
      form.newBaseline !== "0");

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
      const hasMeterChange = meterChangedConsumerIds.has(String(consumer.id));
      const matchesMeter = meterFilter === "all" || hasMeterChange;
      return matchesSearch && matchesPurok && matchesMeter;
    });
  }, [consumers, meterChangedConsumerIds, meterFilter, purok, query]);

  const loadDirectory = useCallback(async (isActive = () => true) => {
    if (!isActive()) return;
    try {
      setLoading(true);
      setLoadError("");
      setMeterFilterError("");
      const loadIncidents = (status) =>
        fetchMeterIncidents({ status, limit: 500 }).catch((error) => {
          if (isActive()) {
            setMeterFilterError(
              requestMessage(error, "Unable to load the meter-change list."),
            );
          }
          return [];
        });
      const [directory, pendingIncidents, authorizedIncidents] = await Promise.all([
        fetchConsumerDirectory(),
        loadIncidents("pending"),
        loadIncidents("authorized"),
      ]);
      if (!isActive()) return;
      setConsumers(directory);
      const prefillConsumerId = requestedConsumerIdRef.current;
      if (!prefillHandledRef.current && prefillConsumerId) {
        prefillHandledRef.current = true;
        const requestedConsumer = directory.find(
          (consumer) => String(consumer.id) === prefillConsumerId && consumer.status === "active",
        );
        if (requestedConsumer) {
          setConsumerId(String(requestedConsumer.id));
          setForm(emptyForm());
          setOpenIncident(null);
          setContext(null);
          setLookupLoading(true);
        }
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete("consumerId");
          return next;
        }, { replace: true });
      }
      setMeterChangedConsumerIds(
        new Set(
          [...pendingIncidents, ...authorizedIncidents]
            .filter(isOpenMeterChangeIncident)
            .map((incident) => String(incident.consumerId)),
        ),
      );

    } catch (requestError) {
      if (isActive()) {
        setLoadError(requestMessage(requestError, "Unable to load the resident directory."));
      }
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [setSearchParams]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => loadDirectory(() => active));
    return () => {
      active = false;
    };
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
        setOpenIncident(openIncidentOf(incidents));
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

  const selectResident = useCallback((consumer) => {
    setConsumerId(String(consumer.id));
    setForm(emptyForm());
    setOpenIncident(null);
    setContext(null);
    setLookupLoading(true);
  }, []);

  const closeEntry = () => {
    if (saving) return;
    setConsumerId("");
    setForm(emptyForm());
    setOpenIncident(null);
    setContext(null);
    setIsDiscardConfirmOpen(false);
  };

  // Closing the replacement form asks first when there is already typed input,
  // matching the resident registration form.
  const requestCloseEntry = () => {
    if (saving) return;
    if (hasUnsavedEntry) {
      setIsDiscardConfirmOpen(true);
      return;
    }
    closeEntry();
  };

  const discardEntry = () => {
    setIsDiscardConfirmOpen(false);
    closeEntry();
  };

  const updateForm = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateDecimalForm = (field) => (event) => {
    const { value } = event.target;
    if (!acceptsDecimal(value)) return;
    setForm((current) => ({ ...current, [field]: value }));
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
  const previousConsumption = context?.latestConsumption ?? null;
  const usesLatestReadingFallback =
    lastRecorded != null &&
    (form.oldFinalReading === "" ||
      (Number.isFinite(Number(form.oldFinalReading)) &&
        Number(form.oldFinalReading) < Number(lastRecorded)));
  const usesPreviousConsumption =
    closingDerived === 0 && lastRecorded != null;
  const carried = usesPreviousConsumption
    ? Number(previousConsumption ?? 0)
    : usesLatestReadingFallback
      ? null
      : closingDerived;

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!consumerId) {
      toast.error("Resident required", "Select the resident whose meter changed.");
      return;
    }
    if (carried != null && !Number.isFinite(carried)) {
      toast.error(
        "Invalid closing reading",
        "Enter a valid old meter closing reading.",
      );
      return;
    }

    const payload = {
      consumerId: Number(consumerId),
      incidentType: "replacement",
      oldFinalReading: form.oldFinalReading,
      newMeterSerial: form.newMeterSerial,
      newBaseline: baselineValue,
    };

    try {
      setSaving(true);
      const saved = await logMeterIncident(payload);
      if (saved?.warning) {
        toast.warning("Meter replacement saved", saved.warning);
      } else {
        toast.success(
          "Meter replacement recorded",
          "The next reading will carry this usage automatically.",
        );
      }
      setOpenIncident(saved);
      setMeterChangedConsumerIds((current) => {
        const next = new Set(current);
        const savedConsumerId = String(saved?.consumerId ?? consumerId);
        if (isOpenMeterChangeIncident(saved)) {
          next.add(savedConsumerId);
        } else {
          next.delete(savedConsumerId);
        }
        return next;
      });
    } catch (requestError) {
      toast.error(
        "Replacement not saved",
        requestMessage(requestError, "Unable to save the meter replacement."),
      );
    } finally {
      setSaving(false);
    }
  };

  const hasSearchFilters = Boolean(query.trim()) || purok !== "all";
  const isFiltered = hasSearchFilters || meterFilter !== "all";

  return (
    <main className="space-y-4 sm:space-y-6">
      <PageHeader
        description="Record a meter replacement at any time. The monthly reading picks it up automatically."
        title="Record Meter Replacement"
      />

      {loadError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>{loadError}</span>
          <button className="font-bold underline" onClick={() => loadDirectory()} type="button">Try again</button>
        </div>
      )}

      <div aria-label="Resident directory controls" className="flex items-center gap-2 sm:hidden" role="search">
        {mobileSearchOpen ? (
          <>
            <Search
              ariaLabel="Search residents by name, account number, or purok"
              className="min-w-0 flex-1 [&_input]:min-h-11 [&_input]:py-2"
              disabled={loading}
              onValueChange={setQuery}
              placeholder="Search name, account number, or purok"
              value={query}
            />
            <button
              aria-label="Close search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              onClick={() => setMobileSearchOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            <Dropdown
              ariaLabel="Filter residents by purok"
              className="min-w-0 flex-1"
              compact
              disabled={loading}
              name="incidentPurokMobile"
              onValueChange={setPurok}
              options={purokOptions}
              value={purok}
            />
            <Dropdown
              ariaLabel="Filter residents by meter status"
              className="min-w-0 flex-1"
              compact
              disabled={loading}
              name="incidentMeterFilterMobile"
              onValueChange={setMeterFilter}
              options={METER_FILTER_OPTIONS}
              value={meterFilter}
            />
            <button
              aria-label={query ? `Search residents, current search: ${query}` : "Search residents"}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-navy-900 transition-colors hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              onClick={() => setMobileSearchOpen(true)}
              type="button"
            >
              <SearchIcon aria-hidden="true" className="h-5 w-5" />
              {query && <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-water-600" />}
            </button>
          </>
        )}
      </div>

      <div aria-label="Resident directory controls" className="hidden items-center gap-2 sm:flex" role="search">
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
          className="w-full shrink-0 sm:w-40"
          disabled={loading}
          name="incidentPurok"
          onValueChange={setPurok}
          options={purokOptions}
          triggerClassName="border-slate-200 bg-white text-navy-900 shadow-sm"
          value={purok}
        />
        <Dropdown
          ariaLabel="Filter residents by meter status"
          className="w-full shrink-0 sm:w-52"
          disabled={loading}
          name="incidentMeterFilter"
          onValueChange={setMeterFilter}
          options={METER_FILTER_OPTIONS}
          triggerClassName="border-slate-200 bg-white text-navy-900 shadow-sm"
          value={meterFilter}
        />
      </div>

      <p className="px-1 text-xs font-semibold text-water-700">
        {meterFilter === "changed"
          ? "Showing residents with a meter change waiting for their next reading."
          : "Showing all residents, including those with a meter change."}
      </p>

      {meterFilterError && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
          role="alert"
        >
          {meterFilterError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold text-slate-500">
          {loading
            ? "Loading residents…"
            : `${matchingConsumers.length} of ${consumers.length} resident${consumers.length === 1 ? "" : "s"}${meterFilter === "changed" ? " with a meter change" : ""}${hasSearchFilters ? " matching" : ""}`}
        </p>
        {isFiltered && (
          <button
            className="text-xs font-bold text-water-700 hover:underline"
            onClick={() => {
              setQuery("");
              setPurok("all");
              setMeterFilter("all");
            }}
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton label="Loading residents" variant="list" />
      ) : (
        <ResidentIncidentList
          consumers={matchingConsumers}
          meterChangedConsumerIds={meterChangedConsumerIds}
          onSelect={selectResident}
        />
      )}

      <Modal
        closeLabel={openIncident ? "Close meter replacement details" : "Close meter replacement form"}
        closeOnOverlay={false}
        description={
          openIncident
            ? "This replacement is already recorded and will be applied at the next reading."
            : "Record a replacement so the next reading carries the old meter's usage."
        }
        dismissible={!saving}
        eyebrow="Field operations"
        isOpen={Boolean(selectedConsumer)}
        onClose={requestCloseEntry}
        showCloseButton={false}
        size="md"
        title={openIncident ? "Meter replacement details" : "Record meter replacement"}
      >
        {!selectedConsumer ? null : lookupLoading ? (
          <div className="space-y-4 p-5 sm:p-6">
            <p className="text-sm font-semibold text-slate-500">
              Checking the resident's meter history…
            </p>
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <button
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50"
                onClick={requestCloseEntry}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : openIncident ? (
          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-bold text-navy-900">Resident</p>
              <p className="mt-1 text-xs text-slate-600">
                {selectedConsumer.consumerName} · Account {selectedConsumer.consumerNo} · {selectedConsumer.purok}
              </p>
            </div>
            <div className="rounded-xl border border-water-200 bg-water-50 p-4 text-sm">
              <p className="flex items-center gap-2 font-bold text-navy-900">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                Meter replacement recorded
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                This replacement is already logged. It will be applied automatically at the next reading.
              </p>
              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-500">Status</dt>
                  <dd className="mt-0.5 font-bold text-navy-900">
                    {INCIDENT_STATUS_LABELS[openIncident.status] ?? openIncident.status}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Effective date</dt>
                  <dd className="mt-0.5 font-bold text-navy-900">{formatDate(openIncident.effectiveDate)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Old meter closing reading</dt>
                  <dd className="mt-0.5 font-mono font-bold tabular-nums text-navy-900">
                    {openIncident.oldFinalReading == null
                      ? "Unknown — latest reading used"
                      : `${Number(openIncident.oldFinalReading).toLocaleString()} m³`}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Carried over</dt>
                  <dd className="mt-0.5 font-mono font-bold tabular-nums text-navy-900">
                    {Number(openIncident.priorUsage).toLocaleString()} m³
                    <span className="ml-1 font-sans font-semibold text-slate-500">
                      · {PRIOR_USAGE_BASIS_LABELS[openIncident.priorUsageBasis] ?? openIncident.priorUsageBasis}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">New meter serial</dt>
                  <dd className="mt-0.5 font-bold text-navy-900">{openIncident.newMeterSerial || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">New baseline</dt>
                  <dd className="mt-0.5 font-mono font-bold tabular-nums text-navy-900">
                    {Number(openIncident.newBaseline).toLocaleString()} m³
                  </dd>
                </div>
              </dl>
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
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="flex min-w-0 flex-1 items-center gap-3">
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
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Latest recorded reading
                  </span>
                  <span className="mt-0.5 block font-mono text-sm font-extrabold tabular-nums text-navy-900">
                    {context?.latestPresentReading == null
                      ? "none"
                      : `${Number(context.latestPresentReading).toLocaleString()} m³`}
                  </span>
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-slate-700">
                  Old meter closing reading
                  <input
                    className="ww-field mt-2 p-3 font-mono tabular-nums"
                    inputMode="decimal"
                    onChange={updateDecimalForm("oldFinalReading")}
                    placeholder="e.g. 470"
                    type="text"
                    value={form.oldFinalReading}
                  />
                  <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                    {lastRecorded == null
                      ? "Optional. Enter the final value shown by the old meter."
                      : `Optional. Latest recorded reading: ${Number(lastRecorded).toLocaleString()} m³. A blank or lower value uses the latest reading as the fallback and records this in the audit note.`}
                  </span>
                  {usesLatestReadingFallback && form.oldFinalReading !== "" && (
                    <span className="mt-1.5 block text-xs font-bold text-amber-700" role="status">
                      Lower old closing detected. The latest recorded reading will be used as the fallback.
                    </span>
                  )}
                  {closingDerived != null && !usesLatestReadingFallback && (
                    <span className="mt-1.5 block text-xs font-semibold text-water-800">
                      {usesPreviousConsumption
                        ? `Carried usage: ${Number(carried).toLocaleString()} m³ from the previous consumption.`
                        : `Carried usage: ${Number(carried).toLocaleString()} m³ from the closing-reading difference.`}
                    </span>
                  )}
                </label>
              </div>
              <label className="block text-sm font-bold text-slate-700">
                New meter serial
                <input className="ww-field mt-2 p-3" onChange={updateForm("newMeterSerial")} placeholder="Optional" type="text" value={form.newMeterSerial} />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                New meter baseline
                <input className="ww-field mt-2 p-3 font-mono tabular-nums" inputMode="decimal" onChange={updateDecimalForm("newBaseline")} placeholder="0" type="text" value={form.newBaseline} />
                <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                  The first value printed on the new meter. Use 0 when it starts at zero.
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-water-200 bg-water-50 p-3 text-xs leading-5 text-slate-700">
              {usesLatestReadingFallback ? (
                <>The latest recorded reading of <strong>{Number(lastRecorded).toLocaleString()} m³</strong> will be used automatically as the old closing-reading fallback.</>
              ) : carried == null ? (
                <>A previous reading is required before the system can apply the fallback.</>
              ) : usesPreviousConsumption ? (
                <>The closing reading is equal to or below the latest reading, so the previous consumption of <strong>{Number(carried).toLocaleString()} m³</strong> will be carried.</>
              ) : (
                <>
                  This carries
                  <span className="mx-1 font-mono font-bold text-navy-900">{Number(carried).toLocaleString()} m³</span>
                  into the next reading automatically.
                </>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50 disabled:opacity-60"
                disabled={saving}
                onClick={requestCloseEntry}
                type="button"
              >
                Cancel
              </button>
              <button className="ww-primary-button min-h-11 px-5 text-sm" disabled={saving || lookupLoading} type="submit">
                {saving ? "Saving…" : "Save replacement"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <DiscardChangesDialog
        description="Are you sure you want to discard the changes to this meter replacement?"
        isOpen={isDiscardConfirmOpen}
        onDiscard={discardEntry}
        onKeepEditing={() => setIsDiscardConfirmOpen(false)}
      />
    </main>
  );
}
