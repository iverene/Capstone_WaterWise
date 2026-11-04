import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
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
import ConsumptionReceiptModal from "../components/ConsumptionReceiptModal";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import { useToast } from "../components/Toast";
import { fetchConsumerDirectory } from "../services/consumerDirectoryAPI";
import {
  createMeterReading,
  fetchRecordingContext,
  fetchRecordingContexts,
} from "../services/meterReadingAPI";
import {
  cacheIncidentContexts,
  getCachedIncidentContexts,
  getPendingMeterIncidents,
  queueMeterIncident,
} from "../services/offlineMeterReadings";
import {
  createMeterIncidentRequestKey,
  fetchConsumerMeterIncidents,
  fetchMeterIncidents,
  logMeterIncident,
} from "../services/meterIncidentAPI";
import { TIER_DEFAULTS, breakdownTieredBill, computeTieredBill } from "../utils/waterBill";

const requestMessage = (error, fallback) =>
  error?.response?.data?.message ?? error.message ?? fallback;

const recordedAt = (timestamp, readingDate) => {
  const format = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
  if (timestamp && !Number.isNaN(Date.parse(timestamp))) return format.format(new Date(timestamp));
  if (readingDate) {
    const dateOnly = new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeZone: "Asia/Manila",
    }).format(new Date(`${readingDate}T00:00:00+08:00`));
    return `${dateOnly} · Time unavailable`;
  }
  return "Timestamp unavailable";
};

const consumptionReceiptData = (consumerName, receipt) => ({
  meterName: consumerName,
  runDate: recordedAt(receipt.createdAt, receipt.readingDate),
  previousReading: receipt.previousReading,
  presentReading: receipt.currentReading,
  consumption: receipt.consumption,
  readingSource: receipt.readingSource ?? "actual",
  carriedConsumption: Number(receipt.carriedConsumption ?? 0),
  newBaseline: receipt.newBaseline ?? null,
  baselineBill: receipt.baselineBill ?? computeTieredBill(receipt.consumption, TIER_DEFAULTS),
  billBreakdown: receipt.billBreakdown ?? breakdownTieredBill(receipt.consumption, TIER_DEFAULTS),
  arrears30Days: Number(receipt.arrears30Days ?? 0),
  arrears60Days: Number(receipt.arrears60Days ?? 0),
  arrears90Days: Number(receipt.arrears90Days ?? 0),
});

const receiptFromContext = (context) => context.currentMonthReceipt ?? {
  createdAt: context.latestCreatedAt,
  readingDate: context.latestReadingDate,
  previousReading: context.latestPreviousReading ?? (Number(context.latestPresentReading ?? 0) - Number(context.latestConsumption ?? 0)),
  currentReading: Number(context.latestPresentReading ?? 0),
  consumption: Number(context.latestConsumption ?? 0),
};

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
  const [sameDayRecording, setSameDayRecording] = useState(false);
  const [sameDayReading, setSameDayReading] = useState("");
  const [sameDayReview, setSameDayReview] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptResidentName, setReceiptResidentName] = useState("");
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

  const sameDayBaseline = Number(form.newBaseline || 0);
  const sameDayCurrent = Number(sameDayReading);
  const sameDayHasValue = sameDayReading !== "" && Number.isFinite(sameDayCurrent);
  const latestReading = Number(
    context?.latestPresentReading ??
      selectedConsumer?.latestPresentReading ??
      0,
  );
  const previousConsumption = Number(
    context?.latestConsumption ??
      selectedConsumer?.latestConsumption ??
      0,
  );
  const sameDayCarry = Number.isFinite(Number(form.oldFinalReading)) &&
    Number(form.oldFinalReading) > latestReading
    ? Number(form.oldFinalReading) - latestReading
    : previousConsumption;
  const sameDayMeterUsage = sameDayHasValue
    ? Number((sameDayCurrent - sameDayBaseline).toFixed(2))
    : 0;
  const sameDayConsumption = sameDayHasValue
    ? Math.max(0, Number((sameDayCarry + sameDayMeterUsage).toFixed(2)))
    : 0;
  const sameDayEstimatedBill = computeTieredBill(sameDayConsumption, TIER_DEFAULTS);

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

  const loadDirectory = useCallback(async (isActive = () => true, { showLoading = true } = {}) => {
    if (!isActive()) return;
    const applyCachedDirectory = async () => {
      const cached = await getCachedIncidentContexts();
      const pendingOffline = await getPendingMeterIncidents();
      if (!isActive()) return false;
      if (!cached?.contexts?.length) return false;
      const pendingByConsumer = new Map(
        pendingOffline.map((incident) => [String(incident.consumerId), incident]),
      );
      setConsumers(cached.contexts.map((consumer) => {
        const pending = pendingByConsumer.get(String(consumer.id));
        return pending
          ? { ...consumer, hasPendingIncident: true, openIncident: pending }
          : consumer;
      }));
      setMeterChangedConsumerIds(new Set(pendingOffline.map((incident) => String(incident.consumerId))));
      setLoadError("");
      return true;
    };
    try {
      if (showLoading) setLoading(true);
      setLoadError("");
      setMeterFilterError("");
      if (!navigator.onLine) {
        const loadedFromCache = await applyCachedDirectory();
        if (!loadedFromCache) {
          setLoadError("Connect once to download the resident directory for offline use.");
        }
        return;
      }
      const loadIncidents = (status) =>
        fetchMeterIncidents({ status, limit: 500 }).catch((error) => {
          if (isActive()) {
            setMeterFilterError(
              requestMessage(error, "Unable to load the meter-change list."),
            );
          }
          return [];
        });
      const [directory, recordingContexts, pendingIncidents, authorizedIncidents] = await Promise.all([
        fetchConsumerDirectory(),
        fetchRecordingContexts().catch(() => []),
        loadIncidents("pending"),
        loadIncidents("authorized"),
      ]);
      if (!isActive()) return;
      const contextByConsumerId = new Map(
        recordingContexts.map((record) => [String(record.id), record]),
      );
      const cachedDirectory = directory.map((consumer) => ({
        ...consumer,
        ...(contextByConsumerId.get(String(consumer.id)) ?? {}),
      }));
      if (recordingContexts.length) {
        await cacheIncidentContexts(recordingContexts);
      }
      const pendingOffline = await getPendingMeterIncidents();
      const pendingByConsumer = new Map(
        pendingOffline.map((incident) => [String(incident.consumerId), incident]),
      );
      setConsumers(cachedDirectory.map((consumer) => {
        const pending = pendingByConsumer.get(String(consumer.id));
        return pending
          ? { ...consumer, hasPendingIncident: true, openIncident: pending }
          : consumer;
      }));
      const prefillConsumerId = requestedConsumerIdRef.current;
      if (!prefillHandledRef.current && prefillConsumerId) {
        prefillHandledRef.current = true;
        const requestedConsumer = cachedDirectory.find(
          (consumer) => String(consumer.id) === prefillConsumerId && consumer.status === "active",
        );
        if (requestedConsumer) {
          setConsumerId(String(requestedConsumer.id));
          setForm(emptyForm());
          setSameDayRecording(false);
          setSameDayReading("");
          setSameDayReview(false);
          setOpenIncident(null);
          setContext(null);
        }
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete("consumerId");
          return next;
        }, { replace: true });
      }
      setMeterChangedConsumerIds(
        new Set(
          [...pendingIncidents, ...authorizedIncidents, ...pendingOffline]
            .filter(isOpenMeterChangeIncident)
            .map((incident) => String(incident.consumerId)),
        ),
      );

    } catch (requestError) {
      if (isActive()) {
        const loadedFromCache = await applyCachedDirectory();
        if (!loadedFromCache) {
          setLoadError(requestMessage(requestError, "Connect once to download the resident directory for offline use."));
        }
      }
    } finally {
      if (showLoading && isActive()) setLoading(false);
    }
  }, [setSearchParams]);

  useEffect(() => {
    const handleTargetedRefresh = (event) => {
      if (event.detail?.path === "/meter-reader/meter-incidents" && !hasUnsavedEntry && !saving) {
        void loadDirectory(() => true, { showLoading: false });
      }
    };
    window.addEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    return () => window.removeEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
  }, [hasUnsavedEntry, loadDirectory, saving]);

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
    if (!navigator.onLine) {
      queueMicrotask(() => {
        setContext(selectedConsumer);
        setOpenIncident(selectedConsumer?.openIncident ?? null);
      });
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
      });

    return () => {
      active = false;
    };
  }, [consumerId, selectedConsumer]);

  const selectResident = useCallback((consumer) => {
    setConsumerId(String(consumer.id));
    setForm(emptyForm());
    setSameDayRecording(false);
    setSameDayReading("");
    setSameDayReview(false);
    setOpenIncident(null);
    if (navigator.onLine) {
      setContext(null);
    } else {
      setContext(consumer);
      setOpenIncident(consumer.openIncident ?? null);
    }
  }, []);

  const closeEntry = () => {
    if (saving) return;
    setConsumerId("");
    setForm(emptyForm());
    setSameDayRecording(false);
    setSameDayReading("");
    setSameDayReview(false);
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

  const activeContext = context ?? selectedConsumer;
  const lastRecorded = activeContext?.latestPresentReading ?? null;

  const closingDerived = useMemo(() => {
    if (form.oldFinalReading === "") return null;
    const entered = Number(form.oldFinalReading);
    if (!Number.isFinite(entered)) return null;
    if (lastRecorded == null) return entered;
    return Math.round((entered - Number(lastRecorded)) * 100) / 100;
  }, [form.oldFinalReading, lastRecorded]);
  const baselineValue = form.newBaseline === "" ? 0 : Number(form.newBaseline);
  const usesLatestReadingFallback =
    lastRecorded != null &&
    (form.oldFinalReading === "" ||
      (Number.isFinite(Number(form.oldFinalReading)) &&
        Number(form.oldFinalReading) < Number(lastRecorded)));
  const hasZeroMovement = closingDerived === 0 && lastRecorded != null;
  const carried = usesLatestReadingFallback || hasZeroMovement
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
    if (sameDayRecording) {
      if (!navigator.onLine) {
        toast.error(
          "Same-day recording requires internet",
          "Reconnect before recording the replacement and its consumption together.",
        );
        return;
      }
      if (sameDayReading === "" || !Number.isFinite(Number(sameDayReading))) {
        toast.error(
          "New meter reading required",
          "Enter the new meter reading before recording same-day consumption.",
        );
        return;
      }
      setSameDayReview(true);
      return;
    }

    let incidentSaved = false;
    try {
      setSaving(true);
      const payload = {
        consumerId: Number(consumerId),
        incidentType: "replacement",
        idempotencyKey: createMeterIncidentRequestKey(),
        oldFinalReading: form.oldFinalReading,
        newMeterSerial: form.newMeterSerial,
        newBaseline: baselineValue,
      };
      if (!navigator.onLine) {
        await queueMeterIncident({
          ...payload,
          consumerName: selectedConsumer?.consumerName ?? "Resident",
        });
        window.dispatchEvent(new Event("waterwise:offline-queue-changed"));
        setMeterChangedConsumerIds((current) => new Set(current).add(String(payload.consumerId)));
        setConsumers((current) => current.map((consumer) => consumer.id === payload.consumerId ? {
          ...consumer,
          hasPendingIncident: true,
          openIncident: { ...payload, status: "pending" },
        } : consumer));
        setConsumerId("");
        setForm(emptyForm());
        setOpenIncident(null);
        setContext(null);
        toast.success(
          "Meter incident saved offline",
          `${selectedConsumer?.consumerName ?? "The resident"}'s incident will upload automatically when the device reconnects.`,
        );
        return;
      }
      const saved = await logMeterIncident(payload);
      incidentSaved = true;
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
        incidentSaved ? "Consumption not recorded" : "Replacement not saved",
        requestMessage(
          requestError,
          incidentSaved
            ? "The replacement was saved, but same-day consumption could not be recorded. Please record the reading from Reading Entry."
            : "Unable to save the meter replacement.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmSameDayRecord = async () => {
    if (saving || !sameDayReview || !consumerId) return;
    let incidentSaved = false;
    try {
      setSaving(true);
      const payload = {
        consumerId: Number(consumerId),
        incidentType: "replacement",
        idempotencyKey: createMeterIncidentRequestKey(),
        oldFinalReading: form.oldFinalReading,
        newMeterSerial: form.newMeterSerial,
        newBaseline: baselineValue,
      };
      const saved = await logMeterIncident(payload);
      incidentSaved = true;
      const result = await createMeterReading({
        consumerId: Number(consumerId),
        currentReading: Number(sameDayReading),
        idempotencyKey: createMeterIncidentRequestKey(),
        incident: { id: saved.id },
      });
      toast.success(
        "Consumption recorded",
        "The replacement and same-day consumption were applied successfully.",
      );
      setConsumerId("");
      setForm(emptyForm());
      setOpenIncident(null);
      setSameDayRecording(false);
      setSameDayReading("");
      setSameDayReview(false);
      setContext(null);
      setReceiptResidentName(selectedConsumer?.consumerName ?? "Resident");
      setReceiptData(null);
      setReceiptLoading(true);
      try {
        const receiptContext = await fetchRecordingContext(consumerId);
        setReceiptData(consumptionReceiptData(
          selectedConsumer?.consumerName ?? "Resident",
          receiptFromContext(receiptContext),
        ));
      } catch {
        setReceiptData(consumptionReceiptData(
          selectedConsumer?.consumerName ?? "Resident",
          {
            ...result,
            baselineBill: result.billing?.totalBill,
          },
        ));
      } finally {
        setReceiptLoading(false);
      }
    } catch (requestError) {
      toast.error(
        incidentSaved ? "Consumption not recorded" : "Replacement not saved",
        requestMessage(
          requestError,
          incidentSaved
            ? "The replacement was saved, but same-day consumption could not be recorded."
            : "Unable to save the replacement.",
        ),
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
        closeLabel={sameDayReview ? "Close same-day reading review" : openIncident ? "Close meter replacement details" : "Close meter replacement form"}
        closeOnOverlay={false}
        description={
          sameDayReview
            ? "Review the new meter reading and estimated bill before confirming the same-day record."
            : openIncident
            ? "This replacement is already recorded and will be applied at the next reading."
            : "Record a replacement so the next reading carries the old meter's usage."
        }
        dismissible={!saving}
        eyebrow="Field operations"
        isOpen={Boolean(selectedConsumer)}
        onClose={requestCloseEntry}
        showCloseButton={false}
        size="md"
        title={sameDayReview ? "Review same-day reading" : openIncident ? "Meter replacement details" : "Record meter replacement"}
      >
        {!selectedConsumer ? null : sameDayReview ? (
          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-bold text-navy-900">Resident</p>
              <p className="mt-1 text-xs text-slate-600">
                {selectedConsumer.consumerName} · Account {selectedConsumer.consumerNo} · {selectedConsumer.purok}
              </p>
            </div>
            <div className="rounded-2xl border border-water-200 bg-water-50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-water-700">
                  <CalendarClock aria-hidden="true" className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-navy-900">Date and time are automatic</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    The system records the exact timestamp when you confirm.
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3">
                  <dt className="text-xs font-semibold text-slate-500">New meter baseline</dt>
                  <dd className="mt-1 font-mono font-extrabold tabular-nums text-navy-900">{sameDayBaseline.toLocaleString()} m³</dd>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <dt className="text-xs font-semibold text-slate-500">New meter reading</dt>
                  <dd className="mt-1 font-mono font-extrabold tabular-nums text-navy-900">{sameDayCurrent.toLocaleString()} m³</dd>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <dt className="text-xs font-semibold text-slate-500">Old meter carried</dt>
                  <dd className="mt-1 font-mono font-extrabold tabular-nums text-navy-900">{sameDayCarry.toLocaleString()} m³</dd>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <dt className="text-xs font-semibold text-slate-500">New meter usage</dt>
                  <dd className="mt-1 font-mono font-extrabold tabular-nums text-navy-900">{sameDayMeterUsage.toLocaleString()} m³</dd>
                </div>
              </dl>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3">
                  <p className="text-xs font-bold text-water-700">Calculated consumption</p>
                  <p className="mt-0.5 font-mono text-xl font-extrabold tabular-nums text-water-800">{sameDayConsumption.toLocaleString()} m³</p>
                </div>
                <div className="rounded-xl bg-navy-950 p-3">
                  <p className="text-xs font-bold text-water-200">Estimated bill</p>
                  <p className="mt-0.5 font-mono text-xl font-extrabold tabular-nums text-white">
                    ₱{sameDayEstimatedBill.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Nothing has been saved yet. Confirming will save the replacement, create the reading, and apply the consumption to this incident.
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50 disabled:opacity-60"
                disabled={saving}
                onClick={closeEntry}
                type="button"
              >
                Cancel
              </button>
              <button
                className="ww-primary-button min-h-12 w-full touch-manipulation px-5 text-sm sm:min-h-11 sm:w-auto"
                disabled={saving}
                onClick={() => void confirmSameDayRecord()}
                type="button"
              >
                {saving ? "Recording…" : "Confirm record"}
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
                    {activeContext?.latestPresentReading == null
                      ? "none"
                      : `${Number(activeContext.latestPresentReading).toLocaleString()} m³`}
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
                      {hasZeroMovement
                        ? "Carry basis will be finalized when the reading entry is recorded."
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
              ) : hasZeroMovement ? (
                <>The closing reading is equal to or below the latest reading. Previous consumption is used only when the reading entry is recorded on the same calendar day as the effective date; otherwise the date-based fallback rule applies.</>
              ) : (
                <>
                  This carries
                  <span className="mx-1 font-mono font-bold text-navy-900">{Number(carried).toLocaleString()} m³</span>
                  into the next reading automatically.
                </>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <button
                className="w-full rounded-xl border border-water-300 bg-water-50 px-4 py-3 text-left text-sm font-bold text-water-800 hover:bg-water-100"
                onClick={() => setSameDayRecording((current) => !current)}
                type="button"
              >
                {sameDayRecording ? "Hide same-day consumption" : "Record Consumption (Same Day)"}
              </button>
              {sameDayRecording && (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                  <div className="rounded-xl border border-water-200 bg-water-50 p-3 text-xs leading-5 text-water-900">
                    This records the first reading of the new meter today. The old meter&apos;s applicable carry will be added automatically.
                  </div>
                  <label className="block text-sm font-bold text-slate-700">
                    New meter reading
                    <input
                      autoFocus
                      className="ww-field mt-2 p-3 font-mono tabular-nums"
                      inputMode="decimal"
                      onChange={(event) => {
                        if (acceptsDecimal(event.target.value)) setSameDayReading(event.target.value);
                      }}
                      placeholder="Type meter value"
                      required
                      type="text"
                      value={sameDayReading}
                    />
                    <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                      Use the value shown on the new meter. The baseline is {baselineValue.toLocaleString()} m³.
                    </span>
                  </label>
                  <div className="rounded-2xl border border-water-200 bg-water-50 p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-water-700">
                        <CalendarClock aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-bold text-navy-900">Date and time are automatic</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          The system records the exact timestamp when you confirm.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs font-bold text-water-700">Calculated consumption</p>
                        <p className="mt-0.5 font-mono text-xl font-extrabold tabular-nums text-water-800">
                          {sameDayConsumption.toLocaleString()} m³
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">
                          {sameDayCarry.toLocaleString()} m³ carried + {sameDayMeterUsage.toLocaleString()} m³ new meter
                        </p>
                      </div>
                      <div className="rounded-xl bg-navy-950 p-3">
                        <p className="text-xs font-bold text-water-200">Estimated bill</p>
                        <p className="mt-0.5 font-mono text-xl font-extrabold tabular-nums text-white">
                          ₱{sameDayEstimatedBill.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
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
              <button
                className="ww-primary-button min-h-12 w-full touch-manipulation px-5 text-sm sm:min-h-11 sm:w-auto"
                disabled={saving}
                onClick={(event) => void submit(event)}
                type="button"
              >
                {saving ? "Saving…" : sameDayRecording ? "Review replacement" : "Save replacement"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConsumptionReceiptModal
        isOpen={receiptLoading || Boolean(receiptData)}
        loading={receiptLoading}
        onClose={() => {
          setReceiptData(null);
          setReceiptLoading(false);
        }}
        receiptData={receiptData}
        residentName={receiptResidentName}
      />

      <DiscardChangesDialog
        description="Are you sure you want to discard the changes to this meter replacement?"
        isOpen={isDiscardConfirmOpen}
        onDiscard={discardEntry}
        onKeepEditing={() => setIsDiscardConfirmOpen(false)}
      />
    </main>
  );
}
