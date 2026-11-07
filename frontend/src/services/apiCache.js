import { getStoredAccount } from "./authToken";

// In-memory GET-response cache. Same interface as the old sessionStorage
// version, but API bodies are NEVER written to browser storage, so cached
// data does not appear in the DevTools Storage tab. Entries live only for
// the page lifetime and vanish on reload / tab close.
const LEGACY_CACHE_PREFIX = "waterwise-api-cache:";
const MAX_ENTRIES = 200;

const memoryCache = new Map();
let sessionGeneration = 0;
let cacheGeneration = 0;

export function captureCacheContext() {
  return { scope: accountScope(), generation: sessionGeneration, cacheGeneration };
}

export function isCacheContextCurrent(context) {
  return context?.scope === accountScope() && context?.generation === sessionGeneration;
}

export function isCacheContextFresh(context) {
  return isCacheContextCurrent(context) && context.cacheGeneration === cacheGeneration;
}

function accountScope() {
  const account = getStoredAccount();
  if (!account?.id || !account?.role) return null;
  return `${account.role}:${account.id}`;
}

function storageKey(requestKey, context) {
  if (!isCacheContextFresh(context)) return null;
  const scope = context.scope;
  return scope ? `${scope}:${requestKey}` : null;
}

function freshCopy(cached) {
  // The old sessionStorage version returned a fresh JSON copy per read, so
  // callers could never mutate the stored entry. Preserve that guarantee.
  try {
    return structuredClone(cached);
  } catch {
    return JSON.parse(JSON.stringify(cached));
  }
}

export function readCachedResponse(requestKey, context = captureCacheContext()) {
  const key = storageKey(requestKey, context);
  if (!key) return null;
  const cached = memoryCache.get(key);
  return cached ? freshCopy(cached) : null;
}

export function writeCachedResponse(requestKey, response, context = captureCacheContext()) {
  const key = storageKey(requestKey, context);
  if (!key) return;
  if (!memoryCache.has(key) && memoryCache.size >= MAX_ENTRIES) {
    // FIFO evict the oldest entry; Map preserves insertion order.
    memoryCache.delete(memoryCache.keys().next().value);
  }
  memoryCache.set(key, {
    data: response.data,
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function clearApiCache() {
  cacheGeneration += 1;
  memoryCache.clear();
}

if (typeof window !== "undefined") {
  // Login/logout/account-switch dispatches this event (see authToken.js), so
  // the memory cache is wiped on the same transitions that used to clear the
  // sessionStorage cache. Covers logout without touching authToken imports.
  window.addEventListener("waterwise-session-changed", () => {
    sessionGeneration += 1;
    memoryCache.clear();
  });

  // One-time scrub: drop entries written by the old sessionStorage version
  // (e.g. tabs opened before this change shipped).
  try {
    const doomed = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const storedKey = window.sessionStorage.key(index);
      if (storedKey?.startsWith(LEGACY_CACHE_PREFIX)) doomed.push(storedKey);
    }
    doomed.forEach((storedKey) => window.sessionStorage.removeItem(storedKey));
  } catch {
    // A disabled session store must never break the app.
  }
}
