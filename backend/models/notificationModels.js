import { supabase } from "../config/supabase.js";

const NOTIFICATION_FIELDS =
  "id, consumer_id, announcement_type, notification_type, priority, title, announcement_date, message, billing_id, consumption_id, payment_id, action_path, event_key, created_at, updated_at";

const NOTIFICATION_PRIORITIES = new Set(["low", "normal", "high", "critical"]);

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

const parsePositiveId = (value, fieldName) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw createError(`A valid ${fieldName} is required.`);
  }
  return id;
};

const parseDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw createError("Announcement date must use the YYYY-MM-DD format.");
  }
  return value;
};

const parseOptionalId = (value, fieldName) =>
  value === null || value === undefined || value === ""
    ? null
    : parsePositiveId(value, fieldName);

const parseOptionalText = (value, fieldName, maximumLength) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw createError(`${fieldName} must be valid text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw createError(`${fieldName} cannot exceed ${maximumLength} characters.`);
  }
  return normalized;
};

export async function createNotification({
  consumerId = null,
  announcementType,
  notificationType = "announcement",
  priority = "normal",
  title,
  announcementDate,
  message,
  billingId = null,
  consumptionId = null,
  paymentId = null,
  actionPath = null,
  eventKey = null,
}) {
  if (
    typeof announcementType !== "string" ||
    typeof title !== "string" ||
    typeof message !== "string" ||
    !announcementType.trim() ||
    !title.trim() ||
    !message.trim()
  ) {
    throw createError("Announcement type, title, and message are required.");
  }

  const normalizedConsumerId =
    consumerId === null || consumerId === undefined || consumerId === ""
      ? null
      : parsePositiveId(consumerId, "consumer ID");

  const normalizedType = parseOptionalText(
    notificationType,
    "Notification type",
    50,
  );
  const normalizedPriority = String(priority ?? "normal").trim().toLowerCase();
  if (!NOTIFICATION_PRIORITIES.has(normalizedPriority)) {
    throw createError("Priority must be low, normal, high, or critical.");
  }

  const normalizedActionPath = parseOptionalText(actionPath, "Action path", 500);
  if (normalizedActionPath && !normalizedActionPath.startsWith("/")) {
    throw createError("Action path must be an application-relative path.");
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      consumer_id: normalizedConsumerId,
      announcement_type: announcementType.trim(),
      notification_type: normalizedType,
      priority: normalizedPriority,
      title: title.trim(),
      announcement_date: parseDate(announcementDate),
      message: message.trim(),
      billing_id: parseOptionalId(billingId, "billing ID"),
      consumption_id: parseOptionalId(consumptionId, "consumption ID"),
      payment_id: parseOptionalId(paymentId, "payment ID"),
      action_path: normalizedActionPath,
      event_key: parseOptionalText(eventKey, "Event key", 255),
    })
    .select(NOTIFICATION_FIELDS)
    .single();

  if (error) {
    if (error.code === "23503") {
      throw createError("Consumer account not found.", 404);
    }
    throw createError(`Failed to create notification: ${error.message}`, 500);
  }

  return data;
}

export async function getNotifications({ consumerId } = {}) {
  let normalizedConsumerId = null;
  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_FIELDS)
    .order("announcement_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (consumerId !== undefined && consumerId !== null && consumerId !== "") {
    normalizedConsumerId = parsePositiveId(consumerId, "consumer ID");
    query = query.or(
      `consumer_id.eq.${normalizedConsumerId},consumer_id.is.null`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw createError(`Failed to retrieve notifications: ${error.message}`, 500);
  }

  const notifications = data ?? [];
  if (!normalizedConsumerId || notifications.length === 0) {
    return notifications;
  }

  const notificationIds = notifications.map((notification) => notification.id);
  const { data: readRecords, error: readError } = await supabase
    .from("notification_reads")
    .select("notification_id, read_at, dismissed_at")
    .eq("consumer_id", normalizedConsumerId)
    .in("notification_id", notificationIds);

  if (readError) {
    throw createError(
      `Failed to retrieve notification read status: ${readError.message}`,
      500,
    );
  }

  const readsByNotificationId = new Map(
    (readRecords ?? []).map((record) => [record.notification_id, record]),
  );

  return notifications.map((notification) => {
    const readRecord = readsByNotificationId.get(notification.id);
    return {
      ...notification,
      is_read: Boolean(readRecord),
      read_at: readRecord?.read_at ?? null,
      dismissed_at: readRecord?.dismissed_at ?? null,
    };
  });
}

export async function getNotificationById(id) {
  const notificationId = parsePositiveId(id, "notification ID");
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_FIELDS)
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve notification: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Notification not found.", 404);
  }

  return data;
}

export async function markNotificationAsRead(notificationIdValue, consumerIdValue) {
  const notificationId = parsePositiveId(
    notificationIdValue,
    "notification ID",
  );
  const consumerId = parsePositiveId(consumerIdValue, "consumer ID");

  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .select("id, consumer_id")
    .eq("id", notificationId)
    .maybeSingle();

  if (notificationError) {
    throw createError(
      `Failed to retrieve notification: ${notificationError.message}`,
      500,
    );
  }
  if (!notification) {
    throw createError("Notification not found.", 404);
  }
  if (
    notification.consumer_id !== null &&
    Number(notification.consumer_id) !== consumerId
  ) {
    throw createError(
      "You may mark only your own notifications as read.",
      403,
    );
  }

  const { data, error } = await supabase
    .from("notification_reads")
    .upsert(
      {
        notification_id: notificationId,
        consumer_id: consumerId,
        read_at: new Date().toISOString(),
        dismissed_at: null,
      },
      { onConflict: "notification_id,consumer_id" },
    )
    .select("notification_id, consumer_id, read_at, dismissed_at")
    .single();

  if (error) {
    if (error.code === "23503") {
      throw createError("Consumer account or notification not found.", 404);
    }
    throw createError(
      `Failed to mark notification as read: ${error.message}`,
      500,
    );
  }

  return { ...data, is_read: true };
}

export async function markAllNotificationsAsRead(consumerIdValue) {
  const consumerId = parsePositiveId(consumerIdValue, "consumer ID");

  const { data: notifications, error: fetchError } = await supabase
    .from("notifications")
    .select("id")
    .or(`consumer_id.eq.${consumerId},consumer_id.is.null`);

  if (fetchError) {
    throw createError(
      `Failed to retrieve notifications: ${fetchError.message}`,
      500,
    );
  }

  if (!notifications || notifications.length === 0) {
    return { markedCount: 0 };
  }

  const notificationIds = notifications.map((n) => n.id);

  const { data: readRecords, error: readError } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("consumer_id", consumerId)
    .in("notification_id", notificationIds);

  if (readError) {
    throw createError(
      `Failed to retrieve read status: ${readError.message}`,
      500,
    );
  }

  const readSet = new Set((readRecords ?? []).map((r) => r.notification_id));
  const unreadIds = notificationIds.filter((id) => !readSet.has(id));

  if (unreadIds.length === 0) {
    return { markedCount: 0 };
  }

  const now = new Date().toISOString();
  const rows = unreadIds.map((notificationId) => ({
    notification_id: notificationId,
    consumer_id: consumerId,
    read_at: now,
    dismissed_at: null,
  }));

  const { error: upsertError } = await supabase
    .from("notification_reads")
    .upsert(rows, { onConflict: "notification_id,consumer_id" });

  if (upsertError) {
    throw createError(
      `Failed to mark notifications as read: ${upsertError.message}`,
      500,
    );
  }

  return { markedCount: unreadIds.length };
}

export async function deleteNotificationReads(notificationIds, consumerIdValue) {
  const consumerId = parsePositiveId(consumerIdValue, "consumer ID");

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    throw createError("At least one notification ID is required.");
  }

  const validIds = notificationIds.map((id) => parsePositiveId(id, "notification ID"));

  const { data: notifications, error: fetchError } = await supabase
    .from("notifications")
    .select("id, consumer_id, notification_reads!inner(notification_id, consumer_id, read_at)")
    .in("id", validIds);

  if (fetchError) {
    throw createError(`Failed to retrieve notifications: ${fetchError.message}`, 500);
  }

  const ownedIds = (notifications ?? [])
    .filter((n) => {
      if (n.consumer_id !== null && Number(n.consumer_id) !== consumerId) return false;
      const read = n.notification_reads?.find((r) => Number(r.consumer_id) === consumerId);
      return Boolean(read?.read_at);
    })
    .map((n) => n.id);

  if (ownedIds.length === 0) {
    return { deletedCount: 0 };
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .in("id", ownedIds);

  if (error) {
    throw createError(`Failed to delete notifications: ${error.message}`, 500);
  }

  return { deletedCount: ownedIds.length };
}
