import {
  createMonthlyBilling,
  getBillingById,
  getBillings,
  getBillingsByConsumer,
} from "../models/billingModels.js";
import { invalidateAdminDashboardCache } from "../services/adminDashboardService.js";

const sendError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);

  return res.status(error.statusCode ?? 500).json({
    success: false,
    message: error.message || fallbackMessage,
  });
};

export const generateMonthlyBilling = async (req, res) => {
  try {
    const billing = await createMonthlyBilling(req.body ?? {});
    await invalidateAdminDashboardCache();

    return res.status(201).json({
      success: true,
      message: "Monthly billing created successfully.",
      data: billing,
    });
  } catch (error) {
    return sendError(res, error, "Failed to create monthly billing.");
  }
};

export const listBillings = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getBillings(),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve billing records.");
  }
};

export const showBilling = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getBillingById(req.params.id),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve billing record.");
  }
};

export const listConsumerBillings = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getBillingsByConsumer(req.params.consumerId),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve consumer billing records.");
  }
};
