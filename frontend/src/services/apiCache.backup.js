import { getStoredAccount } from "./authToken";

const CACHE_PREFIX = "waterwise-api-cache:";

function accountScope() {
  const account = getStoredAccount();
  if (!account?.id || !account?.role) return null;
  return `${account.role}:${account.id}`;
}

function storageKey(requestKey) {
  const scope = accountScope();
  return scope ? `${CACHE_PREFIX}${scope}:${requestKey}` : null;
}

export function readCachedResponse(requestKey) {
  const key = storageKey(requestKey);
  if (!key) return null;
  try {
    return JSON.parse(window.sessionStorage.getItem(key));
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function writeCachedResponse(requestKey, response) {
  const key = storageKey(requestKey);
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({
      data: response.data,
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    }));
  } catch {
    // A full/disabled session store must never prevent a successful API response.
  }
}

export function clearApiCache() {
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(CACHE_PREFIX)) window.sessionStorage.removeItem(key);
  }
}

