import { supabase } from "../config/supabase.js";
import { readCache, redis, writeCache } from "../config/redis.js";

const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;
const ACTIVITY_CACHE_TTL_SECONDS = 6 * 60 * 60;

const memoryActivityByAccount = new Map();
const lastPersistedActivityByAccount = new Map();

function accountKey(role, userId) {
  return `${role}:${Number(userId)}`;
}

function cacheKey(role, userId) {
  return `waterwise:session-activity:${role}:${Number(userId)}`;
}

function tableForRole(role) {
  if (role === "consumer") return "consumers";
  if (role === "meter-reader") return "meter_readers";
  return "admins";
}

let warnedInvalidTimeout = false;

function parseDurationToMs(value) {
  const raw = String(value ?? "").trim();
  // Plain milliseconds stay backward compatible: "60000".
  if (/^\d+$/.test(raw)) return Number(raw);
  // Duration strings: "90s", "15m", "10m", "1h" (case-insensitive).
  const match = raw.match(/^(\d+)\s*(s|m|h)$/i);
  if (!match) return null;
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
}

export function getInactivityTimeoutMs() {
  const parsed = parseDurationToMs(process.env.INACTIVITY_TIMEOUT_MS);
  if (parsed && parsed >= 60 * 1000) return parsed;
  if (process.env.INACTIVITY_TIMEOUT_MS && !warnedInvalidTimeout) {
    warnedInvalidTimeout = true;
    console.warn(
      `Invalid INACTIVITY_TIMEOUT_MS value "${process.env.INACTIVITY_TIMEOUT_MS}"; ` +
        `using default. Use milliseconds (e.g. 900000) or a duration string (e.g. 90s, 15m, 1h).`,
    );
  }
  return DEFAULT_INACTIVITY_TIMEOUT_MS;
}

function parseStoredActivity(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

async function readDatabaseActivity(role, userId) {
  try {
    const { data, error } = await supabase
      .from(tableForRole(role))
      .select("last_activity_at")
      .eq("id", Number(userId))
      .maybeSingle();
    if (error) return null;
    return parseStoredActivity(data?.last_activity_at ?? null);
  } catch {
    return null;
  }
}

async function writeDatabaseActivity(role, userId, timestamp) {
  try {
    const { error } = await supabase
      .from(tableForRole(role))
      .update({ last_activity_at: new Date(timestamp).toISOString() })
      .eq("id", Number(userId));
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

export async function getLastSessionActivity(role, userId) {
  const key = accountKey(role, userId);
  const memorized = memoryActivityByAccount.get(key);
  if (Number.isFinite(memorized)) return memorized;

  const cached = await readCache(cacheKey(role, userId));
  const parsedCache = parseStoredActivity(cached);
  if (parsedCache) {
    memoryActivityByAccount.set(key, parsedCache);
    return parsedCache;
  }

  const stored = await readDatabaseActivity(role, userId);
  if (stored) {
    memoryActivityByAccount.set(key, stored);
    if (redis) {
      await writeCache(cacheKey(role, userId), stored, ACTIVITY_CACHE_TTL_SECONDS);
    }
  }
  return stored;
}

export async function touchSessionActivity(role, userId, timestamp = Date.now()) {
  const key = accountKey(role, userId);
  const previous = lastPersistedActivityByAccount.get(key);
  memoryActivityByAccount.set(key, timestamp);

  if (Number.isFinite(previous) && timestamp - previous < ACTIVITY_WRITE_THROTTLE_MS) {
    return timestamp;
  }

  if (redis) {
    await writeCache(cacheKey(role, userId), timestamp, ACTIVITY_CACHE_TTL_SECONDS);
  }
  if (await writeDatabaseActivity(role, userId, timestamp)) {
    lastPersistedActivityByAccount.set(key, timestamp);
  }
  return timestamp;
}

export async function isSessionIdle(role, userId, now = Date.now()) {
  const lastActivity = await getLastSessionActivity(role, userId);
  if (!lastActivity) return { idle: false, lastActivity: null, idleMs: 0 };
  const idleMs = now - lastActivity;
  return {
    idle: idleMs >= getInactivityTimeoutMs(),
    lastActivity,
    idleMs,
  };
}

export async function clearSessionActivity(role, userId) {
  const key = accountKey(role, userId);
  memoryActivityByAccount.delete(key);
  lastPersistedActivityByAccount.delete(key);
  if (redis) {
    try {
      await redis.del(cacheKey(role, userId));
    } catch {
      // Cache eviction is best-effort; the database row (if present) is
      // left untouched so a later login simply overwrites it.
    }
  }
}

export function clearInMemorySessionActivity() {
  memoryActivityByAccount.clear();
  lastPersistedActivityByAccount.clear();
}
