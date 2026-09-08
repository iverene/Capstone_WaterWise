import { supabase } from "../config/supabase.js";

const ACCOUNT_TABLES = ["admins", "consumers", "meter_readers"];

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

export async function ensureAccountIdentityIsUnique({ username, email, fullName = null }) {
  const checks = ACCOUNT_TABLES.flatMap((table) => [
    { field: "username", label: "username", table, value: username },
    { field: "email", label: "email address", table, value: email },
  ]);

  const results = await Promise.all(checks.map((check) => {
    let query = supabase.from(check.table).select("id").limit(1);
    query = check.caseInsensitive
      ? query.ilike(check.field, check.value)
      : query.eq(check.field, check.value);
    return query;
  }));

  const failedIndex = results.findIndex((result) => result.error);
  if (failedIndex >= 0) {
    throw createError(`Failed to check account uniqueness: ${results[failedIndex].error.message}`, 500);
  }

  const duplicateIndex = results.findIndex((result) => result.data.length > 0);
  if (duplicateIndex >= 0) {
    const duplicate = checks[duplicateIndex];
    throw createError(`The ${duplicate.label} ${duplicate.value} is already in use.`);
  }

  if (fullName) {
    const normalizedFullName = String(fullName).trim().replace(/\s+/g, " ").toLowerCase();
    const { data, error } = await supabase
      .from("consumers")
      .select("id, first_name, middle_name, last_name");
    if (error) {
      throw createError(`Failed to check account uniqueness: ${error.message}`, 500);
    }
    const duplicateName = (data ?? []).some((consumer) => {
      const composed = [consumer.first_name, consumer.middle_name, consumer.last_name]
        .map((part) => String(part ?? "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return composed === normalizedFullName;
    });
    if (duplicateName) {
      throw createError(`The resident full name ${fullName} is already in use.`);
    }
  }
}

export function duplicateAccountIdentityMessage(error, { includeFullName = false } = {}) {
  const databaseMessage = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includeFullName && (databaseMessage.includes("full_name") || databaseMessage.includes("full name") || databaseMessage.includes("first_name") || databaseMessage.includes("last_name") || databaseMessage.includes("consumer-name"))) {
    return "This resident full name is already in use.";
  }
  if (databaseMessage.includes("email")) {
    return "This email address is already in use.";
  }
  if (databaseMessage.includes("username")) {
    return "This username is already in use.";
  }
  return includeFullName
    ? "This username, resident full name, or email address is already in use."
    : "This username or email address is already in use.";
}
