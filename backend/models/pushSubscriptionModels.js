import { createHash } from "node:crypto";
import { supabase } from "../config/supabase.js";

const endpointHash = (endpoint) =>
  createHash("sha256").update(endpoint).digest("hex");

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "web.push.apple.com",
  "api.push.amazon.com",
  "push.services.mozilla.com",
];

const normalizeSubscription = (subscription) => {
  const endpoint = String(subscription?.endpoint ?? "").trim();
  const p256dh = String(subscription?.keys?.p256dh ?? "").trim();
  const auth = String(subscription?.keys?.auth ?? "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    throw createError("A valid browser push subscription is required.");
  }
  if (endpoint.length > 2000 || p256dh.length > 500 || auth.length > 500) {
    throw createError("The browser push subscription is too long.");
  }
  let host;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    throw createError("The push subscription endpoint is not a valid URL.");
  }
  if (!PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw createError("The push subscription endpoint is not from a recognized push service.");
  }
  return { endpoint, p256dh, auth };
};

export async function savePushSubscription({ consumerId, subscription, userAgent }) {
  const normalized = normalizeSubscription(subscription);
  const record = {
    consumer_id: consumerId,
    endpoint: normalized.endpoint,
    endpoint_hash: endpointHash(normalized.endpoint),
    p256dh: normalized.p256dh,
    auth_key: normalized.auth,
    user_agent: String(userAgent ?? "").slice(0, 500) || null,
    enabled: true,
    revoked_at: null,
    last_used_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("consumer_push_subscriptions")
    .upsert(record, { onConflict: "endpoint_hash" })
    .select("id, user_agent, enabled, created_at, last_used_at")
    .single();
  if (error) throw createError(`Failed to save push subscription: ${error.message}`, 500);
  return data;
}

export async function listPushSubscriptions(consumerId) {
  const { data, error } = await supabase
    .from("consumer_push_subscriptions")
    .select("id, endpoint_hash, user_agent, enabled, created_at, last_used_at")
    .eq("consumer_id", consumerId)
    .is("revoked_at", null)
    .order("last_used_at", { ascending: false });
  if (error) throw createError(`Failed to load push subscriptions: ${error.message}`, 500);
  return data ?? [];
}

export async function removePushSubscription({ consumerId, endpoint }) {
  const normalizedEndpoint = String(endpoint ?? "").trim();
  if (!normalizedEndpoint) throw createError("A push subscription endpoint is required.");
  const { data, error } = await supabase
    .from("consumer_push_subscriptions")
    .delete()
    .eq("consumer_id", consumerId)
    .eq("endpoint_hash", endpointHash(normalizedEndpoint))
    .select("id")
    .maybeSingle();
  if (error) throw createError(`Failed to remove push subscription: ${error.message}`, 500);
  return data;
}

export async function removePushSubscriptionById({ consumerId, subscriptionId }) {
  const id = Number(subscriptionId);
  if (!Number.isInteger(id) || id < 1) throw createError("A valid subscription ID is required.");
  const { data, error } = await supabase
    .from("consumer_push_subscriptions")
    .delete()
    .eq("consumer_id", consumerId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw createError(`Failed to remove push subscription: ${error.message}`, 500);
  if (!data) throw createError("Push subscription not found.", 404);
  return data;
}
