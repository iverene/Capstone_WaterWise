import {
  deleteCache,
  readCache,
  writeCache,
} from "../config/redis.js";

const CACHE_PREFIX = "waterwise:consumption";
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

export const consumptionCacheKey = (resource) => `${CACHE_PREFIX}:${resource}`;

export const getCachedConsumption = async (
  resource,
  loader,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) => {
  const key = consumptionCacheKey(resource);
  const cached = await readCache(key);

  if (cached !== null) return cached;

  const fresh = await loader();
  await writeCache(key, fresh, ttlSeconds);
  return fresh;
};

export const invalidateConsumptionCache = async ({ purok }) => {
  const keys = [
    "readings:all",
    "ranking",
    "history:monthly",
    "history:yearly",
    "history:monthly:all-puroks",
    "history:yearly:all-puroks",
  ];

  if (purok) {
    const encodedPurok = encodeURIComponent(purok);
    keys.push(
      `history:monthly:purok:${encodedPurok}`,
      `history:yearly:purok:${encodedPurok}`,
    );
  }

  return deleteCache(...keys.map(consumptionCacheKey));
};
