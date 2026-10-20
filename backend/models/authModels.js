import bcrypt from "bcryptjs";
import validator from "validator";
import { getLoginLockoutMinutes, getLoginMaxAttempts } from "../config/auth.js";
import { supabase } from "../config/supabase.js";

const ACCOUNT_SOURCES = [
  { role: "admin", table: "admins" },
  { role: "meter-reader", table: "meter_readers" },
  { role: "consumer", table: "consumers" },
];

const getAccountSource = (role) => ACCOUNT_SOURCES.find((item) =>
  item.role === role || (role === "super-admin" && item.role === "admin")
);

const createLockoutError = (lockedUntil) => {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000),
  );
  const error = new Error(
    `Too many incorrect attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
  );
  error.statusCode = 429;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
};

const findAccount = async (table, identifier) => {
  const fields = table === "admins"
    ? "id, username, email, password, status, role, failed_login_attempts, locked_until"
    : table === "consumers"
      ? "id, username, email, password, status, failed_login_attempts, locked_until, onboarding_completed"
      : "id, username, email, password, status, failed_login_attempts, locked_until";
  const emailResult = await supabase
    .from(table)
    .select(fields)
    .ilike("email", identifier)
    .maybeSingle();

  if (emailResult.error) {
    throw new Error(`Failed to check account: ${emailResult.error.message}`);
  }
  if (emailResult.data) return emailResult.data;

  const usernameResult = await supabase
    .from(table)
    .select(fields)
    .ilike("username", identifier)
    .maybeSingle();

  if (usernameResult.error) {
    throw new Error(`Failed to check account: ${usernameResult.error.message}`);
  }
  return usernameResult.data;
};

const recordFailedLogin = async (source, account) => {
  // Login lockout is enforced here in JS (not in the record_failed_login DB
  // function) so LOGIN_MAX_ATTEMPTS / LOGIN_LOCKOUT_MINUTES from backend/.env
  // take effect without any new SQL migration. It reuses the existing
  // failed_login_attempts / locked_until columns from the base migration.
  const maxAttempts = getLoginMaxAttempts();
  const lockoutMinutes = getLoginLockoutMinutes();
  const now = Date.now();
  const previousLockExpired =
    account.locked_until && new Date(account.locked_until).getTime() <= now;
  const attempts = previousLockExpired ? 1 : Number(account.failed_login_attempts ?? 0) + 1;
  const lockedUntil =
    attempts >= maxAttempts
      ? new Date(now + lockoutMinutes * 60 * 1000).toISOString()
      : null;

  const { error } = await supabase
    .from(source.table)
    .update({
      failed_login_attempts: attempts,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  if (error) {
    throw new Error(`Failed to record login attempt: ${error.message}`);
  }

  if (lockedUntil) {
    throw createLockoutError(lockedUntil);
  }

  return {
    failedAttempts: attempts,
    remainingAttempts: Math.max(0, maxAttempts - attempts),
  };
};

const resetLoginFailures = async (table, accountId) => {
  const { error } = await supabase
    .from(table)
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (error) {
    throw new Error(`Failed to reset login attempts: ${error.message}`);
  }
};

const verifyAndUpgradePassword = async (_table, account, password) => {
  const storedPassword = String(account.password ?? "");
  const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(storedPassword);

  if (!isBcryptHash) {
    return false;
  }

  return bcrypt.compare(password, storedPassword);
};

export async function authenticateAccount(identifier, password) {
  const normalizedIdentifier = String(identifier ?? "").trim().toLowerCase();
  if (!normalizedIdentifier) {
    const error = new Error("Email address or username is required.");
    error.statusCode = 400;
    error.field = "identifier";
    throw error;
  }
  if (typeof password !== "string" || !password) {
    const error = new Error("Password is required.");
    error.statusCode = 400;
    error.field = "password";
    throw error;
  }

  let identifierMatched = false;
  let loginAttemptStatus = null;

  for (const source of ACCOUNT_SOURCES) {
    const account = await findAccount(source.table, normalizedIdentifier);
    if (!account) {
      continue;
    }

    identifierMatched = true;

    if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
      throw createLockoutError(account.locked_until);
    }

    if (!(await verifyAndUpgradePassword(source.table, account, password))) {
      loginAttemptStatus = await recordFailedLogin(source, account);
      continue;
    }

    if (account.status && account.status !== "active") {
      const error = new Error("This account is inactive.");
      error.statusCode = 403;
      throw error;
    }

    if (account.failed_login_attempts || account.locked_until) {
      await resetLoginFailures(source.table, account.id);
    }

    return {
      id: account.id,
      username: account.username,
      email: account.email,
      name: account.username,
      status: account.status,
      role: source.role === "admin" && account.role === "super-admin" ? "super-admin" : source.role,
      // Only consumers have first-login onboarding. Omitted for staff so the
      // response shape for admins and meter readers stays unchanged.
      ...(source.table === "consumers"
        ? { onboardingCompleted: account.onboarding_completed === true }
        : {}),
    };
  }

  const error = new Error(
    identifierMatched
      ? "Incorrect password."
      : "Email address or username was not found.",
  );
  error.statusCode = 401;
  error.field = identifierMatched ? "password" : "identifier";
  if (identifierMatched && loginAttemptStatus) {
    error.failedAttempts = loginAttemptStatus.failedAttempts;
    error.remainingAttempts = loginAttemptStatus.remainingAttempts;
  }
  throw error;
}

export async function findPasswordResetAccount(email) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!validator.isEmail(normalizedEmail)) {
    const error = new Error("Enter a valid email address.");
    error.statusCode = 400;
    error.field = "email";
    throw error;
  }

  for (const source of ACCOUNT_SOURCES) {
    const account = await findAccount(source.table, normalizedEmail);
    if (account && account.email?.toLowerCase() === normalizedEmail) {
      return { ...account, role: source.role, table: source.table };
    }
  }
  return null;
}

export async function reservePasswordResetOtpRequest(requestKey) {
  const { data, error } = await supabase.rpc("reserve_password_reset_otp_request", {
    p_request_key: requestKey,
  });

  if (error) {
    throw new Error(`Failed to check password reset request limit: ${error.message}`);
  }

  return {
    allowed: data?.allowed === true,
    reason: data?.reason ?? null,
    retryAfterSeconds: Math.max(1, Number(data?.retry_after_seconds ?? 1)),
  };
}

// The same wording the admin create/edit paths already use, so every entry
// point reports an identical policy failure.
export const PASSWORD_POLICY_MESSAGE =
  "Password must contain at least 8 characters, including uppercase, lowercase, number, and symbol.";

// Shared password policy. It runs the same checks the admin create and edit
// paths already run (validator.isStrongPassword plus the bcrypt 72-byte
// limit), so every entry point enforces one rule and one message.
//
// The 72-byte limit matters because bcrypt silently truncates: two different
// long passwords would end up as the same hash.
export function assertStrongPassword(password) {
  if (typeof password !== "string" || !validator.isStrongPassword(password)) {
    const error = new Error(PASSWORD_POLICY_MESSAGE);
    error.statusCode = 400;
    error.field = "password";
    throw error;
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    const error = new Error("Password must not exceed 72 bytes.");
    error.statusCode = 400;
    error.field = "password";
    throw error;
  }
}

export async function hashAccountPassword(password) {
  assertStrongPassword(password);
  return bcrypt.hash(password, 10);
}

export async function resetAccountPassword({ accountId, password, role }) {
  const source = getAccountSource(role);
  if (!source) return false;

  assertStrongPassword(password);

  const { data: account, error: findError } = await supabase
    .from(source.table)
    .select("id, password")
    .eq("id", accountId)
    .maybeSingle();
  if (findError) throw new Error(`Failed to check account: ${findError.message}`);
  if (!account) return false;

  const hashedPassword = await bcrypt.hash(password, 10);
  const { error } = await supabase
    .from(source.table)
    .update({
      password: hashedPassword,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (error) throw new Error(`Failed to reset password: ${error.message}`);
  return true;
}

export async function getPasswordHash(accountId, role) {
  const source = getAccountSource(role);
  if (!source) return null;
  const { data, error } = await supabase
    .from(source.table)
    .select("password")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(`Failed to check password reset session: ${error.message}`);
  return data?.password ?? null;
}

export async function getPasswordResetAccountById(accountId, role) {
  const source = getAccountSource(role);
  if (!source) return null;
  const { data, error } = await supabase
    .from(source.table)
    .select(source.table === "admins" ? "id, username, email, password, status, role" : "id, username, email, password, status")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(`Failed to check account: ${error.message}`);
  return data ? { ...data, role: source.role === "admin" && data.role === "super-admin" ? "super-admin" : source.role, table: source.table } : null;
}

export async function changePasswordWithCurrent({ accountId, role, currentPassword, newPassword }) {
  const account = await getPasswordResetAccountById(accountId, role);
  if (!account) {
    const error = new Error("Account not found.");
    error.statusCode = 404;
    throw error;
  }
  if (typeof currentPassword !== "string" || !currentPassword) {
    const error = new Error("Enter your current password.");
    error.statusCode = 400;
    error.field = "currentPassword";
    throw error;
  }
  if (!(await verifyAndUpgradePassword(account.table, account, currentPassword))) {
    const error = new Error("Your current password is incorrect.");
    error.statusCode = 400;
    error.field = "currentPassword";
    throw error;
  }
  if (currentPassword === newPassword) {
    const error = new Error("Your new password must be different from your current password.");
    error.statusCode = 400;
    error.field = "newPassword";
    throw error;
  }
  return resetAccountPassword({ accountId, role, password: newPassword });
}
