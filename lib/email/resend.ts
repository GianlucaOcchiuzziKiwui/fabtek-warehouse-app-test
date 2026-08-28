import "server-only";

import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
} from "resend";

export type SendDocumentEmailInput = {
  apiKey: string;
  from: string;
  recipients: string[];
  subject: string;
  attachment: {
    filename: string;
    buffer: Buffer;
  };
  idempotencyKey: string;
};

export class DocumentEmailError extends Error {
  readonly code = "DOCUMENT_EMAIL_SEND_FAILED";

  constructor() {
    super("Non è stato possibile inviare il documento.");
    this.name = "DocumentEmailError";
  }
}

type DocumentEmailClient = {
  emails: {
    send: (
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ) => Promise<CreateEmailResponse>;
  };
};

type DocumentEmailDependencies = {
  createClient: (apiKey: string) => DocumentEmailClient;
};

const EMAIL_TEXT = "In allegato trovi il documento richiesto.";

export async function sendDocumentEmail(
  input: SendDocumentEmailInput,
  dependencies: Partial<DocumentEmailDependencies> = {},
): Promise<{ providerMessageId: string }> {
  try {
    const client = (
      dependencies.createClient ?? ((apiKey) => new Resend(apiKey))
    )(input.apiKey);
    const { data, error } = await client.emails.send({
      from: input.from,
      to: input.recipients,
      subject: input.subject,
      html: `<p>${EMAIL_TEXT}</p>`,
      text: EMAIL_TEXT,
      attachments: [{
        filename: input.attachment.filename,
        content: input.attachment.buffer.toString("base64"),
      }],
    }, {
      idempotencyKey: input.idempotencyKey,
    });

    if (error || typeof data?.id !== "string" || !data.id) {
      throw new DocumentEmailError();
    }

    return { providerMessageId: data.id };
  } catch {
    throw new DocumentEmailError();
  }
}
