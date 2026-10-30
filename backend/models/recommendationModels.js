import { supabase } from "../config/supabase.js";

const recommendationCacheError = (message) => {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
};

export async function getStoredRecommendation(cacheKey, sourceSignature) {
  const { data, error } = await supabase
    .from("ai_consumption_cache")
    .select("result_payload")
    .eq("result_type", "recommendation")
    .eq("cache_key", cacheKey)
    .eq("source_signature", sourceSignature)
    .maybeSingle();

  if (error) {
    throw recommendationCacheError(
      `Failed to retrieve stored AI recommendations: ${error.message}`,
    );
  }

  return data?.result_payload ?? null;
}

export async function getLatestStoredRecommendation(cacheKey) {
  const { data, error } = await supabase
    .from("ai_consumption_cache")
    .select("result_payload")
    .eq("result_type", "recommendation")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    throw recommendationCacheError(
      `Failed to retrieve the latest stored AI recommendations: ${error.message}`,
    );
  }

  return data?.result_payload ?? null;
}

export async function storeRecommendation({
  cacheKey,
  period,
  purok = null,
  recommendation,
  scope,
  sourceVersion,
}) {
  const generatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("ai_consumption_cache")
    .upsert(
      {
        result_type: "recommendation",
        cache_key: cacheKey,
        generated_at: generatedAt,
        latest_consumption_id: sourceVersion.latestConsumptionId,
        purok,
        result_payload: recommendation,
        result_period: period,
        scope,
        source_record_count: sourceVersion.recordCount,
        source_signature: sourceVersion.signature,
        updated_at: generatedAt,
      },
      { onConflict: "result_type,cache_key" },
    )
    .select("result_payload")
    .single();

  if (error) {
    throw recommendationCacheError(
      `Failed to store AI recommendations: ${error.message}`,
    );
  }

  return data.result_payload;
}
