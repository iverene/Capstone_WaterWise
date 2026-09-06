import express from "express";
import {
  editMeterReader,
  listMeterReaders,
  registerMeterReader,
  removeMeterReader,
  showMeterReader,
} from "../controllers/meterReaderControllers.js";
import { authorizeStaffAction } from "../controllers/authControllers.js";
import {
  authenticate,
  authorizeOwnerOrRoles,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate);
router.get("/", authorizeRoles("super-admin"), authorizeStaffAction("manage-staff"), listMeterReaders);
router.get(
  "/:id",
  authorizeOwnerOrRoles("id", "meter-reader", "admin"),
  showMeterReader
);
router.post("/", authorizeRoles("super-admin"), authorizeStaffAction("create-meter-reader"), registerMeterReader);
router.patch("/:id", authorizeRoles("super-admin"), authorizeStaffAction("update-meter-reader"), editMeterReader);
router.delete("/:id", authorizeRoles("super-admin"), authorizeStaffAction("delete-meter-reader"), removeMeterReader);

export default router;
