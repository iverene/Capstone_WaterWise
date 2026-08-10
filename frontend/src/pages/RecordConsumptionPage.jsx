import { useCallback, useEffect, useMemo, useState } from "react";
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

const consumptionReceiptData = (consumerName, receipt) => ({
  meterName: consumerName,
  runDate: recordedAt(receipt.createdAt, receipt.readingDate),
  previousReading: receipt.previousReading,
  presentReading: receipt.currentReading,
  baselineBill: receipt.baselineBill ?? receipt.consumption * 15,
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
  baselineBill: Number(context.latestConsumption ?? 0) * 15,
};

export default function RecordConsumptionPage() {
  const toast = useToast();
  const [consumers, setConsumers] = useState([]);
  const [selectedConsumer, setSelectedConsumer] = useState(null);
  const [query, setQuery] = useState("");
  const [purok, setPurok] = useState("all");
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
      return matchesSearch && matchesPurok;
    });
  }, [consumers, purok, query]);

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
          receiptFromContext(receiptContext),
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
        setReceiptData(consumptionReceiptData(consumer.consumerName, receiptFromContext(consumer)));
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
          receiptFromContext(receiptContext),
        ));
      } catch {
        setReceiptData(consumptionReceiptData(payload.consumerName, {
          ...result,
          baselineBill: result.billing?.totalBill,
        }));
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
    <main className="space-y-6">
      <PageHeader description="Select a resident and type the cumulative meter value." eyebrow="Field workspace" title="Record a meter reading" />
      <div className={`rounded-xl border p-4 text-sm font-semibold ${isOnline ? "border-water-200 bg-water-50 text-water-800" : "border-amber-200 bg-amber-50 text-amber-800"}`} role="status">
        {isOnline ? (syncing ? "Online · Syncing saved readings…" : `Online${pendingCount ? ` · ${pendingCount} reading${pendingCount === 1 ? "" : "s"} waiting to sync` : " · All readings synced"}`) : `Offline mode · ${pendingCount} reading${pendingCount === 1 ? "" : "s"} safely stored on this device`}
      </div>
      {loadError && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{loadError}</span><button className="font-bold underline" onClick={loadData} type="button">Try again</button></div>}
      <div aria-label="Resident directory controls" className="flex flex-col gap-3 sm:flex-row sm:items-center" role="search">
        <Search ariaLabel="Search residents by name or account number" className="flex-1" onValueChange={setQuery} placeholder="Search name or account number" value={query} />
        <Filter ariaLabel="Filter residents by purok" className="w-full sm:w-48" disabled={loading} onValueChange={setPurok} options={purokOptions} value={purok} />
      </div>
      {loading ? <LoadingSkeleton label="Loading residents and reading status" variant="list" /> : <ConsumerSelectionList consumers={visibleConsumers} emptyDescription={consumers.length ? "Try a different search or choose another purok." : undefined} emptyTitle={consumers.length ? "No matching residents" : undefined} onSelect={selectConsumer} selectedId={selectedConsumer?.id} selectingId={selectingId} />}

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
