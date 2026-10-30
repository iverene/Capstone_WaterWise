import express from "express";
import {
  getAllPuroksMonthlyPrediction,
  getAllPuroksYearlyPrediction,
  getOverallMonthlyPrediction,
  getOverallYearlyPrediction,
  getPerPurokMonthlyPrediction,
  getPerPurokYearlyPrediction,
} from "../controllers/predictionController.js";
import {
  authenticate,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));
router.get("/monthly/overall", getOverallMonthlyPrediction);
router.get("/yearly/overall", getOverallYearlyPrediction);
router.get("/monthly/all-puroks", getAllPuroksMonthlyPrediction);
router.get("/yearly/all-puroks", getAllPuroksYearlyPrediction);
router.get("/monthly/purok/:purok", getPerPurokMonthlyPrediction);
router.get("/yearly/purok/:purok", getPerPurokYearlyPrediction);

export default router;
