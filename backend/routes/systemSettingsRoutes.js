import express from "express";
import { listSystemSettings, getSystemSettingByKey, updateSystemSettingByKey } from "../controllers/systemSettingsControllers.js";
import { authorizeStaffAction } from "../controllers/authControllers.js";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("super-admin"));
router.get("/", listSystemSettings);
router.get("/:key", getSystemSettingByKey);
router.patch("/:key", authorizeStaffAction("update-system-settings"), updateSystemSettingByKey);

export default router;
