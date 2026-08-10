import bcrypt from "bcryptjs";
import validator from "validator";
import { supabase } from "../config/supabase.js";
import { ensureAccountIdentityIsUnique } from "./accountIdentityModels.js";

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeContactNumber = (contactNumber) => {
  if (typeof contactNumber !== "string") {
    throw createError("A valid contact number is required.");
  }

  const compactNumber = contactNumber.trim().replace(/[\s()-]/g, "");
  const normalizedNumber = compactNumber.startsWith("09")
    ? `+63${compactNumber.slice(1)}`
    : compactNumber;

  if (!/^\+639\d{9}$/.test(normalizedNumber)) {
    throw createError(
      "Enter a valid Philippine mobile number, such as 09171234567."
    );
  }

  return normalizedNumber;
};

const validateConsumer = (username, password, fullName, email, contactNumber, purokNo) => {
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof fullName !== "string" ||
    typeof email !== "string" ||
    username.trim() === "" ||
    password.trim() === "" ||
    fullName.trim() === "" ||
    email.trim() === ""
  ) {
    throw createError(
      "Username, password, full name, email, and contact number are required fields."
    );
  }

  if (!validator.isEmail(email.trim())) {
    throw createError("A valid email address is required.");
  }

  normalizeContactNumber(contactNumber);

  if (!validator.isStrongPassword(password)) {
    throw createError(
      "Password must contain at least 8 characters, including uppercase, lowercase, number, and symbol."
    );
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw createError("Password must not exceed 72 bytes.");
  }

  if (purokNo !== null && purokNo !== undefined) {
    const parsedPurok = Number(purokNo);
    if (!Number.isInteger(parsedPurok) || parsedPurok < 1) {
      throw createError("Purok number must be a positive integer.");
    }
  }
};

export const createConsumer = async (
  username,
  password,
  fullName,
  email,
  contactNumber,
  purokNo = null
) => {
  validateConsumer(username, password, fullName, email, contactNumber, purokNo);

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = validator.normalizeEmail(email.trim()) ?? email.trim().toLowerCase();
  const normalizedFullName = fullName.trim().replace(/\s+/g, " ");

  await ensureAccountIdentityIsUnique({
    username: normalizedUsername,
    email: normalizedEmail,
    fullName: normalizedFullName,
  });

  const hashedPassword = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from("consumers")
    .insert({
      username: normalizedUsername,
      full_name: normalizedFullName,
      email: normalizedEmail,
      contact_number: normalizeContactNumber(contactNumber),
      purok_no: purokNo === null || purokNo === undefined ? null : Number(purokNo),
      password: hashedPassword,
    })
    .select("id, username, full_name, email, contact_number, purok_no, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError("The username, full name, or email is already in use.");
    }
    throw createError(`Failed to create consumer account: ${error.message}`, 500);
  }

  return data;
};

const CONSUMER_FIELDS =
  "id, username, full_name, email, contact_number, purok_no, status, created_at, updated_at";

const parseId = (id) => {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId < 1) {
    throw createError("A valid consumer ID is required.");
  }
  return parsedId;
};

export const getConsumers = async () => {
  const { data, error } = await supabase
    .from("consumers")
    .select(CONSUMER_FIELDS)
    .order("created_at", { ascending: false });

  if (error) {
    throw createError(`Failed to retrieve consumers: ${error.message}`, 500);
  }

  return data ?? [];
};

export const getConsumerById = async (id) => {
  const consumerId = parseId(id);
  const { data, error } = await supabase
    .from("consumers")
    .select(CONSUMER_FIELDS)
    .eq("id", consumerId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve consumer: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Consumer account not found.", 404);
  }

  return data;
};

export const updateConsumer = async (id, updates = {}) => {
  const consumerId = parseId(id);
  const allowedFields = [
    "username",
    "password",
    "fullName",
    "email",
    "contactNumber",
    "purokNo",
    "status",
  ];
  const suppliedFields = Object.keys(updates).filter((key) =>
    allowedFields.includes(key)
  );

  if (suppliedFields.length === 0) {
    throw createError("At least one consumer field must be provided.");
  }

  const updateData = {};

  if (updates.username !== undefined) {
    if (typeof updates.username !== "string" || updates.username.trim() === "") {
      throw createError("Username cannot be empty.");
    }
    updateData.username = updates.username.trim().toLowerCase();
  }

  if (updates.fullName !== undefined) {
    if (typeof updates.fullName !== "string" || updates.fullName.trim() === "") {
      throw createError("Full name cannot be empty.");
    }
    updateData.full_name = updates.fullName.trim();
  }

  if (updates.email !== undefined) {
    if (
      typeof updates.email !== "string" ||
      !validator.isEmail(updates.email.trim())
    ) {
      throw createError("A valid email address is required.");
    }
    updateData.email =
      validator.normalizeEmail(updates.email.trim()) ??
      updates.email.trim().toLowerCase();
  }

  if (updates.contactNumber !== undefined) {
    updateData.contact_number = normalizeContactNumber(updates.contactNumber);
  }

  if (updates.password !== undefined) {
    if (
      typeof updates.password !== "string" ||
      !validator.isStrongPassword(updates.password)
    ) {
      throw createError(
        "Password must contain at least 8 characters, including uppercase, lowercase, number, and symbol."
      );
    }
    if (Buffer.byteLength(updates.password, "utf8") > 72) {
      throw createError("Password must not exceed 72 bytes.");
    }
    updateData.password = await bcrypt.hash(updates.password, 10);
  }

  if (updates.purokNo !== undefined) {
    if (updates.purokNo === null) {
      updateData.purok_no = null;
    } else {
      const parsedPurok = Number(updates.purokNo);
      if (!Number.isInteger(parsedPurok) || parsedPurok < 1) {
        throw createError("Purok number must be a positive integer.");
      }
      updateData.purok_no = parsedPurok;
    }
  }

  if (updates.status !== undefined) {
    if (!["active", "inactive"].includes(updates.status)) {
      throw createError("Status must be either active or inactive.");
    }
    updateData.status = updates.status;
  }

  if (updateData.username || updateData.email) {
    const checks = [];
    if (updateData.username) {
      checks.push(
        supabase
          .from("consumers")
          .select("id")
          .eq("username", updateData.username)
          .neq("id", consumerId)
          .limit(1)
      );
    }
    if (updateData.email) {
      checks.push(
        supabase
          .from("consumers")
          .select("id")
          .eq("email", updateData.email)
          .neq("id", consumerId)
          .limit(1)
      );
    }

    const results = await Promise.all(checks);
    const failedCheck = results.find((result) => result.error);
    if (failedCheck) {
      throw createError(
        `Failed to check consumer account: ${failedCheck.error.message}`,
        500
      );
    }
    if (results.some((result) => result.data.length > 0)) {
      throw createError("The username or email is already in use.");
    }
  }

  const { data, error } = await supabase
    .from("consumers")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", consumerId)
    .select(CONSUMER_FIELDS)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to update consumer account: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Consumer account not found.", 404);
  }

  return data;
};

export const disconnectFlaggedConsumer = async (id) => {
  const consumerId = parseId(id);
  const { data: outstandingBills, error: billingError } = await supabase
    .from("billing")
    .select("id, billing_date, remaining_balance")
    .eq("user_id", consumerId)
    .gt("remaining_balance", 0)
    .order("billing_date", { ascending: true })
    .order("id", { ascending: true });

  if (billingError) {
    throw createError(`Failed to verify outstanding bills: ${billingError.message}`, 500);
  }
  if ((outstandingBills ?? []).length < 3) {
    throw createError(
      "This account is no longer eligible for disconnection because it has fewer than three outstanding bills.",
      409,
    );
  }

  const totalOutstanding = outstandingBills.reduce(
    (total, bill) => total + Number(bill.remaining_balance || 0),
    0,
  );
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const notificationDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const { error: notificationError } = await supabase
    .from("notifications")
    .upsert(
      {
        action_path: "/consumer/billing-ledger",
        announcement_date: notificationDate,
        announcement_type: "Account Alert",
        billing_id: outstandingBills[0].id,
        consumer_id: consumerId,
        event_key: `disconnection-warning:${consumerId}:3-outstanding-bills`,
        message: `Your account has been flagged for disconnection because it has ${outstandingBills.length} outstanding monthly bills totaling PHP ${totalOutstanding.toFixed(2)}. Contact the water district office immediately.`,
        notification_type: "disconnection_warning",
        priority: "critical",
        title: "Account flagged for disconnection",
      },
      { ignoreDuplicates: true, onConflict: "event_key" },
    );

  if (notificationError) {
    throw createError(`Failed to notify the resident: ${notificationError.message}`, 500);
  }

  return updateConsumer(consumerId, { status: "inactive" });
};

export const deleteConsumer = async (id) => {
  const consumerId = parseId(id);
  const { data, error } = await supabase
    .from("consumers")
    .delete()
    .eq("id", consumerId)
    .select(CONSUMER_FIELDS)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to delete consumer account: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Consumer account not found.", 404);
  }

  return data;
};
