import express from "express";
import {
  listConsumerIncidents,
  listIncidents,
  logIncident,
  showAveragePreview,
  showIncident,
  updateIncident,
} from "../controllers/meterIncidentControllers.js";
import { authenticate, authorizeOwnerOrRoles, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate);

// The reader's Record Meter Replacement page needs the open incident list to
// build its "Meter changed" filter.
router.get("/", authorizeRoles("admin", "meter-reader"), listIncidents);
router.get(
  "/consumer/:consumerId",
  authorizeOwnerOrRoles("consumerId", "consumer", "admin", "meter-reader"),
  listConsumerIncidents,
);
router.get("/average/:consumerId", authorizeRoles("admin", "meter-reader"), showAveragePreview);
// Reporting a meter replacement is a field operation performed by the meter
// reader. Admins cannot create a replacement, but they can correct a recorded
// one before a reading consumes it.
router.post("/", authorizeRoles("meter-reader"), logIncident);
router.patch("/:id", authorizeRoles("admin"), updateIncident);
router.get("/:id", authorizeRoles("admin", "meter-reader"), showIncident);

export default router;
