// Memory-only rate limiter (no Redis / zero Upstash commands).
// Redis stays in use for consumption + session-activity caching; only the
// limiter runs here so quota is spent on speed, not counting.
// Single-instance safe (free Render + uptime pinger). Counters reset on
// backend restart/redeploy by design; each window also auto-expires.
const enabled = process.env.RATE_LIMIT_ENABLED !== "false";

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const GLOBAL_MAX = positiveNumber(process.env.RATE_LIMIT_GLOBAL_MAX, 3000);
const AUTH_MAX = positiveNumber(process.env.RATE_LIMIT_AUTH_MAX, 10);
const CONSUMER_ACCOUNT_MAX = positiveNumber(
  process.env.RATE_LIMIT_CONSUMER_MAX,
  300,
);
const STAFF_ACCOUNT_MAX = positiveNumber(
  process.env.RATE_LIMIT_STAFF_MAX,
  1000,
);
const ALERT_BLOCKED_THRESHOLD = Math.floor(
  positiveNumber(process.env.RATE_LIMIT_ALERT_BLOCKED_THRESHOLD, 10),
);
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

// Shared override: one env for both limiters. A limiter-specific env still
// wins when set, so existing deployments keep working unchanged.
const SHARED_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS);
const sharedWindowMs =
  Number.isFinite(SHARED_WINDOW_MS) && SHARED_WINDOW_MS > 0 ? SHARED_WINDOW_MS : null;

const resolveWindowMs = (specific) => {
  const specificMs = Number(specific);
  if (Number.isFinite(specificMs) && specificMs > 0) return specificMs;
  return sharedWindowMs ?? DEFAULT_WINDOW_MS;
};

const GLOBAL_WINDOW_MS = resolveWindowMs(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS);
const AUTH_WINDOW_MS = resolveWindowMs(process.env.RATE_LIMIT_AUTH_WINDOW_MS);

const MAX_KEYS = Math.floor(
  positiveNumber(process.env.RATE_LIMIT_MAX_KEYS, 5000),
);
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const memoryStore = new Map();

// Cumulative counters since backend start (reset on restart by design).
const totals = {
  global: { hits: 0, blocked: 0 },
  auth: { hits: 0, blocked: 0 },
  account: { hits: 0, blocked: 0 },
};

function maskKey(prefix, key) {
  const body = key.startsWith(`${prefix}:`) ? key.slice(prefix.length + 1) : key;
  if (prefix === "rl:account") {
    const [role, id] = body.split(":");
    return `${role ?? "account"}:${id ?? "***"}`;
  }
  if (prefix === "rl:auth") {
    const separator = body.lastIndexOf(":");
    const ip = separator >= 0 ? body.slice(0, separator) : body;
    const identifier = separator >= 0 ? body.slice(separator + 1) : "";
    return `${maskIp(ip)}:${maskIdentifier(identifier)}`;
  }
  return maskIp(body);
}

function maskIp(value) {
  const parts = String(value).split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  if (String(value).includes(":")) return "ipv6:*";
  return "***";
}

function maskIdentifier(value) {
  const text = String(value ?? "");
  const at = text.indexOf("@");
  if (at > 0) return `${text[0]}***@${text.slice(at + 1)}`;
  if (text.length <= 2) return "***";
  return `${text[0]}***${text[text.length - 1]}`;
}

// Admin-only snapshot for the optional rate-limit dashboard (frontend2).
// Keys are masked — no raw IPs or emails ever leave the server.
export function getRateLimitStats() {
  const now = Date.now();
  const collect = (prefix) => {
    const entries = [];
    for (const [key, entry] of memoryStore) {
      if (!key.startsWith(`${prefix}:`)) continue;
      if (!entry || now >= entry.resetAt) continue;
      entries.push({
        key: maskKey(prefix, key),
        count: entry.count,
        resetInSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      });
    }
    entries.sort((a, b) => b.count - a.count);
    return { activeKeys: entries.length, top: entries.slice(0, 10) };
  };
  return {
    sinceRestart: true,
    generatedAt: new Date().toISOString(),
    global: {
      max: GLOBAL_MAX,
      windowSeconds: Math.max(1, Math.ceil(GLOBAL_WINDOW_MS / 1000)),
      ...totals.global,
      alert: {
        threshold: ALERT_BLOCKED_THRESHOLD,
        active: totals.global.blocked >= ALERT_BLOCKED_THRESHOLD,
      },
      ...collect("rl:global"),
    },
    auth: {
      max: AUTH_MAX,
      windowSeconds: Math.max(1, Math.ceil(AUTH_WINDOW_MS / 1000)),
      ...totals.auth,
      alert: {
        threshold: ALERT_BLOCKED_THRESHOLD,
        active: totals.auth.blocked >= ALERT_BLOCKED_THRESHOLD,
      },
      ...collect("rl:auth"),
    },
    account: {
      consumerMax: CONSUMER_ACCOUNT_MAX,
      staffMax: STAFF_ACCOUNT_MAX,
      windowSeconds: Math.max(1, Math.ceil(AUTH_WINDOW_MS / 1000)),
      ...totals.account,
      alert: {
        threshold: ALERT_BLOCKED_THRESHOLD,
        active: totals.account.blocked >= ALERT_BLOCKED_THRESHOLD,
      },
      ...collect("rl:account"),
    },
  };
}

function sweepExpired() {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (!entry || now >= entry.resetAt) memoryStore.delete(key);
  }
  // Hard cap: evict oldest first (Map preserves insertion order).
  while (memoryStore.size > MAX_KEYS) {
    memoryStore.delete(memoryStore.keys().next().value);
  }
}

if (typeof setInterval !== "undefined") {
  const timer = setInterval(sweepExpired, SWEEP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}

function hitMemory(key, windowMs) {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    if (memoryStore.size > MAX_KEYS) sweepExpired();
    return { count: 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  entry.count += 1;
  return {
    count: entry.count,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

function readMemory(key, windowMs) {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now >= entry.resetAt) {
    return {
      count: 0,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }
  return {
    count: entry.count,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

function clientIp(req) {
  // Express derives req.ip using the app's configured trust-proxy policy.
  // Do not trust a client-supplied X-Forwarded-For value directly.
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function sanitizeIdentifier(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, "")
    .slice(0, 120) || "anonymous";
}

function createLimiter({
  name,
  prefix,
  windowMs,
  max,
  keyGenerator,
  skip,
  message,
  countFailures = false,
}) {
  return async (req, res, next) => {
    if (!enabled) return next();
    if (skip?.(req)) return next();

    const key = `${prefix}:${keyGenerator(req)}`;
    const result = countFailures
      ? readMemory(key, windowMs)
      : hitMemory(key, windowMs);
    const blocked = countFailures ? result.count >= max : result.count > max;

    const remaining = Math.max(0, max - result.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(result.retryAfterSeconds));

    if (blocked) {
      if (totals[name]) totals[name].blocked += 1;
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    if (countFailures) {
      res.once("finish", () => {
        // Only client-side auth failures consume the auth quota. Successful
        // login/OTP requests and server errors do not reduce the allowance.
        if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) {
          hitMemory(key, windowMs);
          if (totals[name]) totals[name].hits += 1;
        }
      });
    } else if (totals[name]) {
      totals[name].hits += 1;
    }

    return next();
  };
}

const accountLimitForRole = (role) =>
  role === "consumer" ? CONSUMER_ACCOUNT_MAX : STAFF_ACCOUNT_MAX;

export async function accountRateLimiter(req, res, next) {
  if (!enabled || !req.user) return next();

  const max = accountLimitForRole(req.user.role);
  const key = `rl:account:${req.user.role}:${req.user.id}`;
  const result = hitMemory(key, AUTH_WINDOW_MS);
  const remaining = Math.max(0, max - result.count);

  res.setHeader("RateLimit-Account-Limit", String(max));
  res.setHeader("RateLimit-Account-Remaining", String(remaining));
  res.setHeader("RateLimit-Account-Reset", String(result.retryAfterSeconds));

  if (result.count > max) {
    totals.account.blocked += 1;
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    return res.status(429).json({
      success: false,
      message: "Too many requests for this account. Please try again shortly.",
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  totals.account.hits += 1;
  return next();
}

// Generous guard for every /api/* request. Skips health + CORS preflight so
// uptime checks and browsers never trip it during normal use.
export const globalLimiter = createLimiter({
  name: "global",
  prefix: "rl:global",
  windowMs: GLOBAL_WINDOW_MS,
  max: GLOBAL_MAX,
  keyGenerator: (req) => sanitizeIdentifier(clientIp(req)),
  skip: (req) =>
    req.method === "OPTIONS" ||
    req.path === "/health" ||
    req.path === "/api/health" ||
    req.originalUrl === "/api/health" ||
    req.originalUrl?.split("?")[0] === "/api/health" ||
    (req.path === "/" && req.method === "GET"),
  message: "Too many requests. Please slow down and try again shortly.",
});

// Strict guard for brute-forceable auth endpoints. Keyed by IP + identifier so
// one shared-IP network (e.g. barangay hall WiFi) does not lock everyone out.
export const authStrictLimiter = createLimiter({
  name: "auth",
  prefix: "rl:auth",
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX,
  keyGenerator: (req) => {
    const body = req.body ?? {};
    const identifier =
      body.email ?? body.username ?? body.identifier ?? "anonymous";
    return `${sanitizeIdentifier(clientIp(req))}:${sanitizeIdentifier(identifier)}`;
  },
  skip: (req) => req.method === "OPTIONS",
  countFailures: true,
  message: "Too many login attempts. Try again shortly.",
});

export function _resetRateLimitMemory() {
  memoryStore.clear();
}
