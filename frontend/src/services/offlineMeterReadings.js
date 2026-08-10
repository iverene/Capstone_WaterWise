import { getStoredAccount } from "./authToken";
import { createMeterReading } from "./meterReadingAPI";

const DATABASE_NAME = "waterwise-meter-reader";
const DATABASE_VERSION = 1;
const CONTEXT_STORE = "contexts";
const OUTBOX_STORE = "reading-outbox";

const accountScope = () => {
  const account = getStoredAccount();
  return String(account?.id ?? account?.username ?? "anonymous");
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CONTEXT_STORE)) database.createObjectStore(CONTEXT_STORE);
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) database.createObjectStore(OUTBOX_STORE, { keyPath: "idempotencyKey" });
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
      // A server rejection needs review; retain it instead of silently losing field data.
      break;
    }
  }
  return { synced, remaining: (await getPendingMeterReadings()).length };
}
