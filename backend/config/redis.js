import "dotenv/config";
import { Redis } from "@upstash/redis";

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
