import {
  createReading,
  getAllPuroksMonthlyHistory as getAllPuroksMonthlyHistoryService,
  getAllPuroksYearlyHistory as getAllPuroksYearlyHistoryService,
  getConsumptionRanking,
  getOverallMonthlyHistory,
  getOverallYearlyHistory,
  getPerPurokMonthlyHistory,
  getPerPurokYearlyHistory,
} from "../services/consumptionServices.js";
import {
  getConsumptionRecordingContext,
  getConsumptionRecordingContexts,
  getAllConsumptionReadings,
  getConsumptionByConsumer,
  getConsumerPurok,
} from "../models/consumptionModels.js";
import {
  getCachedConsumption,
  invalidateConsumptionCache,
} from "../services/consumptionCache.js";

export const addConsumptionReading = async (req, res) => {
  try {
    const result = await createReading(req.body ?? {});
    const consumerId = result?.consumer_id ?? req.body?.consumerId;
    const purok = await getConsumerPurok(consumerId);
    await invalidateConsumptionCache({ purok });

    return res.status(201).json({
      success: true,
      message: "Meter reading created and monthly billing generated.",
      data: result,
    });
  } catch (error) {
    console.error("Create meter reading error:", error);

    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Failed to create meter reading.",
    });
  }
};

export const listConsumptionRecordingContexts = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getConsumptionRecordingContexts(),
    });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Failed to retrieve recording contexts.",
    });
  }
};

export const showConsumptionRecordingContext = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getConsumptionRecordingContext(req.params.consumerId),
    });
  } catch (error) {
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Failed to retrieve the recording context.",
    });
  }
};

export const listConsumerConsumption = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getConsumptionByConsumer(req.params.consumerId),
    });
  } catch (error) {
    console.error("Consumer consumption retrieval error:", error);
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Failed to retrieve consumer consumption.",
    });
  }
};

export const listAllConsumptionReadings = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getCachedConsumption(
        "readings:all",
        getAllConsumptionReadings,
      ),
    });
  } catch (error) {
    console.error("All consumption readings retrieval error:", error);
    return res.status(error.statusCode ?? 500).json({
      success: false,
      message: error.message || "Failed to retrieve consumption readings.",
    });
  }
};

const sendServiceResult = async (
  res,
  cacheResource,
  service,
  errorLabel,
  fallbackMessage,
) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getCachedConsumption(cacheResource, service),
    });
  } catch (error) {
    console.error(`${errorLabel}:`, error);
    return res.status(500).json({
      success: false,
      message: error.message || fallbackMessage,
    });
  }
};

export const getConsumptionRankingData = async (req, res) =>
  sendServiceResult(
    res,
    "ranking",
    getConsumptionRanking,
    "Consumption ranking error",
    "Failed to retrieve purok consumption ranking."
  );

export const getMonthlyHistory = async (req, res) =>
  sendServiceResult(
    res,
    "history:monthly",
    getOverallMonthlyHistory,
    "Monthly history error",
    "Failed to retrieve monthly consumption history."
  );

export const getYearlyHistory = async (req, res) =>
  sendServiceResult(
    res,
    "history:yearly",
    getOverallYearlyHistory,
    "Yearly history error",
    "Failed to retrieve yearly consumption history."
  );

export const getPurokMonthlyHistory = async (req, res) => {
  const { purok } = req.params;
  if (!purok) {
    return res.status(400).json({
      success: false,
      message: "Purok parameter is required.",
    });
  }

  return sendServiceResult(
    res,
    `history:monthly:purok:${encodeURIComponent(purok)}`,
    () => getPerPurokMonthlyHistory(purok),
    "Purok monthly history error",
    "Failed to retrieve purok monthly consumption history."
  );
};

export const getPurokYearlyHistory = async (req, res) => {
  const { purok } = req.params;
  if (!purok) {
    return res.status(400).json({
      success: false,
      message: "Purok parameter is required.",
    });
  }

  return sendServiceResult(
    res,
    `history:yearly:purok:${encodeURIComponent(purok)}`,
    () => getPerPurokYearlyHistory(purok),
    "Purok yearly history error",
    "Failed to retrieve purok yearly consumption history."
  );
};

export const getAllPuroksMonthlyHistory = async (req, res) =>
  sendServiceResult(
    res,
    "history:monthly:all-puroks",
    getAllPuroksMonthlyHistoryService,
    "All puroks monthly history error",
    "Failed to retrieve all puroks monthly consumption history."
  );

export const getAllPuroksYearlyHistory = async (req, res) =>
  sendServiceResult(
    res,
    "history:yearly:all-puroks",
    getAllPuroksYearlyHistoryService,
    "All puroks yearly history error",
    "Failed to retrieve all puroks yearly consumption history."
  );

export const generateAllHistoryConsumption = async (req, res) => {
  try {
    const history = await getCachedConsumption(
      "history:yearly",
      getOverallYearlyHistory,
    );
    const yearlyHistory = Array.isArray(history) ? history : [];
    const overallConsumption = yearlyHistory.reduce((total, item) => {
      const consumption = Number(item?.consumption ?? 0);
      return total + (Number.isFinite(consumption) ? consumption : 0);
    }, 0);

    return res.status(200).json({
      success: true,
      data: {
        overallConsumption: Number(overallConsumption.toFixed(2)),
        recordCount: yearlyHistory.length,
        yearlyHistory,
      },
    });
  } catch (error) {
    console.error("All history consumption error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve overall consumption history.",
    });
  }
};
