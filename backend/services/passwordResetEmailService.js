import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BrevoClient } from "@getbrevo/brevo";

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
const templateCache = new Map();

async function loadTemplate(filename) {
  if (!templateCache.has(filename)) {
    templateCache.set(filename, await readFile(join(templatesDir, filename), "utf8"));
  }
  return templateCache.get(filename);
}

function renderTemplate(template, data) {
  return template.replace(/{{\s*(?:params\.)?(\w+)\s*}}/g, (_, key) => data[key] ?? "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

let brevoClient;

function getMailConfiguration() {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  const fromName = process.env.BREVO_FROM_NAME?.trim() || "WaterWise";

  if (!apiKey || !fromEmail) {
    const error = new Error("Brevo transactional email is not configured.");
    error.statusCode = 500;
    throw error;
  }

  brevoClient ??= new BrevoClient({ apiKey });
  return { client: brevoClient, sender: { email: fromEmail, name: fromName } };
}

async function sendTransactionalEmail({ to, subject, text, html, templateId, params }) {
  const { client, sender } = getMailConfiguration();

  if (templateId) {
    const payload = {
      sender,
      to: [{ email: to }],
      templateId: Number(templateId),
      params,
    };
    if (subject) payload.subject = subject;
    return client.transactionalEmails.sendTransacEmail(payload);
  }

  return client.transactionalEmails.sendTransacEmail({
    sender,
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html,
  });
}

function getHostedTemplateId(envName) {
  const raw = String(process.env[envName] ?? "").trim();
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function sendPasswordResetOtp({ email, otp, username, purpose = "reset" }) {
  const isPasswordChange = purpose === "change";
  const codeLabel = isPasswordChange ? "password change code" : "reset code";
  const subject = `Your WaterWise ${codeLabel} is ${otp}`;
  // Signed-in password changes may use a dedicated hosted template; otherwise
  // they fall back to the password-reset hosted template. The dashboard subject
  // and preview text are used as-is (no code override) so they stay editable in Brevo.
  const templateId = isPasswordChange
    ? (getHostedTemplateId("BREVO_TEMPLATE_PASSWORD_CHANGE") ?? getHostedTemplateId("BREVO_TEMPLATE_PASSWORD_RESET"))
    : getHostedTemplateId("BREVO_TEMPLATE_PASSWORD_RESET");
  const params = {
    username: String(username || "WaterWise user"),
    otp_code: String(otp),
    year: String(new Date().getFullYear()),
    // Labels for the shared change-flow template (consumerEmailChangeOtp.brevo.html).
    eyebrow: isPasswordChange ? "Password Change" : undefined,
    heading: isPasswordChange ? "Your password change code" : undefined,
    code_label: isPasswordChange ? "password change code" : undefined,
    intro: isPasswordChange
      ? "Use the verification code below to change your WaterWise account password. This code expires in <strong>5 minutes</strong>."
      : undefined,
    security_note: isPasswordChange
      ? "If you did not request a password change, secure your account immediately. Your password will not change unless you enter this code."
      : undefined,
  };

  if (templateId) {
    await sendTransactionalEmail({
      to: email,
      templateId,
      params,
    });
    return;
  }

  const template = await loadTemplate(isPasswordChange ? "consumerEmailChangeOtp.brevo.html" : "passwordResetOtp.brevo.html");
  const html = renderTemplate(template, {
    username: escapeHtml(params.username),
    otp_code: escapeHtml(params.otp_code),
    year: params.year,
    eyebrow: params.eyebrow,
    heading: params.heading,
    code_label: params.code_label,
    intro: params.intro,
    security_note: params.security_note,
  });

  await sendTransactionalEmail({
    to: email,
    subject,
    text: isPasswordChange
      ? `Your WaterWise password change code is ${otp}\n\nHello ${username || "WaterWise user"},\n\nUse this code to change your account password. It expires in 5 minutes. If you did not request this change, secure your account immediately.`
      : `Your WaterWise reset code is ${otp}\n\nHello ${username || "WaterWise user"},\n\nThis code expires in 5 minutes. If you did not request a password reset, you can ignore this email.`,
    html,
  });
}

export async function sendAdminLoginOtp({ email, otp, username }) {
  const templateId = getHostedTemplateId("BREVO_TEMPLATE_ADMIN_LOGIN");
  if (templateId) {
    await sendTransactionalEmail({
      to: email,
      templateId,
      params: {
        username: String(username || "Administrator"),
        otp_code: String(otp),
        year: String(new Date().getFullYear()),
      },
    });
    return;
  }

  const safeUsername = String(username || "Administrator").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

  await sendTransactionalEmail({
    to: email,
    subject: `Your WaterWise admin sign-in code is ${otp}`,
    text: `Your WaterWise admin sign-in code is ${otp}\n\nHello ${username || "Administrator"},\n\nThis code expires in 5 minutes. If you did not try to sign in, change your password immediately.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Your WaterWise admin sign-in code is ${otp} — expires in 5 minutes.&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
        <h1 style="color:#075985">Admin sign-in verification</h1>
        <p>Hello ${safeUsername},</p>
        <p>Enter this verification code to finish signing in to the WaterWise admin portal. It expires in 5 minutes.</p>
        <p style="margin:28px 0;font-size:32px;letter-spacing:8px;font-weight:bold;color:#075985">${otp}</p>
        <p>If you did not try to sign in, change your password immediately.</p>
      </div>
    `,
  });
}

export async function sendStaffActionOtp({ email, otp, username, actionLabel }) {
  const templateId = getHostedTemplateId("BREVO_TEMPLATE_STAFF_ACTION");
  if (templateId) {
    await sendTransactionalEmail({
      to: email,
      templateId,
      params: {
        username: String(username || "Super Administrator"),
        action_label: String(actionLabel || "manage a staff account"),
        otp_code: String(otp),
        year: String(new Date().getFullYear()),
      },
    });
    return;
  }

  const safeUsername = String(username || "Super Administrator").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
  const safeAction = String(actionLabel || "manage a staff account").replace(/[&<>"']/g, "");
  await sendTransactionalEmail({
    to: email,
    subject: `Your WaterWise staff action code is ${otp}`,
    text: `Your WaterWise staff action code is ${otp}\n\nHello ${username || "Super Administrator"},\n\nUse this code to ${actionLabel}. It expires in 5 minutes and can authorize only this staff action.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto"><div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Your WaterWise staff action code is ${otp} — expires in 5 minutes.&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div><h1 style="color:#075985">Confirm staff management action</h1><p>Hello ${safeUsername},</p><p>Enter this code to ${safeAction}. It expires in 5 minutes.</p><p style="margin:28px 0;font-size:32px;letter-spacing:8px;font-weight:bold;color:#075985">${otp}</p><p>If you did not request this action, secure your Super Admin account immediately.</p></div>`,
  });
}

export async function sendConsumerPasswordChangeOtp({ email, otp, username, consumerName }) {
  const templateId = getHostedTemplateId("BREVO_TEMPLATE_CONSUMER_PASSWORD");
  if (templateId) {
    await sendTransactionalEmail({
      to: email,
      templateId,
      // Label params included because template ID 4 is shared with the
      // signed-in password-change flow, which renders its own labels.
      params: {
        username: String(username || "Administrator"),
        consumer_name: String(consumerName || "the resident"),
        otp_code: String(otp),
        year: String(new Date().getFullYear()),
        eyebrow: "Resident Password",
        heading: "Confirm resident password change",
        code_label: "resident password change code",
        intro: `Enter this code to change the password for ${escapeHtml(consumerName || "the resident")}. It expires in <strong>5 minutes</strong>.`,
        security_note: "If you did not request this action, secure your administrator account immediately.",
      },
    });
    return;
  }

  // NOTE: the module-level escapeHtml() is used on purpose. A local
  // `const escapeHtml` used to be declared further down in this function,
  // which shadowed the module-level one and left it in the temporal dead zone
  // for the hosted-template branch above (TDZ: "Cannot access 'escapeHtml'
  // before initialization").
  const safeUsername = escapeHtml(username || "Administrator");
  const safeConsumerName = escapeHtml(consumerName || "the resident");
  await sendTransactionalEmail({
    to: email,
    subject: `Your resident password change code is ${otp}`,
    text: `Your resident password change code is ${otp}\n\nHello ${username || "Administrator"},\n\nUse this code to change ${consumerName || "the resident"}'s password. It expires in 5 minutes and can authorize only this resident password change.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto"><div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Your resident password change code is ${otp} — expires in 5 minutes.&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div><h1 style="color:#075985">Confirm resident password change</h1><p>Hello ${safeUsername},</p><p>Enter this code to change the password for <strong>${safeConsumerName}</strong>. It expires in 5 minutes.</p><p style="margin:28px 0;font-size:32px;letter-spacing:8px;font-weight:bold;color:#075985">${otp}</p><p>If you did not request this action, secure your administrator account immediately.</p></div>`,
  });
}

export async function sendConsumerEmailChangeOtp({ email, otp, username }) {
  const params = {
    username: String(username || "WaterWise resident"),
    otp_code: String(otp),
    year: String(new Date().getFullYear()),
    eyebrow: "Email Change",
    heading: "Verify your email change",
    code_label: "email change code",
    intro: "Enter this code in WaterWise to confirm access to your current email. This code expires in <strong>5 minutes</strong>.",
    security_note: "If you did not request this change, you can safely ignore this email.",
  };
  const templateId = getHostedTemplateId("BREVO_TEMPLATE_EMAIL_CHANGE");
  if (templateId) {
    await sendTransactionalEmail({
      to: email,
      templateId,
      params,
    });
    return;
  }

  const template = await loadTemplate("consumerEmailChangeOtp.brevo.html");
  const html = renderTemplate(template, {
    ...params,
    username: escapeHtml(params.username),
    otp_code: escapeHtml(params.otp_code),
  });

  await sendTransactionalEmail({
    to: email,
    subject: `Your WaterWise email change code is ${otp}`,
    text: `Your WaterWise email change code is ${otp}\n\nHello ${username || "WaterWise resident"},\n\nEnter this code in WaterWise to confirm access to your current email. It expires in 5 minutes. If you did not request this change, you can ignore this email.`,
    html,
  });
}
