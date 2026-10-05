import express from "express";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";
import { getRateLimitStats } from "../middleware/rateLimit.js";

const router = express.Router();

// Admin-only visibility for the optional rate-limit dashboard (frontend2).
// Keys are masked server-side; authorizeRoles("admin") also admits super-admin.
router.use(authenticate, authorizeRoles("admin"));

router.get("/status", (req, res) => {
  res.json({ success: true, data: getRateLimitStats() });
});

export default router;
