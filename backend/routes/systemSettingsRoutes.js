import express from "express";
import { listSystemSettings, getSystemSettingByKey, updateSystemSettingByKey } from "../controllers/systemSettingsControllers.js";
import { authorizeStaffAction } from "../controllers/authControllers.js";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate);
router.get("/", authorizeRoles("super-admin"), authorizeStaffAction("manage-system-settings"), listSystemSettings);
router.get("/:key", authorizeRoles("super-admin", "meter-reader"), getSystemSettingByKey);
router.patch("/:key", authorizeRoles("super-admin"), authorizeStaffAction("update-system-settings"), updateSystemSettingByKey);

export default router;
