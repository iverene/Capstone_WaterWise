import "dotenv/config";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

let hasLoggedRedisError = false;

const reportRedisError = (operation, error) => {
  if (hasLoggedRedisError) return;
  hasLoggedRedisError = true;
  console.warn(
    `Redis ${operation} failed; continuing with Supabase:`,
    error?.message ?? error,
  );
};

export const readCache = async (key) => {
  if (!redis) return null;

  try {
    return await redis.get(key);
  } catch (error) {
    reportRedisError("read", error);
    return null;
  }
};

export const writeCache = async (key, value, ttlSeconds) => {
  if (!redis) return false;

  try {
    await redis.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (error) {
    reportRedisError("write", error);
    return false;
  }
};

export const deleteCache = async (...keys) => {
  if (!redis) return false;

  try {
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    if (uniqueKeys.length === 0) return true;
    await redis.del(...uniqueKeys);
    return true;
  } catch (error) {
    reportRedisError("invalidation", error);
    return false;
  }
};

export const deleteCacheByPrefix = async (prefix) => {
  if (!redis || !prefix) return false;

  try {
    let cursor = 0;
    const matchedKeys = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${prefix}*`,
        count: 100,
      });
      cursor = Number(nextCursor);
      if (Array.isArray(keys) && keys.length > 0) matchedKeys.push(...keys);
    } while (cursor !== 0);

    const uniqueKeys = [...new Set(matchedKeys)];
    if (uniqueKeys.length === 0) return true;
    await redis.del(...uniqueKeys);
    return true;
  } catch (error) {
    reportRedisError("prefix-invalidation", error);
    return false;
  }
};

export const acquireRedisLock = async (key, ttlSeconds) => {
  if (!redis) return null;

  const token = randomUUID();
  try {
    const acquired = await redis.set(key, token, { nx: true, ex: ttlSeconds });
    if (acquired !== "OK") return null;

    return async () => {
      try {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          [key],
          [token],
        );
      } catch (error) {
        reportRedisError("lock-release", error);
      }
    };
  } catch (error) {
    reportRedisError("lock-acquire", error);
    return null;
  }
};
