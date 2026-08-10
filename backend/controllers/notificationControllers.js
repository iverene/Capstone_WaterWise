import {
  createNotification,
  getNotificationById,
  getNotifications,
  markNotificationAsRead,
} from "../models/notificationModels.js";
import { processBillingReminders } from "../services/notificationServices.js";
import {
  listPushSubscriptions,
  removePushSubscription,
  removePushSubscriptionById,
  savePushSubscription,
} from "../models/pushSubscriptionModels.js";
import { getVapidPublicKey } from "../services/pushNotificationService.js";

const sendError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);
  return res.status(error.statusCode ?? 500).json({
    success: false,
    message: error.message || fallbackMessage,
  });
};

export async function addNotification(req, res) {
  try {
    const notification = await createNotification(req.body ?? {});
    return res.status(201).json({
      success: true,
      message: "Notification created successfully.",
      data: notification,
    });
  } catch (error) {
    return sendError(res, error, "Failed to create notification.");
  }
}

export async function listNotifications(req, res) {
  try {
    const notifications = await getNotifications({
      consumerId: req.query.consumerId,
    });
    return res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve notifications.");
  }
}

export async function showNotification(req, res) {
  try {
    const notification = await getNotificationById(req.params.id);
    return res.status(200).json({ success: true, data: notification });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve notification.");
  }
}

export async function markNotificationRead(req, res) {
  try {
    const readRecord = await markNotificationAsRead(
      req.params.id,
      req.user.id,
    );
    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      data: readRecord,
    });
  } catch (error) {
    return sendError(res, error, "Failed to mark notification as read.");
  }
}

export async function runNotificationReminders(req, res) {
  try {
    const result = await processBillingReminders();
    return res.status(200).json({
      success: true,
      message: "Billing reminders processed successfully.",
      data: result,
    });
  } catch (error) {
    return sendError(res, error, "Failed to process billing reminders.");
  }
}

export function showPushConfiguration(req, res) {
  const publicKey = getVapidPublicKey();
  return res.status(200).json({ success: true, enabled: Boolean(publicKey), publicKey });
}

export async function registerPushSubscription(req, res) {
  try {
    if (!getVapidPublicKey()) {
      return res.status(503).json({ success: false, message: "Push notifications are not configured on the server." });
    }
    const subscription = await savePushSubscription({
      consumerId: req.user.id,
      subscription: req.body?.subscription,
      userAgent: req.get("user-agent"),
    });
    return res.status(201).json({ success: true, message: "Push notifications enabled for this device.", data: subscription });
  } catch (error) {
    return sendError(res, error, "Failed to register push notifications.");
  }
}

export async function getPushSubscriptions(req, res) {
  try {
    const subscriptions = await listPushSubscriptions(req.user.id);
    return res.status(200).json({ success: true, data: subscriptions });
  } catch (error) {
    return sendError(res, error, "Failed to load notification devices.");
  }
}

export async function unregisterCurrentPushSubscription(req, res) {
  try {
    await removePushSubscription({ consumerId: req.user.id, endpoint: req.body?.endpoint });
    return res.status(200).json({ success: true, message: "Push notifications disabled for this device." });
  } catch (error) {
    return sendError(res, error, "Failed to disable push notifications.");
  }
}

export async function unregisterPushSubscriptionById(req, res) {
  try {
    await removePushSubscriptionById({ consumerId: req.user.id, subscriptionId: req.params.subscriptionId });
    return res.status(200).json({ success: true, message: "Notification device removed." });
  } catch (error) {
    return sendError(res, error, "Failed to remove notification device.");
  }
}
