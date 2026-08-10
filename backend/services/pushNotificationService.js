import webpush from "web-push";
import { supabase } from "../config/supabase.js";

const PUSH_INTERVAL_MS = 15_000;
const MAX_ATTEMPTS = 5;

const getConfiguration = () => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = String(process.env.VAPID_SUBJECT ?? "mailto:admin@waterwise.local").trim();
  return { publicKey, privateKey, subject, configured: Boolean(publicKey && privateKey) };
};

let configuredSignature = "";
const configureWebPush = () => {
  const config = getConfiguration();
  if (!config.configured) return config;
  const signature = `${config.subject}:${config.publicKey}:${config.privateKey}`;
  if (signature !== configuredSignature) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configuredSignature = signature;
  }
  return config;
};

export const getVapidPublicKey = () => getConfiguration().publicKey;

const pushPayload = (notification) => JSON.stringify({
  notificationId: notification.id,
  title: notification.title,
  body: notification.message,
  priority: notification.priority,
  url: notification.action_path || "/consumer/home",
  tag: notification.event_key || `waterwise-notification-${notification.id}`,
});

async function removeExpiredSubscription(id) {
  const { error } = await supabase.from("consumer_push_subscriptions").delete().eq("id", id);
  if (error) console.error("Failed to remove expired push subscription:", error.message);
}

async function deliverJob(job) {
  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .select("id, consumer_id, title, message, priority, action_path, event_key")
    .eq("id", job.notification_id)
    .maybeSingle();
  if (notificationError) throw new Error(notificationError.message);
  if (!notification) return { complete: true };

  let query = supabase
    .from("consumer_push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("enabled", true)
    .is("revoked_at", null);
  if (notification.consumer_id != null) query = query.eq("consumer_id", notification.consumer_id);
  const { data: subscriptions, error } = await query;
  if (error) throw new Error(error.message);

  let transientFailures = 0;
  await Promise.all((subscriptions ?? []).map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      }, pushPayload(notification), { TTL: 24 * 60 * 60, urgency: notification.priority === "critical" ? "high" : "normal" });
    } catch (pushError) {
      if ([404, 410].includes(pushError.statusCode)) {
        await removeExpiredSubscription(subscription.id);
      } else {
        transientFailures += 1;
        console.error("Push delivery failed:", pushError.message);
      }
    }
  }));
  return { complete: transientFailures === 0 || Number(job.attempts) + 1 >= MAX_ATTEMPTS };
}

export async function processPushQueue() {
  const config = configureWebPush();
  if (!config.configured) return { configured: false, processed: 0 };
  const { data: jobs, error } = await supabase
    .from("notification_push_jobs")
    .select("notification_id, attempts")
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(`Failed to load push queue: ${error.message}`);

  for (const job of jobs ?? []) {
    try {
      const result = await deliverJob(job);
      if (result.complete) {
        await supabase.from("notification_push_jobs").delete().eq("notification_id", job.notification_id);
      } else {
        await supabase.from("notification_push_jobs").update({
          attempts: Number(job.attempts) + 1,
          available_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: "One or more push services temporarily rejected delivery.",
        }).eq("notification_id", job.notification_id);
      }
    } catch (jobError) {
      const attempts = Number(job.attempts) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await supabase.from("notification_push_jobs").delete().eq("notification_id", job.notification_id);
      } else {
        await supabase.from("notification_push_jobs").update({
          attempts,
          available_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: String(jobError.message ?? jobError).slice(0, 1000),
        }).eq("notification_id", job.notification_id);
      }
    }
  }
  return { configured: true, processed: jobs?.length ?? 0 };
}

export function startPushNotificationWorker() {
  if (!getConfiguration().configured) {
    console.warn("Web Push is disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable it.");
    return () => {};
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await processPushQueue(); }
    catch (error) { console.error("Push notification worker failed:", error.message); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(run, PUSH_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
