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
  if (fullName) {
    checks.push({ field: "full_name", label: "resident full name", table: "consumers", value: fullName, caseInsensitive: true });
  }

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
}
