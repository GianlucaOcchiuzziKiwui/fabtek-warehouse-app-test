import "server-only";

import { createHash } from "node:crypto";

import {
  claimNotificationJobs,
  claimGeneratedDocumentJobs,
  completeNotificationJob,
  completeGeneratedDocumentJob,
  downloadGeneratedPdf,
  failNotificationJob,
  failGeneratedDocumentJob,
  loadCompletedGeneratedDocument,
  loadOfficialPdfSource,
  uploadGeneratedPdf,
  type ClaimedNotificationJob,
  type ClaimedDocumentJob,
  type ClaimDocumentJobsInput,
  type CompleteNotificationJobInput,
  type CompleteDocumentJobInput,
  type CompletedGeneratedDocument,
  type FailNotificationJobInput,
  type FailDocumentJobInput,
  type OfficialDocumentKind,
  type OfficialPdfSource,
} from "../../data/documents.ts";
import {
  sendDocumentEmail,
  type SendDocumentEmailInput,
} from "../../email/resend.ts";
import { getEmailConfig, getWorkerConfig } from "../../env/documents.ts";
import { mapOfficialPdfDocument } from "../../pdf/mappers.ts";
import type { PdfDocument } from "../../pdf/contracts.ts";
import { getRetryDecision } from "./job-state.ts";

export type DocumentJobOptions = {
  batchSize?: number;
  leaseSeconds?: number;
};

export type JobBatchResult = {
  claimed: number;
  completed: number;
  failed: number;
};

export type NotificationDetails = {
  recipients: string[];
  subject: string;
};

export type DocumentWorkerFailureEvent = {
  jobId: string;
  phase:
    | "load_source"
    | "map_document"
    | "render"
    | "prepare_upload"
    | "upload"
    | "resolve_notification"
    | "complete_document"
    | "load_document"
    | "download"
    | "send_email"
    | "complete_notification"
    | "fail_document"
    | "fail_notification";
  attempt: number;
  errorCode: string;
  durationMs: number;
};

export type DocumentWorkerDependencies = {
  claimDocuments: (input: ClaimDocumentJobsInput) => Promise<ClaimedDocumentJob[]>;
  loadSource: (
    requestId: string,
    kind: OfficialDocumentKind,
  ) => Promise<OfficialPdfSource>;
  render: (document: PdfDocument) => Promise<Buffer>;
  upload: (path: string, buffer: Buffer) => Promise<void>;
  resolveNotification: (
    source: OfficialPdfSource,
    kind: OfficialDocumentKind,
  ) => NotificationDetails;
  completeDocument: (input: CompleteDocumentJobInput) => Promise<void>;
  failDocument: (input: FailDocumentJobInput) => Promise<void>;
  reportFailure: (event: DocumentWorkerFailureEvent) => void;
  now: () => Date;
};

type NotificationEmailInput = Omit<SendDocumentEmailInput, "apiKey" | "from">;

export type NotificationWorkerDependencies = {
  claimNotifications: (
    input: ClaimDocumentJobsInput,
  ) => Promise<ClaimedNotificationJob[]>;
  loadCompletedDocument: (
    documentId: string,
  ) => Promise<CompletedGeneratedDocument>;
  download: (path: string) => Promise<Buffer>;
  sendEmail: (
    input: NotificationEmailInput,
  ) => Promise<{ providerMessageId: string }>;
  completeNotification: (input: CompleteNotificationJobInput) => Promise<void>;
  failNotification: (input: FailNotificationJobInput) => Promise<void>;
  reportFailure: (event: DocumentWorkerFailureEvent) => void;
  now: () => Date;
};

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_LEASE_SECONDS = 300;
const MAX_ERROR_CODE_LENGTH = 240;
const TEMPLATE_VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/iu;

async function renderOfficialDocument(document: PdfDocument) {
  const { renderPdfDocument } = await import("../../pdf/server.ts");
  return renderPdfDocument(document);
}

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
) {
  const normalized = value ?? fallback;
  if (
    !Number.isSafeInteger(normalized)
    || normalized < minimum
    || normalized > maximum
  ) {
    throw new RangeError(`${name} non valido.`);
  }
  return normalized;
}

function resolveOptions(
  options: DocumentJobOptions,
  hasInjectedClaim: boolean,
): ClaimDocumentJobsInput {
  const configured = hasInjectedClaim
    ? null
    : getWorkerConfig();
  return {
    batchSize: normalizeInteger(
      options.batchSize,
      configured?.batchSize ?? DEFAULT_BATCH_SIZE,
      1,
      20,
      "batchSize",
    ),
    leaseSeconds: normalizeInteger(
      options.leaseSeconds,
      configured?.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
      30,
      900,
      "leaseSeconds",
    ),
  };
}

function defaultNotification(
  source: OfficialPdfSource,
  kind: OfficialDocumentKind,
): NotificationDetails {
  const { recipients } = getEmailConfig();
  const normalizeSubjectValue = (value: string) => value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const toolLine = normalizeSubjectValue(source.toolLine);
  const utilities = normalizeSubjectValue(source.utilities);
  const requesterName = normalizeSubjectValue(source.requesterName);
  if (!toolLine || !utilities || !requesterName) {
    throw Object.assign(new Error("Oggetto notifica non valido."), {
      code: "INVALID_NOTIFICATION_SUBJECT",
    });
  }
  const suffix = kind === "final_report" ? "_EVASA" : "";
  return {
    recipients,
    subject: `CMKT_RDM_${toolLine}_${utilities}_${requesterName}_${source.requestNumber}${suffix}`,
  };
}

function storagePath(job: ClaimedDocumentJob, sha256: string) {
  if (!TEMPLATE_VERSION_PATTERN.test(job.templateVersion)) {
    throw Object.assign(new Error("Versione template non valida."), {
      code: "INVALID_TEMPLATE_VERSION",
    });
  }
  const filename = job.documentType === "initial_request"
    ? `initial-request-v${job.templateVersion}-${sha256}.pdf`
    : `final-report-v${job.templateVersion}-${sha256}.pdf`;
  return `requests/${job.requestId}/${filename}`;
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && /^[A-Z][A-Z0-9_:-]*$/u.test(error.code)
  ) {
    return error.code.slice(0, MAX_ERROR_CODE_LENGTH);
  }
  return "DOCUMENT_JOB_ERROR";
}

function buildDependencies(
  overrides: Partial<DocumentWorkerDependencies>,
): DocumentWorkerDependencies {
  return {
    claimDocuments: claimGeneratedDocumentJobs,
    loadSource: loadOfficialPdfSource,
    render: renderOfficialDocument,
    upload: uploadGeneratedPdf,
    resolveNotification: defaultNotification,
    completeDocument: completeGeneratedDocumentJob,
    failDocument: failGeneratedDocumentJob,
    reportFailure: (event) => {
      console.error("Document worker failure", event);
    },
    now: () => new Date(),
    ...overrides,
  };
}

async function defaultSendNotificationEmail(input: NotificationEmailInput) {
  const { apiKey, from } = getEmailConfig();
  return sendDocumentEmail({ ...input, apiKey, from });
}

function buildNotificationDependencies(
  overrides: Partial<NotificationWorkerDependencies>,
): NotificationWorkerDependencies {
  return {
    claimNotifications: claimNotificationJobs,
    loadCompletedDocument: loadCompletedGeneratedDocument,
    download: downloadGeneratedPdf,
    sendEmail: defaultSendNotificationEmail,
    completeNotification: completeNotificationJob,
    failNotification: failNotificationJob,
    reportFailure: (event) => {
      console.error("Notification worker failure", event);
    },
    now: () => new Date(),
    ...overrides,
  };
}

function notificationFilename(
  kind: OfficialDocumentKind,
  requestNumber: number,
) {
  const number = String(requestNumber).padStart(6, "0");
  return kind === "initial_request"
    ? `fabtek-richiesta-${number}.pdf`
    : `fabtek-report-finale-${number}.pdf`;
}

function assertMatchingNotificationDocument(
  job: ClaimedNotificationJob,
  document: CompletedGeneratedDocument,
) {
  if (
    document.id !== job.documentId
    || document.requestId !== job.requestId
    || document.documentType !== job.documentType
  ) {
    throw Object.assign(new Error("Documento notifica non valido."), {
      code: "INVALID_NOTIFICATION_DOCUMENT",
    });
  }
}

function durationMs(startedAt: Date, failedAt: Date) {
  return Math.max(0, failedAt.getTime() - startedAt.getTime());
}

function reportFailureSafely(
  reporter: (event: DocumentWorkerFailureEvent) => void,
  event: DocumentWorkerFailureEvent,
) {
  try {
    reporter(event);
  } catch {
    // Observability must not prevent later jobs from being claimed.
  }
}

export async function processDocumentJobs(
  options: DocumentJobOptions = {},
  dependencies: Partial<DocumentWorkerDependencies> = {},
): Promise<JobBatchResult> {
  const resolvedDependencies = buildDependencies(dependencies);
  const claimOptions = resolveOptions(options, dependencies.claimDocuments !== undefined);
  const result: JobBatchResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
  };

  while (result.claimed < claimOptions.batchSize) {
    const [job] = await resolvedDependencies.claimDocuments({
      batchSize: 1,
      leaseSeconds: claimOptions.leaseSeconds,
    });
    if (!job) break;
    result.claimed += 1;
    const startedAt = resolvedDependencies.now();
    let phase: DocumentWorkerFailureEvent["phase"] = "load_source";

    try {
      const source = await resolvedDependencies.loadSource(
        job.requestId,
        job.documentType,
      );
      phase = "map_document";
      const document = mapOfficialPdfDocument(source, job.documentType);
      phase = "render";
      const buffer = await resolvedDependencies.render(document);
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw Object.assign(new Error("PDF non valido."), {
          code: "INVALID_PDF_BUFFER",
        });
      }

      phase = "prepare_upload";
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const path = storagePath(job, sha256);
      phase = "upload";
      await resolvedDependencies.upload(path, buffer);
      phase = "resolve_notification";
      const notification = resolvedDependencies.resolveNotification(
        source,
        job.documentType,
      );
      phase = "complete_document";
      await resolvedDependencies.completeDocument({
        jobId: job.id,
        attempts: job.attempts,
        storagePath: path,
        sha256,
        templateVersion: job.templateVersion,
        recipients: notification.recipients,
        subject: notification.subject,
      });
      result.completed += 1;
    } catch (error) {
      result.failed += 1;
      const failedAt = resolvedDependencies.now();
      const retry = getRetryDecision(job.attempts, failedAt);
      try {
        await resolvedDependencies.failDocument({
          jobId: job.id,
          attempts: job.attempts,
          error: errorCode(error),
          retryAt: retry.retryAt,
          terminal: retry.terminal,
        });
      } catch (failureError) {
        const persistenceFailedAt = resolvedDependencies.now();
        reportFailureSafely(resolvedDependencies.reportFailure, {
          jobId: job.id,
          phase: "fail_document",
          attempt: job.attempts,
          errorCode: errorCode(failureError),
          durationMs: durationMs(startedAt, persistenceFailedAt),
        });
        continue;
      }
      reportFailureSafely(resolvedDependencies.reportFailure, {
        jobId: job.id,
        phase,
        attempt: job.attempts,
        errorCode: errorCode(error),
        durationMs: durationMs(startedAt, failedAt),
      });
    }
  }

  return result;
}

export async function processNotificationJobs(
  options: DocumentJobOptions = {},
  dependencies: Partial<NotificationWorkerDependencies> = {},
): Promise<JobBatchResult> {
  const resolvedDependencies = buildNotificationDependencies(dependencies);
  const claimOptions = resolveOptions(
    options,
    dependencies.claimNotifications !== undefined,
  );
  const result: JobBatchResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
  };

  while (result.claimed < claimOptions.batchSize) {
    const [job] = await resolvedDependencies.claimNotifications({
      batchSize: 1,
      leaseSeconds: claimOptions.leaseSeconds,
    });
    if (!job) break;
    result.claimed += 1;
    const startedAt = resolvedDependencies.now();
    let phase: DocumentWorkerFailureEvent["phase"] = "load_document";

    try {
      const document = await resolvedDependencies.loadCompletedDocument(
        job.documentId,
      );
      assertMatchingNotificationDocument(job, document);
      phase = "download";
      const buffer = await resolvedDependencies.download(document.storagePath);
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw Object.assign(new Error("PDF notifica non valido."), {
          code: "INVALID_GENERATED_PDF",
        });
      }
      phase = "send_email";
      const { providerMessageId } = await resolvedDependencies.sendEmail({
        recipients: job.recipients,
        subject: job.subject,
        attachment: {
          filename: notificationFilename(
            document.documentType,
            document.requestNumber,
          ),
          buffer,
        },
        idempotencyKey: `document-notification/${job.id}`,
      });
      phase = "complete_notification";
      await resolvedDependencies.completeNotification({
        jobId: job.id,
        attempts: job.attempts,
        providerMessageId,
      });
      result.completed += 1;
    } catch (error) {
      result.failed += 1;
      const failedAt = resolvedDependencies.now();
      const retry = getRetryDecision(job.attempts, failedAt);
      try {
        await resolvedDependencies.failNotification({
          jobId: job.id,
          attempts: job.attempts,
          error: errorCode(error),
          retryAt: retry.retryAt,
          terminal: retry.terminal,
        });
      } catch (failureError) {
        const persistenceFailedAt = resolvedDependencies.now();
        reportFailureSafely(resolvedDependencies.reportFailure, {
          jobId: job.id,
          phase: "fail_notification",
          attempt: job.attempts,
          errorCode: errorCode(failureError),
          durationMs: durationMs(startedAt, persistenceFailedAt),
        });
        continue;
      }
      reportFailureSafely(resolvedDependencies.reportFailure, {
        jobId: job.id,
        phase,
        attempt: job.attempts,
        errorCode: errorCode(error),
        durationMs: durationMs(startedAt, failedAt),
      });
    }
  }

  return result;
}
