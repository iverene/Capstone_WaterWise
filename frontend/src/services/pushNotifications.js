import { apiRequest } from "./apiClient";

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const base64UrlToUint8Array = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
};

export async function getCurrentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function getPushConfiguration(options) {
  return apiRequest("/notifications/push/config", options);
}

export async function enablePushNotifications() {
  if (!pushSupported()) throw new Error("Push notifications are not supported by this browser.");
  const config = await getPushConfiguration();
  if (!config.enabled || !config.publicKey) throw new Error("Push notifications are not configured on the server.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked in this browser's site settings."
      : "Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
  }
  await apiRequest("/notifications/push/subscriptions", {
    method: "POST",
    body: { subscription: subscription.toJSON() },
  });
  return subscription;
}

export async function disableCurrentPushNotifications() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  await apiRequest("/notifications/push/subscriptions/current", {
    method: "DELETE",
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}

export async function fetchPushSubscriptions(options) {
  const response = await apiRequest("/notifications/push/subscriptions", options);
  return response.data ?? [];
}

export async function removePushSubscription(subscriptionId) {
  return apiRequest(`/notifications/push/subscriptions/${subscriptionId}`, { method: "DELETE" });
}
