import express from "express";

import {
  getOverallMonthlyRecommendations,
  getOverallYearlyRecommendations,
  getPerPurokMonthlyRecommendations,
  getPerPurokYearlyRecommendations,
  getAllPuroksMonthlyRecommendations,
  getAllPuroksYearlyRecommendations,
  getAllRecommendations,
} from "../controllers/recommendationControllers.js";
import {
  authenticate,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

// Overall

// Get Monthly Recommendations
router.get("/overall/monthly", getOverallMonthlyRecommendations);

// Get Yearly Recommendations
router.get("/overall/yearly", getOverallYearlyRecommendations);

// Per Purok

// Get Monthly Recommendations
router.get("/purok/:purok/monthly", getPerPurokMonthlyRecommendations);

// Get Yearly Recommendations
router.get("/purok/:purok/yearly", getPerPurokYearlyRecommendations);

// All Puroks

// Get Monthly Recommendations
router.get("/puroks/monthly", getAllPuroksMonthlyRecommendations);

// Get Yearly Recommendations
router.get("/puroks/yearly", getAllPuroksYearlyRecommendations);

// Get all stored recommendations. Gemini generation is scheduler-only.
router.get("/", getAllRecommendations);

export default router;
