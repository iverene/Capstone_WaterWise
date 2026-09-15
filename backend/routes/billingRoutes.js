import express from "express";
import {
  generateMonthlyBilling,
  listBillings,
  listConsumerBillings,
  showBilling,
} from "../controllers/billingControllers.js";
import {
  authenticate,
  authorizeOwnerOrRoles,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate);
router.get("/", authorizeRoles("admin"), listBillings);
router.get(
  "/consumer/:consumerId",
  authorizeOwnerOrRoles("consumerId", "consumer", "admin"),
  listConsumerBillings
);
router.get("/:id", authorizeRoles("admin"), showBilling); // Intentionally admin-only: consumers must use the list endpoint below (GET /consumer/:consumerId) so single-record access always carries an owner check. Do not add "consumer" here without enforcing billing.user_id === req.user.id (IDOR).
router.post("/", authorizeRoles("admin"), generateMonthlyBilling);

export default router;
