import bcrypt from "bcryptjs";
import validator from "validator";
import { supabase } from "../config/supabase.js";
import { verifyEmailDomain } from "../services/emailDomainService.js";
import {
  duplicateAccountIdentityMessage,
  ensureAccountIdentityIsUnique,
} from "./accountIdentityModels.js";
import { hashAccountPassword } from "./authModels.js";

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
  // Always store the local 09xxxxxxxxx form so the database matches what the
  // resident and the office actually type. The older +639xxxxxxxxx form is
  // still accepted on input so anything already in flight keeps working.
  const localNumber = compactNumber.startsWith("+63")
    ? `0${compactNumber.slice(3)}`
    : compactNumber;

  if (!/^09\d{9}$/.test(localNumber)) {
    throw createError(
      "Enter a valid Philippine mobile number, such as 09171234567."
    );
  }

  return localNumber;
};

const normalizeNamePart = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
};

export const composeFullName = (firstName, middleName, lastName) =>
  [firstName, middleName, lastName]
    .map((part) => normalizeNamePart(part ?? ""))
    .filter(Boolean)
    .join(" ");

const splitLegacyFullName = (fullName) => {
  const parts = normalizeNamePart(fullName).split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
};

const resolveNameParts = (firstName, middleName, lastName, legacyFullName) => {
  const hasSplitParts =
    firstName !== undefined || middleName !== undefined || lastName !== undefined;
  if (hasSplitParts) {
    return {
      firstName: normalizeNamePart(firstName ?? ""),
      middleName: normalizeNamePart(middleName ?? ""),
      lastName: normalizeNamePart(lastName ?? ""),
    };
  }
  return splitLegacyFullName(legacyFullName ?? "");
};

const validateConsumer = (username, password, nameParts, email, contactNumber, purokNo) => {
  const { firstName, middleName, lastName } = nameParts ?? {};
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof email !== "string" ||
    username.trim() === "" ||
    password.trim() === "" ||
    email.trim() === ""
  ) {
    throw createError(
      "Username, password, first name, last name, email, and contact number are required fields."
    );
  }

  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    firstName.trim() === "" ||
    lastName.trim() === ""
  ) {
    throw createError("First name and last name are required fields.");
  }

  if (middleName !== undefined && middleName !== null && typeof middleName !== "string") {
    throw createError("Middle name must be a text value.");
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
  nameInput,
  email,
  contactNumber,
  purokNo = null
) => {
  const nameParts =
    typeof nameInput === "string"
      ? splitLegacyFullName(nameInput)
      : resolveNameParts(
          nameInput?.firstName,
          nameInput?.middleName,
          nameInput?.lastName,
          nameInput?.fullName
        );
  validateConsumer(username, password, nameParts, email, contactNumber, purokNo);

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = validator.normalizeEmail(email.trim()) ?? email.trim().toLowerCase();
  const normalizedFirstName = normalizeNamePart(nameParts.firstName);
  const normalizedMiddleName = normalizeNamePart(nameParts.middleName);
  const normalizedLastName = normalizeNamePart(nameParts.lastName);
  const composedFullName = composeFullName(
    normalizedFirstName,
    normalizedMiddleName,
    normalizedLastName
  );

  await ensureAccountIdentityIsUnique({
    username: normalizedUsername,
    email: normalizedEmail,
    fullName: composedFullName,
  });
  await verifyEmailDomain(normalizedEmail);

  const hashedPassword = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from("consumers")
    .insert({
      username: normalizedUsername,
      first_name: normalizedFirstName,
      middle_name: normalizedMiddleName === "" ? null : normalizedMiddleName,
      last_name: normalizedLastName,
      email: normalizedEmail,
      contact_number: normalizeContactNumber(contactNumber),
      purok_no: purokNo === null || purokNo === undefined ? null : Number(purokNo),
      password: hashedPassword,
    })
    .select("id, username, first_name, middle_name, last_name, email, contact_number, purok_no, status, onboarding_completed, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw createError(duplicateAccountIdentityMessage(error, { includeFullName: true }));
    }
    throw createError(`Failed to create consumer account: ${error.message}`, 500);
  }

  return data;
};

const CONSUMER_FIELDS =
  "id, username, first_name, middle_name, last_name, email, contact_number, purok_no, status, onboarding_completed, created_at, updated_at";

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
    "firstName",
    "middleName",
    "lastName",
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

  if (
    updates.firstName !== undefined ||
    updates.middleName !== undefined ||
    updates.lastName !== undefined ||
    updates.fullName !== undefined
  ) {
    const current = await getConsumerById(consumerId);
    const resolved = resolveNameParts(
      updates.firstName !== undefined
        ? updates.firstName
        : current.first_name ?? "",
      updates.middleName !== undefined
        ? updates.middleName
        : current.middle_name ?? "",
      updates.lastName !== undefined
        ? updates.lastName
        : current.last_name ?? "",
      updates.fullName
    );
    if (resolved.firstName.trim() === "" || resolved.lastName.trim() === "") {
      throw createError("First name and last name cannot be empty.");
    }
    updateData.first_name = normalizeNamePart(resolved.firstName);
    const normalizedMiddle = normalizeNamePart(resolved.middleName);
    updateData.middle_name = normalizedMiddle === "" ? null : normalizedMiddle;
    updateData.last_name = normalizeNamePart(resolved.lastName);
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
    await verifyEmailDomain(updateData.email);
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
    if (!["active", "inactive", "disconnected"].includes(updates.status)) {
      throw createError("Status must be active, inactive, or disconnected.");
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
    if (error.code === "23505") {
      throw createError(duplicateAccountIdentityMessage(error, { includeFullName: true }));
    }
    throw createError(`Failed to update consumer account: ${error.message}`, 500);
  }
  if (!data) {
    throw createError("Consumer account not found.", 404);
  }

  return data;
};

// Fields a consumer may change on their own account from the portal.
// Everything else stays staff-managed: the name appears on bills and receipts,
// the username is a login identifier, the email has its own OTP-verified flow
// (completeConsumerEmailChange), and status is an office decision.
const CONSUMER_SELF_EDITABLE_FIELDS = ["contactNumber", "purokNo"];

// While the first-login onboarding is still pending the resident may also
// replace the email address they were issued, without the emailed
// verification code. The account has not been claimed yet, so there is no
// established address to protect. Once onboarding is done the email falls
// back to CONSUMER_SELF_EDITABLE_FIELDS and can only be changed through the
// OTP flow in Profile -> Account settings -> Change email.
const CONSUMER_ONBOARDING_EDITABLE_FIELDS = ["contactNumber", "purokNo", "email"];

export const updateConsumerSelfProfile = async (id, updates = {}) => {
  const consumerId = parseId(id);
  const suppliedFields = Object.keys(updates).filter(
    (key) => updates[key] !== undefined
  );

  if (suppliedFields.length === 0) {
    throw createError("At least one profile field must be provided.");
  }

  // Read first: the set of fields a consumer may touch depends on whether
  // their first-login onboarding is still pending.
  const { data: current, error: readError } = await supabase
    .from("consumers")
    .select("id, email, onboarding_completed")
    .eq("id", consumerId)
    .maybeSingle();

  if (readError) {
    throw createError(`Failed to read your profile: ${readError.message}`, 500);
  }
  if (!current) {
    throw createError("Consumer account not found.", 404);
  }

  const allowedFields = current.onboarding_completed
    ? CONSUMER_SELF_EDITABLE_FIELDS
    : CONSUMER_ONBOARDING_EDITABLE_FIELDS;

  const rejectedFields = suppliedFields.filter(
    (key) => !allowedFields.includes(key)
  );
  if (rejectedFields.length > 0) {
    // Reject instead of silently ignoring: a client that sends `status` or
    // `password` here is either buggy or probing for privilege escalation.
    throw createError(
      rejectedFields.includes("email")
        ? "Changing your email address needs a verification code. Use Profile -> Account settings -> Change email instead."
        : "Only your contact number, purok and email can be updated from your account.",
      403
    );
  }

  const updateData = {};

  if (updates.email !== undefined) {
    if (
      typeof updates.email !== "string" ||
      !validator.isEmail(updates.email.trim())
    ) {
      throw createError("A valid email address is required.");
    }
    const normalizedEmail =
      validator.normalizeEmail(updates.email.trim()) ??
      updates.email.trim().toLowerCase();
    if (normalizedEmail.toLowerCase() === String(current.email ?? "").toLowerCase()) {
      throw createError(
        "Enter a new email address that is different from your current email."
      );
    }
    await verifyEmailDomain(normalizedEmail);
    updateData.email = normalizedEmail;
  }

  if (updates.contactNumber !== undefined) {
    updateData.contact_number = normalizeContactNumber(updates.contactNumber);
  }

  if (updates.purokNo !== undefined) {
    if (updates.purokNo === null || updates.purokNo === "") {
      updateData.purok_no = null;
    } else {
      const parsedPurok = Number(updates.purokNo);
      if (!Number.isInteger(parsedPurok) || parsedPurok < 1) {
        throw createError("Purok number must be a positive integer.");
      }
      updateData.purok_no = parsedPurok;
    }
  }

  let update = supabase
    .from("consumers")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", consumerId);

  // The email may only be replaced while onboarding is still pending. Making
  // the write conditional keeps that guarantee even when onboarding finishes
  // between the check above and this update.
  if (updateData.email !== undefined) {
    update = update.eq("onboarding_completed", false);
  }

  const { data, error } = await update.select(CONSUMER_FIELDS).maybeSingle();

  if (error) {
    // The unique index on email surfaces a duplicate as a database error;
    // report it as the conflict it is instead of a generic failure.
    if (String(error.message ?? "").toLowerCase().includes("email")) {
      throw createError(duplicateAccountIdentityMessage(error), 409);
    }
    throw createError(`Failed to update your profile: ${error.message}`, 500);
  }
  if (!data) {
    if (updateData.email !== undefined) {
      throw createError(
        "Your account is already set up. Change your email address from your profile instead.",
        403
      );
    }
    throw createError("Consumer account not found.", 404);
  }

  return data;
};

export const completeConsumerOnboarding = async (id, newPassword) => {
  const consumerId = parseId(id);
  const wantsPassword = typeof newPassword === "string" && newPassword.length > 0;

  if (wantsPassword) {
    // Setting the password here does not need the current one: the account
    // still carries the password issued by the office and onboarding has
    // never been completed, so there is nothing to protect yet. The flag is
    // checked first so that once onboarding is done the resident can only
    // change their password through the profile flow, which does verify the
    // current password.
    const { data: current, error: readError } = await supabase
      .from("consumers")
      .select("id, password, onboarding_completed")
      .eq("id", consumerId)
      .maybeSingle();

    if (readError) {
      throw createError(`Failed to complete onboarding: ${readError.message}`, 500);
    }
    if (!current) {
      throw createError("Consumer account not found.", 404);
    }
    if (current.onboarding_completed) {
      throw createError(
        "Your account is already set up. Change your password from your profile instead.",
        403
      );
    }
    if (await bcrypt.compare(newPassword, current.password)) {
      throw createError("Choose a new password that is different from your current password.");
    }
  }

  const updateData = {
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  if (wantsPassword) {
    updateData.password = await hashAccountPassword(newPassword);
    updateData.failed_login_attempts = 0;
    updateData.locked_until = null;
  }

  let update = supabase.from("consumers").update(updateData).eq("id", consumerId);

  // A password may only be set while onboarding is still pending. Making the
  // write itself conditional closes the window between the check above and
  // this update, so two concurrent requests cannot both slip through.
  if (wantsPassword) {
    update = update.eq("onboarding_completed", false);
  }

  const { data, error } = await update.select(CONSUMER_FIELDS).maybeSingle();

  if (error) {
    throw createError(`Failed to complete onboarding: ${error.message}`, 500);
  }
  if (!data) {
    if (wantsPassword) {
      throw createError(
        "Your account is already set up. Change your password from your profile instead.",
        403
      );
    }
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

  return updateConsumer(consumerId, { status: "disconnected" });
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
