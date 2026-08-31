import "server-only";

import { loadAuthorizedOfficialPdfSource } from "@/lib/data/documents";
import { createOnDemandPdf } from "@/lib/domain/documents/on-demand-pdf";
import {
  EmailServiceError,
  getEmailSettings,
  normalizeEmail,
  sendEmail,
} from "@/lib/email/service";

type RequestSubmittedEmailInput = {
  requestId: string;
  requesterEmail: string;
};

export class RequestEmailError extends Error {
  readonly code:
    | "INVALID_EMAIL_CONFIG"
    | "REQUEST_DOCUMENT_NOT_FOUND"
    | "EMAIL_DELIVERY_FAILED";

  constructor(code: RequestEmailError["code"]) {
    super("La notifica email della richiesta non è stata inviata.");
    this.name = "RequestEmailError";
    this.code = code;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function requestSubmittedTemplate(source: {
  requestNumber: number;
  requesterName: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string | null;
}) {
  const subject = `Richiesta materiale #${source.requestNumber} ricevuta`;
  const fields = [
    ["Richiedente", source.requesterName],
    ["Progetto", source.project],
    ["Linea", source.toolLine],
    ["Utilities", source.utilities],
    ...(source.notes ? [["Note", source.notes]] : []),
  ];
  const rows = fields
    .map(([label, value]) => `<tr><th style="padding:6px 12px 6px 0;text-align:left;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`)
    .join("");
  const textFields = fields.map(([label, value]) => `${label}: ${value}`).join("\n");

  return {
    subject,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937"><h1 style="font-size:20px">Richiesta materiale #${source.requestNumber}</h1><p>La richiesta è stata ricevuta correttamente.</p><table style="border-collapse:collapse">${rows}</table><p>Il PDF ufficiale è allegato a questa email.</p></div>`,
    text: `Richiesta materiale #${source.requestNumber}\n\nLa richiesta è stata ricevuta correttamente.\n\n${textFields}\n\nIl PDF ufficiale è allegato a questa email.`,
  };
}

export async function sendRequestSubmittedEmail({
  requestId,
  requesterEmail,
}: RequestSubmittedEmailInput): Promise<void> {
  const normalizedRequesterEmail = normalizeEmail(requesterEmail);
  if (!normalizedRequesterEmail) {
    throw new RequestEmailError("INVALID_EMAIL_CONFIG");
  }

  try {
    const { warehouseEmails } = getEmailSettings();
    const source = await loadAuthorizedOfficialPdfSource(requestId, "initial_request");
    if (!source) throw new RequestEmailError("REQUEST_DOCUMENT_NOT_FOUND");
    const pdf = await createOnDemandPdf(source, "initial_request");
    const template = requestSubmittedTemplate(source);
    await sendEmail({
      to: [normalizedRequesterEmail],
      bcc: warehouseEmails.filter((email) => email !== normalizedRequesterEmail),
      subject: template.subject,
      html: template.html,
      text: template.text,
      attachments: [{ content: pdf.buffer, filename: pdf.filename }],
      idempotencyKey: `request-submitted/${requestId}`,
    });
  } catch (error) {
    if (error instanceof RequestEmailError) throw error;
    if (error instanceof EmailServiceError) {
      throw new RequestEmailError(error.code);
    }
    throw error;
  }
}
