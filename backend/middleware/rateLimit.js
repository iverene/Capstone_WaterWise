import { redis } from "../config/redis.js";

const enabled = process.env.RATE_LIMIT_ENABLED !== "false";

const GLOBAL_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 300);
const GLOBAL_WINDOW_MS = Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ?? 15 * 60 * 1000);
const AUTH_MAX = Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10);
const AUTH_WINDOW_MS = Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 15 * 60 * 1000);

// In-memory fallback for local try-out (no Redis env) and for fail-open.
const memoryStore = new Map();

function hitMemory(key, windowMs) {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return { count: 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  entry.count += 1;
  return {
    count: entry.count,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

async function hitRedis(key, windowSeconds) {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    let ttl = windowSeconds;
    try {
      const raw = await redis.ttl(key);
      if (Number.isFinite(Number(raw)) && Number(raw) > 0) ttl = Number(raw);
    } catch {
      // TTL is best-effort; windowSeconds is a safe fallback.
    }
    return { count: Number(count), retryAfterSeconds: Math.max(1, ttl) };
  } catch {
    return null;
  }
}

function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function sanitizeIdentifier(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, "")
    .slice(0, 120) || "anonymous";
}

function createLimiter({ prefix, windowMs, max, keyGenerator, skip, message }) {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  return async (req, res, next) => {
    if (!enabled) return next();
    if (skip?.(req)) return next();

    const key = `${prefix}:${keyGenerator(req)}`;
    let result = null;

    if (redis) {
      result = await hitRedis(key, windowSeconds);
      if (!result) result = hitMemory(key, windowMs);
    } else {
      result = hitMemory(key, windowMs);
    }

    const remaining = Math.max(0, max - result.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(result.retryAfterSeconds));

    if (result.count > max) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    return next();
  };
}

// Generous guard for every /api/* request. Skips health + CORS preflight so
// uptime checks and browsers never trip it during normal use.
export const globalLimiter = createLimiter({
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
  message: "Too many login attempts. Try again shortly.",
});

export function _resetRateLimitMemory() {
  memoryStore.clear();
}
