import bcrypt from "bcryptjs";
import validator from "validator";
import { supabase } from "../config/supabase.js";
import { ensureAccountIdentityIsUnique } from "./accountIdentityModels.js";

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

const validateAdmin = (username, password, email) => {
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof email !== "string" ||
    username.trim() === "" ||
    password.trim() === "" ||
    email.trim() === ""
  ) {
    throw createError("Username, password, and email are required fields.");
  }

  if (!validator.isEmail(email.trim())) {
    throw createError("A valid email address is required.");
  }

  if (!validator.isStrongPassword(password)) {
    throw createError(
      "Password must contain at least 8 characters, including uppercase, lowercase, number, and symbol."
    );
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw createError("Password must not exceed 72 bytes.");
  }
};

export const createAdmin = async (username, password, email) => {
  validateAdmin(username, password, email);

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = validator.normalizeEmail(email.trim()) ?? email.trim().toLowerCase();

  await ensureAccountIdentityIsUnique({ username: normalizedUsername, email: normalizedEmail });

  const hashedPassword = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from("admins")
    .insert({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      role: "admin",
    })
    .select("id, username, email, role, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError("The username or email is already in use.");
    }
    throw createError(`Failed to create admin account: ${error.message}`, 500);
  }

  return data;
};

const ADMIN_FIELDS = "id, username, email, role, status, created_at, updated_at";

const parseId = (id) => {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId < 1) {
    throw createError("A valid admin ID is required.");
  }
  return parsedId;
};

export const getAdmins = async ({ page = 1, pageSize = 5 } = {}) => {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("admins")
    .select(ADMIN_FIELDS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    throw createError(`Failed to retrieve admins: ${error.message}`, 500);
  }

  const total = count ?? 0;
  return { items: data ?? [], page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

export const getAdminById = async (id) => {
  const adminId = parseId(id);
  const { data, error } = await supabase
    .from("admins")
    .select(ADMIN_FIELDS)
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to retrieve admin: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Admin account not found.", 404);
  }

  return data;
};

export const updateAdmin = async (id, updates = {}) => {
  const adminId = parseId(id);
  const allowedFields = ["username", "email", "password", "status"];
  const suppliedFields = Object.keys(updates).filter((key) =>
    allowedFields.includes(key)
  );

  if (suppliedFields.length === 0) {
    throw createError("At least one admin field must be provided.");
  }

  const updateData = {};

  if (updates.username !== undefined) {
    if (typeof updates.username !== "string" || updates.username.trim() === "") {
      throw createError("Username cannot be empty.");
    }
    updateData.username = updates.username.trim().toLowerCase();
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
          .from("admins")
          .select("id")
          .eq("username", updateData.username)
          .neq("id", adminId)
          .limit(1)
      );
    }
    if (updateData.email) {
      checks.push(
        supabase
          .from("admins")
          .select("id")
          .eq("email", updateData.email)
          .neq("id", adminId)
          .limit(1)
      );
    }

    const results = await Promise.all(checks);
    const failedCheck = results.find((result) => result.error);
    if (failedCheck) {
      throw createError(
        `Failed to check admin account: ${failedCheck.error.message}`,
        500
      );
    }
    if (results.some((result) => result.data.length > 0)) {
      throw createError("The username or email is already in use.");
    }
  }

  const { data, error } = await supabase
    .from("admins")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", adminId)
    .select(ADMIN_FIELDS)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to update admin account: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Admin account not found.", 404);
  }

  return data;
};

export const deleteAdmin = async (id) => {
  const adminId = parseId(id);
  const { data, error } = await supabase
    .from("admins")
    .delete()
    .eq("id", adminId)
    .select(ADMIN_FIELDS)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to delete admin account: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Admin account not found.", 404);
  }

  return data;
};
