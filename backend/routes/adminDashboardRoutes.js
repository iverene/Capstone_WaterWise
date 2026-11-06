import express from "express";
import { showAdminDashboardMetrics } from "../controllers/adminDashboardController.js";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));
router.get("/metrics", showAdminDashboardMetrics);

export default router;

