import express from "express";
import {
  addPayment,
  allocatePayment,
  listBillingPayments,
  listConsumerPayments,
  listPayments,
  showPayment,
} from "../controllers/paymentControllers.js";
import {
  authenticate,
  authorizeOwnerOrRoles,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate);
router.get("/", authorizeRoles("admin"), listPayments);
router.get(
  "/consumer/:consumerId",
  authorizeOwnerOrRoles("consumerId", "consumer", "admin"),
  listConsumerPayments
);
router.get("/billing/:billingId", authorizeRoles("admin"), listBillingPayments);
router.post("/allocate", authorizeRoles("admin"), allocatePayment);
router.post("/", authorizeRoles("admin"), addPayment);
router.get("/:id", authorizeRoles("admin"), showPayment);

export default router;
