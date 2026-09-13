import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConsumerSelectionList from "../components/ConsumerSelectionList";
import ConsumptionEntryPanel from "../components/ConsumptionEntryPanel";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import ConsumptionReceiptModal from "../components/ConsumptionReceiptModal";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import { useToast } from "../components/Toast";
import { createMeterReading, fetchRecordingContext, fetchRecordingContexts } from "../services/meterReadingAPI";
import { cacheRecordingContexts, getCachedRecordingContexts, getPendingMeterReadings, queueMeterReading, syncPendingMeterReadings } from "../services/offlineMeterReadings";
import { fetchSystemSetting } from "../services/systemSettingsService";

const requestMessage = (error, fallback) => error?.response?.data?.message ?? error.message ?? fallback;

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

const consumptionReceiptData = (consumerName, receipt, rate = 15) => ({
  meterName: consumerName,
  runDate: recordedAt(receipt.createdAt, receipt.readingDate),
  previousReading: receipt.previousReading,
  presentReading: receipt.currentReading,
  baselineBill: receipt.baselineBill ?? receipt.consumption * rate,
  arrears30Days: Number(receipt.arrears30Days ?? 0),
  arrears60Days: Number(receipt.arrears60Days ?? 0),
  arrears90Days: Number(receipt.arrears90Days ?? 0),
});

const receiptFromContext = (context, rate = 15) => context.currentMonthReceipt ?? {
  createdAt: context.latestCreatedAt,
  readingDate: context.latestReadingDate,
  previousReading: context.latestPreviousReading ?? (Number(context.latestPresentReading ?? 0) - Number(context.latestConsumption ?? 0)),
  currentReading: Number(context.latestPresentReading ?? 0),
  consumption: Number(context.latestConsumption ?? 0),
  baselineBill: Number(context.latestConsumption ?? 0) * rate,
};

export default function RecordConsumptionPage() {
  const toast = useToast();
  const [consumers, setConsumers] = useState([]);
  const [selectedConsumer, setSelectedConsumer] = useState(null);
  const [query, setQuery] = useState("");
  const [purok, setPurok] = useState("all");
  const [recordStatus, setRecordStatus] = useState("all");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapperRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptResidentName, setReceiptResidentName] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [showSynced, setShowSynced] = useState(false);
  const [rate, setRate] = useState(15);
  const prevPendingRef = useRef(pendingCount);

  useEffect(() => {
    fetchSystemSetting("rate_per_cubic_meter")
      .then((setting) => {
        const value = Number(setting?.setting_value);
        if (Number.isFinite(value) && value > 0) setRate(value);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const prev = prevPendingRef.current;
    prevPendingRef.current = pendingCount;
    if (isOnline && !syncing && prev > 0 && pendingCount === 0) {
      setShowSynced(true);
      const timer = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncing, pendingCount]);

  useEffect(() => {
    if (!searchFocused) return;
    const handleClickOutside = (event) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchFocused]);

  const applyPendingState = useCallback(async (contexts) => {
    const pending = await getPendingMeterReadings();
    setPendingCount(pending.length);
    const pendingIds = new Set(pending.map((reading) => reading.consumerId));
    return contexts.map((consumer) => pendingIds.has(consumer.id) ? {
      ...consumer,
      canRecord: false,
      hasPendingReading: true,
      recordingBlockReason: "Reading saved on this device and waiting to sync.",
    } : consumer);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const contexts = await fetchRecordingContexts();
      await cacheRecordingContexts(contexts);
      setConsumers(await applyPendingState(contexts));
    } catch (requestError) {
      setLoadError(requestMessage(requestError, "Unable to load residents and reading status."));
    } finally {
      setLoading(false);
    }
  }, [applyPendingState]);

  useEffect(() => {
    const controller = new AbortController();
    fetchRecordingContexts({ signal: controller.signal })
      .then(async (contexts) => { await cacheRecordingContexts(contexts); setConsumers(await applyPendingState(contexts)); })
      .catch(async (requestError) => {
        if (requestError.name !== "CanceledError") {
          const cached = await getCachedRecordingContexts();
          if (cached?.contexts?.length) {
            setConsumers(await applyPendingState(cached.contexts));
            setLoadError("");
          } else setLoadError(requestMessage(requestError, "Connect once to download the resident route for offline use."));
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [applyPendingState]);

  useEffect(() => {
    const synchronize = async () => {
      setIsOnline(navigator.onLine);
      if (!navigator.onLine) return;
      setSyncing(true);
      const result = await syncPendingMeterReadings();
      setPendingCount(result.remaining);
      if (result.synced) {
        toast.success("Offline readings synced", `${result.synced} saved reading${result.synced === 1 ? "" : "s"} uploaded successfully.`);
        await loadData();
      } else if (result.remaining > 0) {
        toast.warning("Sync incomplete", `${result.remaining} reading${result.remaining === 1 ? "" : "s"} could not be uploaded. They will retry when connectivity improves.`);
      }
      setSyncing(false);
    };
    window.addEventListener("online", synchronize);
    window.addEventListener("offline", synchronize);
    synchronize();
    return () => { window.removeEventListener("online", synchronize); window.removeEventListener("offline", synchronize); };
  }, [loadData, toast]);

  const visibleConsumers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return consumers.filter((consumer) => {
      const matchesSearch = !term || [consumer.consumerName, consumer.consumerNo]
        .some((value) => String(value).toLowerCase().includes(term));
      const matchesPurok = purok === "all" || consumer.purok === purok;
      const matchesRecordStatus =
        recordStatus === "all" ||
        (recordStatus === "recorded"
          ? consumer.hasReadingInSelectedMonth
          : !consumer.hasReadingInSelectedMonth);
      return matchesSearch && matchesPurok && matchesRecordStatus;
    });
  }, [consumers, purok, query, recordStatus]);

  const purokOptions = useMemo(() => [
    { label: "All puroks", value: "all" },
    ...[...new Set(consumers.map((consumer) => consumer.purok).filter((value) => value !== "Unassigned"))]
      .sort((left, right) => Number(left.replace(/\D/g, "")) - Number(right.replace(/\D/g, "")))
      .map((value) => ({ label: value, value })),
  ], [consumers]);

  const selectConsumer = async (consumer) => {
    if (!navigator.onLine) {
      if (consumer.canRecord) setSelectedConsumer(consumer);
      return;
    }
    const expectsReceipt = consumer.hasReadingInSelectedMonth;
    try {
      setSelectingId(consumer.id);
      setLoadError("");
      setSaveError("");
      if (expectsReceipt) {
        setSelectedConsumer(null);
        setReceiptData(null);
        setReceiptResidentName(consumer.consumerName);
        setReceiptLoading(true);
      }
      const context = await fetchRecordingContext(consumer.id);
      if (consumer.hasReadingInSelectedMonth || context.hasReadingInSelectedMonth) {
        const receiptContext = context.hasReadingInSelectedMonth ? context : consumer;
        setReceiptData(consumptionReceiptData(
          receiptContext.consumerName,
          receiptFromContext(receiptContext, rate),
          rate,
        ));
        setReceiptResidentName(receiptContext.consumerName);
        setSelectedConsumer(null);
      } else if (!context.canRecord) {
        setSelectedConsumer(null);
        setLoadError(context.recordingBlockReason ?? "A new reading cannot be recorded for this resident today.");
      } else {
        setSelectedConsumer(context);
      }
    } catch (requestError) {
      if (expectsReceipt) {
        setReceiptData(consumptionReceiptData(consumer.consumerName, receiptFromContext(consumer, rate), rate));
      } else {
        setLoadError(requestMessage(requestError, "Unable to check the resident's latest reading."));
      }
    } finally {
      setSelectingId(null);
      setReceiptLoading(false);
    }
  };

  const saveReading = async (payload) => {
    try {
      setSaving(true);
      setSaveError("");
      if (!navigator.onLine) {
        await queueMeterReading(payload);
        setPendingCount((count) => count + 1);
        setConsumers((current) => current.map((consumer) => consumer.id === payload.consumerId ? { ...consumer, canRecord: false, hasPendingReading: true, recordingBlockReason: "Reading saved on this device and waiting to sync." } : consumer));
        setSelectedConsumer(null);
        toast.success("Reading saved offline", `${payload.consumerName}'s reading will upload automatically when the device reconnects.`);
        return { queued: true };
      }
      const result = await createMeterReading(payload);
      setConsumers((current) => current.map((consumer) => consumer.id === payload.consumerId ? {
        ...consumer,
        hasPreviousRecord: true,
        latestReadingId: result.id,
        latestReadingDate: result.readingDate,
        latestPresentReading: result.currentReading,
        latestConsumption: result.consumption,
        hasReadingInSelectedMonth: true,
      } : consumer));
      setSelectedConsumer(null);
      setReceiptData(null);
      setReceiptResidentName(payload.consumerName);
      setReceiptLoading(true);
      try {
        const receiptContext = await fetchRecordingContext(payload.consumerId);
        setReceiptData(consumptionReceiptData(
          payload.consumerName,
          receiptFromContext(receiptContext, rate),
          rate,
        ));
      } catch {
        setReceiptData(consumptionReceiptData(payload.consumerName, {
          ...result,
          baselineBill: result.billing?.totalBill,
        }, rate));
      } finally {
        setReceiptLoading(false);
      }
      toast.success("Meter reading recorded", `${payload.consumerName}'s ${result.consumption.toLocaleString()} m³ consumption and billing were saved.`);
      return result;
    } catch (requestError) {
      const message = requestMessage(requestError, "Unable to save the reading.");
      setSaveError(message);
      toast.error("Reading not recorded", message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const closeEntry = () => {
    if (saving) return;
    setSelectedConsumer(null);
    setSaveError("");
  };

  return (
    <main className="space-y-4 sm:space-y-6">
      <PageHeader description="Select a resident and type the cumulative meter value." eyebrow="Field workspace" mobileCompact title="Record a Meter Reading" />
      {(syncing || pendingCount > 0 || showSynced) && (
        <div className="rounded-xl border p-3 text-[13px] font-semibold sm:p-4 sm:text-sm border-water-200 bg-water-50 text-water-800" role="status">
          {syncing ? "Online · Syncing saved readings…" : pendingCount > 0 ? `${pendingCount} reading${pendingCount === 1 ? "" : "s"} waiting to sync` : "All readings synced"}
        </div>
      )}
      {loadError && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{loadError}</span><button className="font-bold underline" onClick={loadData} type="button">Try again</button></div>}
      <div aria-label="Resident directory controls" className="flex items-center gap-2" ref={searchWrapperRef} role="search">
        <Search ariaLabel="Search residents by name or account number" className={`min-w-0 transition-all duration-300 ease-in-out [&_input]:min-h-11 [&_input]:py-2 sm:[&_input]:min-h-12 sm:[&_input]:py-3 ${searchFocused ? "flex-1" : "w-1/2 sm:flex-1"}`} onBlur={() => setSearchFocused(false)} onFocus={() => setSearchFocused(true)} onValueChange={setQuery} placeholder="Search name or account number" value={query} />
        <div className={`shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${searchFocused ? "w-0 opacity-0" : "w-1/2 opacity-100 sm:w-auto sm:opacity-100"}`}>
          <Filter
            ariaLabel="Filter residents"
            buttonLabel="Filters"
            className="w-full"
            description="Choose which residents should be shown in this list."
            disabled={loading}
            filters={[
              {
                ariaLabel: "Filter residents by purok",
                className: "w-40",
                id: "resident-purok-filter",
                label: "Purok",
                name: "residentPurok",
                onValueChange: setPurok,
                options: purokOptions,
                value: purok,
              },
              {
                ariaLabel: "Filter residents by recording status",
                className: "w-52",
                id: "resident-recording-status-filter",
                label: "Recording status",
                name: "residentRecordingStatus",
                onValueChange: setRecordStatus,
                options: [
                  { label: "All residents", value: "all" },
                  { label: "Not yet recorded", value: "unrecorded" },
                  { label: "Recorded this month", value: "recorded" },
                ],
                value: recordStatus,
              },
            ]}
            title="Resident filters"
          />
        </div>
      </div>
      {loading ? <LoadingSkeleton label="Loading residents and reading status" variant="list" /> : <ConsumerSelectionList consumers={visibleConsumers} emptyDescription={consumers.length ? "Try a different search, purok, or recording status." : undefined} emptyTitle={consumers.length ? "No matching residents" : undefined} onSelect={selectConsumer} selectedId={selectedConsumer?.id} selectingId={selectingId} />}

      <Modal closeLabel="Close meter reading form" description={selectedConsumer ? `${selectedConsumer.consumerName} · ${selectedConsumer.purok}` : undefined} dismissible={!saving} eyebrow="Field operations" isOpen={Boolean(selectedConsumer)} onClose={closeEntry} showCloseButton={false} size="md" title="Record meter reading">
        {saveError && <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mx-6" role="alert">{saveError}</div>}
        <ConsumptionEntryPanel consumer={selectedConsumer} key={`${selectedConsumer?.id}-${selectedConsumer?.latestReadingId ?? "new"}`} onCancel={closeEntry} onSave={saveReading} saving={saving} />
      </Modal>
      <ConsumptionReceiptModal
        isOpen={receiptLoading || Boolean(receiptData)}
        loading={receiptLoading}
        onClose={() => { setReceiptData(null); setReceiptLoading(false); }}
        receiptData={receiptData}
        residentName={receiptResidentName}
      />
    </main>
  );
}
