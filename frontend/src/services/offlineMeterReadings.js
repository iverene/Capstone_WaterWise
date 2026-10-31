import { getPersistentMeterReaderUser, getStoredAccount } from "./authToken";
import { createMeterReading } from "./meterReadingAPI";
import { createMeterIncidentRequestKey, logMeterIncident } from "./meterIncidentAPI";

const DATABASE_NAME = "waterwise-meter-reader";
const DATABASE_VERSION = 2;
const CONTEXT_STORE = "contexts";
const INCIDENT_CONTEXT_STORE = "incident-contexts";
const OUTBOX_STORE = "reading-outbox";
const INCIDENT_OUTBOX_STORE = "incident-outbox";

const accountScope = () => {
  // getStoredAccount() already restores the persistent meter-reader identity
  // into the tab, but fall back explicitly so cached contexts/outbox stay
  // visible even on the very first read after a PWA relaunch.
  const account = getStoredAccount() ?? getPersistentMeterReaderUser();
  return String(account?.id ?? account?.username ?? "anonymous");
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CONTEXT_STORE)) database.createObjectStore(CONTEXT_STORE);
      if (!database.objectStoreNames.contains(INCIDENT_CONTEXT_STORE)) {
        database.createObjectStore(INCIDENT_CONTEXT_STORE);
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) database.createObjectStore(OUTBOX_STORE, { keyPath: "idempotencyKey" });
      if (!database.objectStoreNames.contains(INCIDENT_OUTBOX_STORE)) {
        database.createObjectStore(INCIDENT_OUTBOX_STORE, { keyPath: "idempotencyKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(name, mode, operation) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(name, mode);
    const result = await operation(transaction.objectStore(name));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } finally {
    database.close();
  }
}

export async function cacheRecordingContexts(contexts) {
  return withStore(CONTEXT_STORE, "readwrite", (store) => requestResult(store.put({ contexts, cachedAt: Date.now() }, accountScope())));
}

export async function getCachedRecordingContexts() {
  const cached = await withStore(CONTEXT_STORE, "readonly", (store) => requestResult(store.get(accountScope())));
  return cached ?? null;
}

export async function cacheIncidentContexts(contexts) {
  return withStore(
    INCIDENT_CONTEXT_STORE,
    "readwrite",
    (store) => requestResult(store.put({ contexts, cachedAt: Date.now() }, accountScope())),
  );
}

export async function getCachedIncidentContexts() {
  const cached = await withStore(
    INCIDENT_CONTEXT_STORE,
    "readonly",
    (store) => requestResult(store.get(accountScope())),
  );
  if (cached?.contexts?.length) return cached;
  return getCachedRecordingContexts();
}

export async function queueMeterReading(payload) {
  const record = { ...payload, accountScope: accountScope(), queuedAt: Date.now() };
  await withStore(OUTBOX_STORE, "readwrite", (store) => requestResult(store.put(record)));
  return record;
}

export async function getPendingMeterReadings() {
  const records = await withStore(OUTBOX_STORE, "readonly", (store) => requestResult(store.getAll()));
  return records.filter((record) => record.accountScope === accountScope());
}

async function removePendingReading(idempotencyKey) {
  return withStore(OUTBOX_STORE, "readwrite", (store) => requestResult(store.delete(idempotencyKey)));
}

export async function syncPendingMeterReadings() {
  if (!navigator.onLine) return { synced: 0, remaining: (await getPendingMeterReadings()).length };
  const pending = await getPendingMeterReadings();
  let synced = 0;
  for (const record of pending) {
    try {
      await createMeterReading(record);
      await removePendingReading(record.idempotencyKey);
      synced += 1;
    } catch (error) {
      if (!error.response) break;
      // Server rejection for this record; skip it and try the next one.
    }
  }
  return { synced, remaining: (await getPendingMeterReadings()).length };
}

export async function queueMeterIncident(payload) {
  const record = {
    ...payload,
    idempotencyKey: payload.idempotencyKey || createMeterIncidentRequestKey(),
    accountScope: accountScope(),
    queuedAt: Date.now(),
    status: "pending",
    syncError: null,
  };
  await withStore(INCIDENT_OUTBOX_STORE, "readwrite", (store) => requestResult(store.put(record)));
  return record;
}

export async function getPendingMeterIncidents() {
  const records = await withStore(
    INCIDENT_OUTBOX_STORE,
    "readonly",
    (store) => requestResult(store.getAll()),
  );
  return records.filter((record) => record.accountScope === accountScope());
}

export async function syncPendingMeterIncidents() {
  if (!navigator.onLine) {
    return { synced: 0, remaining: (await getPendingMeterIncidents()).length, failed: 0 };
  }
  const pending = await getPendingMeterIncidents();
  let synced = 0;
  let failed = 0;
  for (const record of pending) {
    try {
      await logMeterIncident(record);
      await withStore(
        INCIDENT_OUTBOX_STORE,
        "readwrite",
        (store) => requestResult(store.delete(record.idempotencyKey)),
      );
      synced += 1;
    } catch (error) {
      failed += 1;
      await withStore(
        INCIDENT_OUTBOX_STORE,
        "readwrite",
        (store) => requestResult(store.put({
          ...record,
          syncError: error?.response?.data?.message ?? error?.message ?? "Unable to sync meter incident.",
          failedAt: Date.now(),
        })),
      );
      if (!error.response) break;
    }
  }
  return {
    synced,
    failed,
    remaining: (await getPendingMeterIncidents()).length,
  };
}
