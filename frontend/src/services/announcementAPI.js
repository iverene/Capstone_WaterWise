import { apiRequest } from "./apiClient";
import { withDataChangeClient } from "./dataChangeClient";

function currentLocalDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function normalizeAnnouncement(notification) {
  return {
    id: notification.id,
    title: notification.title,
    content: notification.message,
    publicationDate: notification.announcement_date,
    relatedEvent: notification.announcement_type,
    notificationType: notification.notification_type,
    priority: notification.priority ?? "normal",
    consumerId: notification.consumer_id,
    createdAt: notification.created_at,
  };
}

export async function fetchAnnouncements(options = {}) {
  const response = await apiRequest("/notifications", options);
  const notifications = response?.data ?? [];
  return Array.isArray(notifications)
    ? notifications
        .filter((notification) => notification.consumer_id == null)
        .map(normalizeAnnouncement)
    : [];
}

export async function createAnnouncement(payload, options = {}) {
  const category = payload.relatedEvent || "General Announcement";
  const priority = payload.priority ?? (
    category === "Emergency Notice"
      ? "critical"
      : ["Water Interruption", "Service Restoration", "Billing Notice"].includes(category)
        ? "high"
        : "normal"
  );
  const response = await apiRequest("/notifications", withDataChangeClient({
    ...options,
    method: "POST",
    body: JSON.stringify({
      consumerId: payload.consumerId ?? null,
      announcementType: category,
      notificationType: priority === "normal" ? "announcement" : "service_alert",
      priority,
      title: payload.title,
      announcementDate: currentLocalDate(),
      message: payload.content,
    }),
  }));
  return normalizeAnnouncement(response.data);
}
