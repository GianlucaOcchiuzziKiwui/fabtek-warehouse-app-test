import "server-only";

export type DocumentEnvironmentErrorCode =
  | "MISSING_DOCUMENT_ENV"
  | "INVALID_DOCUMENT_ENV";

export class DocumentEnvironmentError extends Error {
  readonly code: DocumentEnvironmentErrorCode;

  constructor(code: DocumentEnvironmentErrorCode, variableName: string) {
    super(`Configurazione documenti non valida: ${variableName}.`);
    this.name = "DocumentEnvironmentError";
    this.code = code;
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DocumentEnvironmentError("MISSING_DOCUMENT_ENV", name);
  return value;
}

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/u.test(value.trim())) {
    throw new DocumentEnvironmentError("INVALID_DOCUMENT_ENV", name);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DocumentEnvironmentError("INVALID_DOCUMENT_ENV", name);
  }
  return parsed;
}

function parseRecipients(value: string): string[] {
  const recipients = value
    .split(",")
    .map((recipient) => recipient.trim().toLowerCase())
    .filter(Boolean);
  const uniqueRecipients = [...new Set(recipients)];
  const emailPattern = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/u;

  if (
    uniqueRecipients.length === 0
    || uniqueRecipients.some((recipient) => !emailPattern.test(recipient))
  ) {
    throw new DocumentEnvironmentError(
      "INVALID_DOCUMENT_ENV",
      "REQUEST_EMAIL_RECIPIENTS",
    );
  }
  return uniqueRecipients;
}

export function getWorkerConfig() {
  return {
    jobSecret: required("JOB_RUNNER_SECRET"),
    batchSize: boundedInteger("DOCUMENT_JOB_BATCH_SIZE", 5, 1, 20),
    leaseSeconds: boundedInteger("DOCUMENT_JOB_LEASE_SECONDS", 300, 30, 900),
  };
}

export function getEmailConfig() {
  return {
    apiKey: required("RESEND_API_KEY"),
    from: required("EMAIL_FROM"),
    recipients: parseRecipients(required("REQUEST_EMAIL_RECIPIENTS")),
  };
}
