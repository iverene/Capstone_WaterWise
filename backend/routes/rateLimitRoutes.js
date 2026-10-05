import express from "express";
import { authenticate, authorizeRoles } from "../middleware/authMiddleware.js";
import { getRateLimitStats } from "../middleware/rateLimit.js";

const router = express.Router();

// Super-admin-only visibility for the optional rate-limit dashboard (frontend2).
// Keys are masked server-side. One-way role inherit means admin cannot reach
// super-admin routes; only super-admin passes.
router.use(authenticate, authorizeRoles("super-admin"));

router.get("/status", (req, res) => {
  res.json({ success: true, data: getRateLimitStats() });
});

export default router;
