import {
  readAllPuroksMonthlyPrediction,
  readAllPuroksYearlyPrediction,
  readOverallMonthlyPrediction,
  readOverallYearlyPrediction,
  readPerPurokMonthlyPrediction,
  readPerPurokYearlyPrediction,
} from "../services/predictionServices.js";

const sendPrediction = async (res, service, errorLabel, fallbackMessage) => {
  try {
    return res.status(200).json({ success: true, data: await service() });
  } catch (error) {
    console.error(`${errorLabel}:`, error);
    return res.status(500).json({
      success: false,
      message: error.message || fallbackMessage,
    });
  }
};

const requirePurok = (req, res) => {
  const { purok } = req.params;
  if (!purok) {
    res.status(400).json({
      success: false,
      message: "Purok parameter is required.",
    });
    return null;
  }
  return purok;
};

export const getOverallMonthlyPrediction = async (req, res) =>
  sendPrediction(
    res,
    readOverallMonthlyPrediction,
    "Overall monthly prediction retrieval error",
    "Failed to retrieve the stored overall monthly consumption prediction."
  );

export const getOverallYearlyPrediction = async (req, res) =>
  sendPrediction(
    res,
    readOverallYearlyPrediction,
    "Overall yearly prediction retrieval error",
    "Failed to retrieve the stored overall yearly consumption prediction."
  );

export const getPerPurokMonthlyPrediction = async (req, res) => {
  const purok = requirePurok(req, res);
  if (!purok) return;

  return sendPrediction(
    res,
    () => readPerPurokMonthlyPrediction(purok),
    "Per purok monthly prediction retrieval error",
    "Failed to retrieve the stored purok monthly consumption prediction."
  );
};

export const getPerPurokYearlyPrediction = async (req, res) => {
  const purok = requirePurok(req, res);
  if (!purok) return;

  return sendPrediction(
    res,
    () => readPerPurokYearlyPrediction(purok),
    "Per purok yearly prediction retrieval error",
    "Failed to retrieve the stored purok yearly consumption prediction."
  );
};

export const getAllPuroksMonthlyPrediction = async (req, res) =>
  sendPrediction(
    res,
    readAllPuroksMonthlyPrediction,
    "All puroks monthly prediction retrieval error",
    "Failed to retrieve the stored all-puroks monthly predictions."
  );

export const getAllPuroksYearlyPrediction = async (req, res) =>
  sendPrediction(
    res,
    readAllPuroksYearlyPrediction,
    "All puroks yearly prediction retrieval error",
    "Failed to retrieve the stored all-puroks yearly predictions."
  );
