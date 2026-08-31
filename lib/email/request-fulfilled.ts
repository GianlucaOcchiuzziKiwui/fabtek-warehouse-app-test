import "server-only";

import { loadAuthorizedOfficialPdfSource } from "@/lib/data/documents";
import { loadAuthorizedFulfillmentNotification } from "@/lib/data/request-notifications";
import { createOnDemandPdf } from "@/lib/domain/documents/on-demand-pdf";
import type { FulfillmentResult } from "@/lib/domain/fulfillment/fulfill-request-line";
import {
  EmailServiceError,
  getEmailSettings,
  normalizeEmail,
  sendEmail,
} from "@/lib/email/service";

export class FulfillmentEmailError extends Error {
  readonly code:
    | "INVALID_EMAIL_CONFIG"
    | "FULFILLMENT_NOTIFICATION_NOT_FOUND"
    | "REQUEST_DOCUMENT_NOT_FOUND"
    | "EMAIL_DELIVERY_FAILED";

  constructor(code: FulfillmentEmailError["code"]) {
    super("La notifica email dell'evasione non è stata inviata.");
    this.name = "FulfillmentEmailError";
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

function statusLabel(status: FulfillmentResult["requestStatus"]) {
  switch (status) {
    case "evasa": return "Evasa";
    case "evasa_parziale": return "Evasa parzialmente";
    default: return "In preparazione";
  }
}

function fulfillmentTemplate(input: {
  requestNumber: number;
  fabtekCode: string;
  description: string;
  unitOfMeasure: string;
  deliveredQuantity: number;
  remainingQuantity: number;
  requestStatus: FulfillmentResult["requestStatus"];
  notes: string | null;
}) {
  const completed = input.requestStatus === "evasa";
  const subject = completed
    ? `Richiesta materiale #${input.requestNumber} completata`
    : `Richiesta materiale #${input.requestNumber} aggiornata`;
  const fields = [
    ["Articolo", `${input.fabtekCode} — ${input.description}`],
    ["Quantità consegnata", `${input.deliveredQuantity} ${input.unitOfMeasure}`],
    ["Quantità residua", `${input.remainingQuantity} ${input.unitOfMeasure}`],
    ["Stato richiesta", statusLabel(input.requestStatus)],
    ...(input.notes ? [["Note evasione", input.notes]] : []),
  ];
  const rows = fields
    .map(([label, value]) => `<tr><th style="padding:6px 12px 6px 0;text-align:left;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`)
    .join("");
  const textFields = fields.map(([label, value]) => `${label}: ${value}`).join("\n");

  return {
    subject,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937"><h1 style="font-size:20px">${escapeHtml(subject)}</h1><p>È stata registrata una consegna.</p><table style="border-collapse:collapse">${rows}</table><p>Il documento aggiornato è allegato a questa email.</p></div>`,
    text: `${subject}\n\nÈ stata registrata una consegna.\n\n${textFields}\n\nIl documento aggiornato è allegato a questa email.`,
  };
}

export async function sendRequestFulfilledEmail(
  result: FulfillmentResult,
): Promise<void> {
  try {
    const notification = await loadAuthorizedFulfillmentNotification({
      requestId: result.requestId,
      requestLineId: result.requestLineId,
      idempotencyKey: result.idempotencyKey,
    });
    if (!notification) {
      throw new FulfillmentEmailError("FULFILLMENT_NOTIFICATION_NOT_FOUND");
    }
    const requesterEmail = normalizeEmail(notification.requesterEmail);
    if (!requesterEmail) throw new FulfillmentEmailError("INVALID_EMAIL_CONFIG");

    const kind = result.requestStatus === "evasa" ? "final_report" : "initial_request";
    const source = await loadAuthorizedOfficialPdfSource(result.requestId, kind);
    if (!source) throw new FulfillmentEmailError("REQUEST_DOCUMENT_NOT_FOUND");
    const line = source.lines.find((candidate) => candidate.id === result.requestLineId);
    if (!line) throw new FulfillmentEmailError("REQUEST_DOCUMENT_NOT_FOUND");
    const pdf = await createOnDemandPdf(source, kind);
    const template = fulfillmentTemplate({
      requestNumber: source.requestNumber,
      fabtekCode: line.fabtekCode,
      description: line.description,
      unitOfMeasure: line.unitOfMeasure,
      deliveredQuantity: notification.deliveredQuantity,
      remainingQuantity: result.remainingQuantity,
      requestStatus: result.requestStatus,
      notes: notification.notes,
    });
    const { warehouseEmails } = getEmailSettings();
    await sendEmail({
      to: [requesterEmail],
      bcc: warehouseEmails.filter((email) => email !== requesterEmail),
      subject: template.subject,
      html: template.html,
      text: template.text,
      attachments: [{ content: pdf.buffer, filename: pdf.filename }],
      idempotencyKey: `request-fulfilled/${result.idempotencyKey}`,
    });
  } catch (error) {
    if (error instanceof FulfillmentEmailError) throw error;
    if (error instanceof EmailServiceError) {
      throw new FulfillmentEmailError(error.code);
    }
    throw error;
  }
}
