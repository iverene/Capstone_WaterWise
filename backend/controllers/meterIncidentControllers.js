import {
  createMeterIncident,
  getConsumerIncidentHistory,
  getMeterIncident,
  listMeterIncidents,
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
    return res.status(201).json({
      success: true,
      message: "Meter replacement recorded.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to record the meter replacement.");
  }
};

export const updateIncident = async (req, res) => {
  try {
    const data = await updateMeterIncident(req.params.id, req.body ?? {}, req.user);
    return res.status(200).json({
      success: true,
      message: "Meter replacement corrected.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to correct the meter replacement.");
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
