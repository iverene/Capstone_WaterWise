import {
  readOverallMonthlyRecommendations,
  readOverallYearlyRecommendations,
  readPerPurokMonthlyRecommendations,
  readPerPurokYearlyRecommendations,
  readAllPuroksMonthlyRecommendations,
  readAllPuroksYearlyRecommendations,
  readAllRecommendationsService,
} from "../services/recommendationServices.js";

// ==========================================
// RESPONSE HELPERS
// ==========================================

const sendSuccess = (
  res,
  data,
  statusCode = 200
) => {
  return res
    .status(statusCode)
    .json({
      success: true,
      data,
    });
};

const sendError = (
  res,
  error,
  statusCode = 500
) => {
  console.error(
    "Recommendation controller error:",
    error
  );

  return res
    .status(statusCode)
    .json({
      success: false,
      message:
        error?.message ||
        "An unexpected error occurred.",
    });
};

const getValidatedPurok = (
  req
) => {
  const purok =
    req.params?.purok?.trim();

  if (!purok) {
    throw new Error(
      "Purok parameter is required."
    );
  }

  return purok;
};

// ==========================================
// OVERALL RECOMMENDATIONS
// ==========================================

// Get overall monthly recommendations
export const getOverallMonthlyRecommendations =
  async (req, res) => {
    try {
      const data =
        await readOverallMonthlyRecommendations();

      return sendSuccess(
        res,
        data
      );
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

// Get overall yearly recommendations
export const getOverallYearlyRecommendations =
  async (req, res) => {
    try {
      const data =
        await readOverallYearlyRecommendations();

      return sendSuccess(
        res,
        data
      );
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

// ==========================================
// PER-PUROK RECOMMENDATIONS
// ==========================================

// Get monthly recommendations for one purok
export const getPerPurokMonthlyRecommendations =
  async (req, res) => {
    try {
      const purok =
        getValidatedPurok(req);

      const data =
        await readPerPurokMonthlyRecommendations(
          purok
        );

      return sendSuccess(
        res,
        data
      );
    } catch (error) {
      const statusCode =
        error.message ===
        "Purok parameter is required."
          ? 400
          : 500;

      return sendError(
        res,
        error,
        statusCode
      );
    }
  };

// Get yearly recommendations for one purok
export const getPerPurokYearlyRecommendations =
  async (req, res) => {
    try {
      const purok =
        getValidatedPurok(req);

      const data =
        await readPerPurokYearlyRecommendations(
          purok
        );

      return sendSuccess(
        res,
        data
      );
    } catch (error) {
      const statusCode =
        error.message ===
        "Purok parameter is required."
          ? 400
          : 500;

      return sendError(
        res,
        error,
        statusCode
      );
    }
  };

// ==========================================
// ALL-PUROKS RECOMMENDATIONS
// ==========================================

// Get monthly recommendations for all puroks
export const getAllPuroksMonthlyRecommendations =
  async (req, res) => {
    try {
      const data =
        await readAllPuroksMonthlyRecommendations();

      return sendSuccess(
        res,
        data
      );
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

// Get yearly recommendations for all puroks
export const getAllPuroksYearlyRecommendations =
  async (req, res) => {
    try {
      const data =
        await readAllPuroksYearlyRecommendations();

      return sendSuccess(
        res,
        data
      );
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };

// ==========================================
// GENERATE ALL RECOMMENDATIONS
// ==========================================

export const getAllRecommendations =
  async (req, res) => {
    try {
      const data =
        await readAllRecommendationsService();

      return sendSuccess(
        res,
        data
      );
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  };
