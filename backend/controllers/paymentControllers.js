import {
  createPayment,
  createWaterfallPayment,
  getPaymentById,
  getPayments,
  getPaymentsByBilling,
  getPaymentsByConsumer,
} from "../models/paymentModels.js";

const sendError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);
  return res.status(error.statusCode ?? 500).json({
    success: false,
    message: error.message || fallbackMessage,
  });
};

export async function addPayment(req, res) {
  try {
    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully.",
      data: await createPayment(req.body ?? {}),
    });
  } catch (error) {
    return sendError(res, error, "Failed to record payment.");
  }
}

export async function listPayments(req, res) {
  try {
    return res.status(200).json({ success: true, data: await getPayments() });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve payments.");
  }
}

export async function showPayment(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: await getPaymentById(req.params.id),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve payment.");
  }
}

export async function listBillingPayments(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: await getPaymentsByBilling(req.params.billingId),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve billing payments.");
  }
}

export async function listConsumerPayments(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: await getPaymentsByConsumer(req.params.consumerId),
    });
  } catch (error) {
    return sendError(res, error, "Failed to retrieve consumer payments.");
  }
}

export async function allocatePayment(req, res) {
  try {
    return res.status(201).json({
      success: true,
      message: "Payment allocated oldest to newest.",
      data: await createWaterfallPayment(req.body ?? {}),
    });
  } catch (error) {
    return sendError(res, error, "Failed to allocate payment.");
  }
}
