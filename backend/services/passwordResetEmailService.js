import "dotenv/config";
import { BrevoClient } from "@getbrevo/brevo";

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

async function sendTransactionalEmail({ to, subject, text, html }) {
  const { client, sender } = getMailConfiguration();

  return client.transactionalEmails.sendTransacEmail({
    sender,
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html,
  });
}

export async function sendPasswordResetOtp({ email, otp, username }) {
  const safeUsername = String(username || "WaterWise user").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

  await sendTransactionalEmail({
    to: email,
    subject: "Your WaterWise password reset code",
    text: `Hello ${username || "WaterWise user"},\n\nYour WaterWise password reset code is: ${otp}\n\nThis code expires in 5 minutes. If you did not request a password reset, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto">
        <h1 style="color:#075985">Your password reset code</h1>
        <p>Hello ${safeUsername},</p>
        <p>Enter this verification code in WaterWise. It expires in 5 minutes.</p>
        <p style="margin:28px 0;font-size:32px;letter-spacing:8px;font-weight:bold;color:#075985">${otp}</p>
        <p>If you did not request this change, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendAdminLoginOtp({ email, otp, username }) {
  const safeUsername = String(username || "Administrator").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

  await sendTransactionalEmail({
    to: email,
    subject: "Your WaterWise admin sign-in code",
    text: `Hello ${username || "Administrator"},\n\nYour WaterWise admin sign-in code is: ${otp}\n\nThis code expires in 5 minutes. If you did not try to sign in, change your password immediately.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto">
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
  const safeUsername = String(username || "Super Administrator").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
  const safeAction = String(actionLabel || "manage a staff account").replace(/[&<>"']/g, "");
  await sendTransactionalEmail({
    to: email,
    subject: "Confirm your WaterWise staff management action",
    text: `Hello ${username || "Super Administrator"},\n\nYour verification code to ${actionLabel} is: ${otp}\n\nThis code expires in 5 minutes and can authorize only this staff action.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto"><h1 style="color:#075985">Confirm staff management action</h1><p>Hello ${safeUsername},</p><p>Enter this code to ${safeAction}. It expires in 5 minutes.</p><p style="margin:28px 0;font-size:32px;letter-spacing:8px;font-weight:bold;color:#075985">${otp}</p><p>If you did not request this action, secure your Super Admin account immediately.</p></div>`,
  });
}

export async function sendConsumerPasswordChangeOtp({ email, otp, username, consumerName }) {
  const escapeHtml = (value) => String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
  const safeUsername = escapeHtml(username || "Administrator");
  const safeConsumerName = escapeHtml(consumerName || "the resident");
  await sendTransactionalEmail({
    to: email,
    subject: "Confirm resident password change",
    text: `Hello ${username || "Administrator"},\n\nYour verification code to change ${consumerName || "the resident"}'s password is: ${otp}\n\nThis code expires in 5 minutes and can authorize only this resident password change.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto"><h1 style="color:#075985">Confirm resident password change</h1><p>Hello ${safeUsername},</p><p>Enter this code to change the password for <strong>${safeConsumerName}</strong>. It expires in 5 minutes.</p><p style="margin:28px 0;font-size:32px;letter-spacing:8px;font-weight:bold;color:#075985">${otp}</p><p>If you did not request this action, secure your administrator account immediately.</p></div>`,
  });
}

export async function sendConsumerEmailChangeOtp({ email, otp, username }) {
  const safeUsername = String(username || "WaterWise resident").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
  await sendTransactionalEmail({
    to: email,
    subject: "Verify your WaterWise email change",
    text: `Hello ${username || "WaterWise resident"},\n\nYour email change verification code is: ${otp}\n\nThis code expires in 5 minutes. If you did not request this change, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto">
        <h1 style="color:#075985">Verify your email change</h1>
        <p>Hello ${safeUsername},</p>
        <p>Enter this code in WaterWise to confirm access to your current email. It expires in 5 minutes.</p>
        <p style="margin:28px 0;font-size:32px;letter-spacing:8px;font-weight:bold;color:#075985">${otp}</p>
        <p>If you did not request this change, you can safely ignore this email.</p>
      </div>
    `,
  });
}
