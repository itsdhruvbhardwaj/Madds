import { Resend } from "resend";

import { env } from "../config/env.js";

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

async function sendEmail(message: EmailMessage, purpose: string): Promise<boolean> {
  if (!env.resendApiKey || !env.emailFrom) {
    console.warn(`Resend email ${purpose} is not configured; email was not sent.`);
    return false;
  }

  try {
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: env.emailFrom,
      ...message,
    });

    if (error || !data?.id) {
      console.error(`Failed to send ${purpose} email via Resend.`);
      return false;
    }

    return true;
  } catch {
    console.error(`Failed to send ${purpose} email via Resend.`);
    return false;
  }
}

function buildAuthUrl(path: "verify-email" | "reset-password" | "google/password/verify", rawToken: string): string {
  const baseUrl = env.appBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}/api/auth/${path}?token=${encodeURIComponent(rawToken)}`;
}

export async function sendPasswordSetupVerificationEmail(input: {
  email: string;
  name: string;
  rawToken: string;
}): Promise<boolean> {
  const { email, name, rawToken } = input;
  const verificationUrl = buildAuthUrl("google/password/verify", rawToken);

  return sendEmail(
    {
      to: email,
      subject: "Verify your PicMee password setup",
      html: `
        <p>Hello ${name},</p>
        <p>Confirm this password setup request for your PicMee account by opening the link below:</p>
        <p><a href="${verificationUrl}">Verify password setup</a></p>
        <p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
      `,
      text: `Hello ${name},\n\nVerify your PicMee password setup using this link:\n${verificationUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
    },
    "password setup verification",
  );
}

export async function sendVerificationEmail(input: {
  email: string;
  name: string;
  rawToken: string;
}): Promise<boolean> {
  const { email, name, rawToken } = input;
  const verificationUrl = buildAuthUrl("verify-email", rawToken);

  return sendEmail(
    {
      to: email,
      subject: "Verify your email address",
      html: `
        <p>Hello ${name},</p>
        <p>Thanks for joining. Please verify your email address by clicking below:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>If you did not create this account, you can ignore this email.</p>
      `,
      text: `Hello ${name},\n\nPlease verify your email address using this link:\n${verificationUrl}\n\nIf you did not create this account, you can ignore this email.`,
    },
    "verification",
  );
}

export async function sendPasswordResetEmail(input: {
  email: string;
  rawToken: string;
}): Promise<boolean> {
  const { email, rawToken } = input;
  const resetUrl = buildAuthUrl("reset-password", rawToken);

  return sendEmail(
    {
      to: email,
      subject: "Reset your password",
      html: `
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you did not request this, you can ignore this email.</p>
        <p>This link expires in 30 minutes.</p>
      `,
      text: `We received a request to reset your password.\n\nReset your password using this link:\n${resetUrl}\n\nIf you did not request this, you can ignore this email. This link expires in 30 minutes.`,
    },
    "password reset",
  );
}
