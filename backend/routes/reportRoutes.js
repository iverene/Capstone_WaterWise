import express from "express";
import {
  createReport,
  downloadReport,
  listReports,
  previewReport,
  showReportDateRange,
  showReport,
} from "../controllers/reportControllers.js";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));
router.get("/date-range", showReportDateRange);
router.post("/preview", previewReport);
router.get("/", listReports);
router.post("/", createReport);
router.get("/:id/pdf", downloadReport);
router.get("/:id", showReport);

export default router;
