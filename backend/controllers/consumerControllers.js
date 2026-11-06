import {
  completeConsumerOnboarding,
  createConsumer,
  deleteConsumer,
  disconnectFlaggedConsumer,
  getConsumerById,
  getConsumers,
  updateConsumer,
  updateConsumerSelfProfile,
} from "../models/consumerModels.js";
import { invalidateAdminDashboardCache } from "../services/adminDashboardService.js";
import {
  clearRefreshCookie,
  clearSessionCookie,
} from "../models/sessionCookieModels.js";

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
    await invalidateAdminDashboardCache();

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
    const consumer = await updateConsumer(req.params.id, req.body ?? {});
    await invalidateAdminDashboardCache();
    return res.status(200).json({
      success: true,
      message: "Consumer account updated successfully.",
      data: consumer,
    });
  } catch (error) {
    return sendError(res, error, "Failed to update consumer account.");
  }
};

export const disconnectConsumer = async (req, res) => {
  try {
    const consumer = await disconnectFlaggedConsumer(req.params.id);
    await invalidateAdminDashboardCache();
    return res.status(200).json({
      success: true,
      message: "Consumer account disconnected successfully.",
      data: consumer,
    });
  } catch (error) {
    return sendError(res, error, "Failed to disconnect consumer account.");
  }
};

export const removeConsumer = async (req, res) => {
  try {
    const consumer = await deleteConsumer(req.params.id);
    await invalidateAdminDashboardCache();
    return res.status(200).json({
      success: true,
      message: "Consumer account deleted successfully.",
      data: consumer,
    });
  } catch (error) {
    return sendError(res, error, "Failed to delete consumer account.");
  }
};

// Self-service profile update. The target account always comes from the
// session (req.user.id), never from the URL or body, so a consumer can only
// ever edit their own record. The model enforces the field allowlist too.
export const updateOwnProfile = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Your profile has been updated.",
      data: await updateConsumerSelfProfile(req.user.id, req.body ?? {}),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update your profile.");
  }
};

export const completeOwnOnboarding = async (req, res) => {
  try {
    const password =
      typeof req.body?.password === "string" ? req.body.password : undefined;

    const data = await completeConsumerOnboarding(req.user.id, password);

    // Setting the password invalidates the session: the access token carries
    // a fingerprint of the password hash, so every further request with it is
    // rejected. Clear both cookies right away instead of leaving a dead
    // session behind on a shared device.
    if (password) {
      clearSessionCookie(res, req);
      clearRefreshCookie(res, req);
    }

    return res.status(200).json({
      success: true,
      message: "Onboarding completed.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Failed to complete onboarding.");
  }
};
