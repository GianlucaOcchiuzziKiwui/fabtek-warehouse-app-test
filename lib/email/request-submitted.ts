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

type RequestSubmittedTemplateSource = {
  requestNumber: number;
  requesterName: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string | null;
};

type EmailField = {
  label: string;
  value: string;
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

function escapeHtml(value: string): string {
  const characters: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return value.replace(/[&<>"']/gu, (character) => {
    return characters[character] ?? character;
  });
}

function requestSubmittedTemplate(
  source: RequestSubmittedTemplateSource,
) {
  const requestNumber = escapeHtml(String(source.requestNumber));
  const subject = `Richiesta materiale #${source.requestNumber} ricevuta`;

  const fields: EmailField[] = [
    {
      label: "Richiedente",
      value: source.requesterName,
    },
    {
      label: "Progetto",
      value: source.project,
    },
    {
      label: "Linea",
      value: source.toolLine,
    },
    {
      label: "Utilities",
      value: source.utilities,
    },
  ];

  if (source.notes) {
    fields.push({
      label: "Note",
      value: source.notes,
    });
  }

  const rows = fields
    .map(({ label, value }, index) => {
      const isLastRow = index === fields.length - 1;
      const borderStyle = isLastRow
        ? "border-bottom:none;"
        : "border-bottom:1px solid #dce4ec;";

      return `
        <tr>
          <td
            width="34%"
            style="
              width:34%;
              padding:14px 16px;
              ${borderStyle}
              background-color:#f5f8fb;
              color:#526274;
              font-family:Arial,Helvetica,sans-serif;
              font-size:13px;
              line-height:1.5;
              font-weight:700;
              vertical-align:top;
            "
          >
            ${escapeHtml(label)}
          </td>

          <td
            style="
              padding:14px 16px;
              ${borderStyle}
              background-color:#ffffff;
              color:#16212e;
              font-family:Arial,Helvetica,sans-serif;
              font-size:14px;
              line-height:1.6;
              vertical-align:top;
              white-space:pre-wrap;
              word-break:break-word;
            "
          >
            ${escapeHtml(value)}
          </td>
        </tr>
      `;
    })
    .join("");

  const textFields = fields
    .map(({ label, value }) => `${label}: ${value}`)
    .join("\n");

  const html = `
    <!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
        <title>${escapeHtml(subject)}</title>
      </head>

      <body
        style="
          margin:0;
          padding:0;
          background-color:#f5f8fb;
          color:#16212e;
        "
      >
        <!-- Testo di anteprima mostrato nella casella di posta -->
        <div
          style="
            display:none;
            max-height:0;
            max-width:0;
            overflow:hidden;
            opacity:0;
            color:transparent;
            font-size:1px;
            line-height:1px;
          "
        >
          La richiesta materiale #${requestNumber} è stata ricevuta correttamente.
        </div>

        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            margin:0;
            padding:0;
            background-color:#f5f8fb;
            border-collapse:collapse;
          "
        >
          <tr>
            <td
              align="center"
              style="padding:32px 16px;"
            >
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  width:100%;
                  max-width:620px;
                  background-color:#ffffff;
                  border:1px solid #dce4ec;
                  border-radius:16px;
                  border-collapse:separate;
                  border-spacing:0;
                  overflow:hidden;
                  box-shadow:0 8px 24px rgba(11,37,69,0.10);
                "
              >
                <!-- Header -->
                <tr>
                  <td
                    style="
                      padding:32px;
                      background-color:#0b2545;
                      color:#ffffff;
                    "
                  >
                    <div
                      style="
                        display:inline-block;
                        margin:0 0 16px;
                        padding:6px 11px;
                        border-radius:999px;
                        background-color:#e4f3ea;
                        color:#2e7d4f;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:12px;
                        line-height:1.2;
                        font-weight:700;
                        letter-spacing:0.04em;
                        text-transform:uppercase;
                      "
                    >
                      Richiesta ricevuta
                    </div>

                    <h1
                      style="
                        margin:0;
                        color:#ffffff;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:26px;
                        line-height:1.25;
                        font-weight:700;
                      "
                    >
                      Richiesta materiale
                      <span style="color:#d9e8f7;">
                        #${requestNumber}
                      </span>
                    </h1>

                    <p
                      style="
                        margin:12px 0 0;
                        color:#d9e8f7;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:15px;
                        line-height:1.6;
                      "
                    >
                      La richiesta è stata acquisita correttamente.
                      Di seguito trovi il riepilogo dei dati inviati.
                    </p>
                  </td>
                </tr>

                <!-- Corpo -->
                <tr>
                  <td style="padding:32px;">
                    <h2
                      style="
                        margin:0 0 16px;
                        color:#0b2545;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:16px;
                        line-height:1.4;
                        font-weight:700;
                      "
                    >
                      Riepilogo della richiesta
                    </h2>

                    <table
                      role="presentation"
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        width:100%;
                        border:1px solid #dce4ec;
                        border-radius:10px;
                        border-collapse:separate;
                        border-spacing:0;
                        overflow:hidden;
                      "
                    >
                      ${rows}
                    </table>

                    <!-- Allegato -->
                    <table
                      role="presentation"
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        width:100%;
                        margin-top:24px;
                        background-color:#fbeedd;
                        border-left:4px solid #b8752b;
                        border-radius:8px;
                        border-collapse:separate;
                        border-spacing:0;
                      "
                    >
                      <tr>
                        <td
                          style="
                            padding:16px;
                            color:#0b2545;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;
                            line-height:1.6;
                          "
                        >
                          <strong style="color:#a56321;">
                            Documento allegato
                          </strong>
                          <br>
                          Il PDF ufficiale della richiesta è disponibile
                          in allegato a questa email.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td
                    style="
                      padding:20px 32px;
                      background-color:#eaf0f6;
                      border-top:1px solid #dce4ec;
                      color:#526274;
                      font-family:Arial,Helvetica,sans-serif;
                      font-size:12px;
                      line-height:1.6;
                      text-align:center;
                    "
                  >
                    Email generata automaticamente.
                    <br>
                    Conserva il PDF allegato come riferimento della richiesta.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    `RICHIESTA MATERIALE #${source.requestNumber}`,
    "",
    "La richiesta è stata acquisita correttamente.",
    "",
    "RIEPILOGO DELLA RICHIESTA",
    textFields,
    "",
    "DOCUMENTO ALLEGATO",
    "Il PDF ufficiale della richiesta è allegato a questa email.",
    "",
    "Email generata automaticamente.",
    "Conserva il PDF allegato come riferimento della richiesta.",
  ].join("\n");

  return {
    subject,
    html,
    text,
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

    const source = await loadAuthorizedOfficialPdfSource(
      requestId,
      "initial_request",
    );

    if (!source) {
      throw new RequestEmailError("REQUEST_DOCUMENT_NOT_FOUND");
    }

    const pdf = await createOnDemandPdf(
      source,
      "initial_request",
    );

    const template = requestSubmittedTemplate(source);

    await sendEmail({
      to: [normalizedRequesterEmail],
      bcc: warehouseEmails.filter(
        (email) => email !== normalizedRequesterEmail,
      ),
      subject: template.subject,
      html: template.html,
      text: template.text,
      attachments: [
        {
          content: pdf.buffer,
          filename: pdf.filename,
        },
      ],
      idempotencyKey: `request-submitted/${requestId}`,
    });
  } catch (error) {
    if (error instanceof RequestEmailError) {
      throw error;
    }

    if (error instanceof EmailServiceError) {
      throw new RequestEmailError(error.code);
    }

    throw error;
  }
}