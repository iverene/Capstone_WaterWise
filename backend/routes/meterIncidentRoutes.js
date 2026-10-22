import express from "express";
import {
  approveIncident,
  listConsumerIncidents,
  listIncidents,
  logIncident,
  rejectIncident,
  showAveragePreview,
  showIncident,
  showPaymentHold,
  updateIncident,
} from "../controllers/meterIncidentControllers.js";
import { authenticate, authorizeOwnerOrRoles, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate);

router.get("/", authorizeRoles("admin"), listIncidents);
router.get(
  "/consumer/:consumerId",
  authorizeOwnerOrRoles("consumerId", "consumer", "admin", "meter-reader"),
  listConsumerIncidents,
);
router.get("/average/:consumerId", authorizeRoles("admin", "meter-reader"), showAveragePreview);
router.get("/payment-hold/:consumerId", authorizeRoles("admin", "meter-reader"), showPaymentHold);
// Reporting a meter replacement is a field operation. The reader never has to
// wait for the monthly reading visit to declare it.
router.post("/", authorizeRoles("admin", "meter-reader"), logIncident);
router.patch("/:id", authorizeRoles("admin", "meter-reader"), updateIncident);
router.patch("/:id/approve", authorizeRoles("admin"), approveIncident);
router.patch("/:id/reject", authorizeRoles("admin"), rejectIncident);
router.get("/:id", authorizeRoles("admin", "meter-reader"), showIncident);

export default router;
