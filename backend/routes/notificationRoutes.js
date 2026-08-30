import express from "express";
import {
  addNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotifications,
  runNotificationReminders,
  showNotification,
  showPushConfiguration,
  registerPushSubscription,
  getPushSubscriptions,
  unregisterCurrentPushSubscription,
  unregisterPushSubscriptionById,
} from "../controllers/notificationControllers.js";
import {
  authenticate,
  authorizeConsumerQueryOrRoles,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate);
router.get("/push/config", authorizeRoles("consumer"), showPushConfiguration);
router.get("/push/subscriptions", authorizeRoles("consumer"), getPushSubscriptions);
router.post("/push/subscriptions", authorizeRoles("consumer"), registerPushSubscription);
router.delete("/push/subscriptions/current", authorizeRoles("consumer"), unregisterCurrentPushSubscription);
router.delete("/push/subscriptions/:subscriptionId", authorizeRoles("consumer"), unregisterPushSubscriptionById);
router.get("/", authorizeConsumerQueryOrRoles("admin"), listNotifications);
router.post(
  "/process-reminders",
  authorizeRoles("admin"),
  runNotificationReminders,
);
router.put("/read-all", authorizeRoles("consumer"), markAllNotificationsRead);
router.post("/delete", authorizeRoles("consumer"), removeNotifications);
router.put("/:id/read", authorizeRoles("consumer"), markNotificationRead);
router.get("/:id", authorizeRoles("admin"), showNotification);
router.post("/", authorizeRoles("admin"), addNotification);

export default router;
