import "server-only";

import { Resend } from "resend";

export type EmailAttachment = {
  content: Buffer;
  filename: string;
};

export type EmailMessage = {
  to: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
};

type EmailSettings = {
  apiKey: string;
  from: string;
  warehouseEmails: string[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class EmailServiceError extends Error {
  readonly code: "INVALID_EMAIL_CONFIG" | "EMAIL_DELIVERY_FAILED";

  constructor(code: EmailServiceError["code"]) {
    super("L'email non è stata inviata.");
    this.name = "EmailServiceError";
    this.code = code;
  }
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function getEmailSettings(): EmailSettings {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const configuredWarehouseEmails = (process.env.WAREHOUSE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map(normalizeEmail);
  const warehouseEmails = [...new Set(
    configuredWarehouseEmails.filter((email): email is string => email !== null),
  )];

  if (
    !apiKey
    || !from
    || warehouseEmails.length === 0
    || configuredWarehouseEmails.some((email) => email === null)
  ) {
    throw new EmailServiceError("INVALID_EMAIL_CONFIG");
  }

  return { apiKey, from, warehouseEmails };
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const { apiKey, from } = getEmailSettings();
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: message.to,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  }, message.idempotencyKey ? {
    idempotencyKey: message.idempotencyKey,
  } : undefined);

  if (error) throw new EmailServiceError("EMAIL_DELIVERY_FAILED");
}
