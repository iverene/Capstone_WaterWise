import {
  createConsumer,
  deleteConsumer,
  disconnectFlaggedConsumer,
  getConsumerById,
  getConsumers,
  updateConsumer,
} from "../models/consumerModels.js";

const sendError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);
  return res.status(error.statusCode ?? 500).json({
    success: false,
    message: error.message || fallbackMessage,
  });
};

export const registerConsumer = async (req, res) => {
  try {
    const {
      username,
      password,
      firstName,
      middleName,
      lastName,
      fullName,
      email,
      contactNumber,
      purokNo = null,
    } = req.body ?? {};

    const consumer = await createConsumer(
      username,
      password,
      { firstName, middleName, lastName, fullName },
      email,
      contactNumber,
      purokNo
    );

    return res.status(201).json({
      success: true,
      message: "Consumer account created successfully.",
      data: consumer,
    });
  } catch (error) {
    return sendError(res, error, "Failed to create consumer account.");
  }
};

export const listConsumers = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await getConsumers() });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve consumers.");
  }
};

export const showConsumer = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getConsumerById(req.params.id),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve consumer.");
  }
};

export const editConsumer = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Consumer account updated successfully.",
      data: await updateConsumer(req.params.id, req.body ?? {}),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update consumer account.");
  }
};

export const disconnectConsumer = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Consumer account disconnected successfully.",
      data: await disconnectFlaggedConsumer(req.params.id),
    });
  } catch (error) {
    return sendError(res, error, "Failed to disconnect consumer account.");
  }
};

export const removeConsumer = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Consumer account deleted successfully.",
      data: await deleteConsumer(req.params.id),
    });
  } catch (error) {
    return sendError(res, error, "Failed to delete consumer account.");
  }
};
