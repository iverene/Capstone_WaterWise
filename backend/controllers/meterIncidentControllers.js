import {
  approveMeterIncident,
  createMeterIncident,
  getAveragePriorUsage,
  getAverageWindowMonths,
  getConsumerIncidentHistory,
  getMeterIncident,
  hasPendingIncident,
  listMeterIncidents,
  rejectMeterIncident,
  updateMeterIncident,
} from "../models/meterIncidentModels.js";

const sendError = (res, error, fallback) => {
  const status = error.statusCode ?? 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({
    success: false,
    message: error.message || fallback,
    ...(error.code ? { code: error.code } : {}),
  });
};

export const listIncidents = async (req, res) => {
  try {
    const data = await listMeterIncidents({
      status: req.query.status,
      reviewStatus: req.query.reviewStatus,
      consumerId: req.query.consumerId,
      limit: req.query.limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve meter incidents.");
  }
};

export const showIncident = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await getMeterIncident(req.params.id) });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve the meter incident.");
  }
};

export const logIncident = async (req, res) => {
  try {
    const data = await createMeterIncident(req.body ?? {}, req.user);
    const approved = data.reviewStatus === "approved";
    return res.status(201).json({
      success: true,
      message: approved
        ? "Meter incident logged and authorized."
        : "Meter incident logged. It holds the resident's payments until an admin approves it.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to log the meter incident.");
  }
};

export const updateIncident = async (req, res) => {
  try {
    const data = await updateMeterIncident(req.params.id, req.body ?? {}, req.user);
    return res.status(200).json({
      success: true,
      message: data.reviewStatus === "approved"
        ? "Meter incident updated."
        : "Meter incident updated. It needs an admin review before payments resume.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to update the meter incident.");
  }
};

export const approveIncident = async (req, res) => {
  try {
    const data = await approveMeterIncident(req.params.id, req.user);
    return res.status(200).json({
      success: true,
      message: "Meter incident approved.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to approve the meter incident.");
  }
};

export const rejectIncident = async (req, res) => {
  try {
    const data = await rejectMeterIncident(req.params.id, req.user, req.body?.reason);
    return res.status(200).json({
      success: true,
      message: "Meter incident rejected.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to reject the meter incident.");
  }
};

export const listConsumerIncidents = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getConsumerIncidentHistory(req.params.consumerId),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve the consumer meter history.");
  }
};

export const showAveragePreview = async (req, res) => {
  try {
    const window = await getAverageWindowMonths();
    const result = await getAveragePriorUsage(req.params.consumerId, window);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error, "Failed to compute the average prior usage.");
  }
};

export const showPaymentHold = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: { consumerId: Number(req.params.consumerId), hold: await hasPendingIncident(req.params.consumerId) },
    });
  } catch (error) {
    return sendError(res, error, "Failed to verify the meter incident hold.");
  }
};
