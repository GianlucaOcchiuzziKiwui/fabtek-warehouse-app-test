import "server-only";

import { createHash } from "node:crypto";

import {
  claimGeneratedDocumentJobs,
  completeGeneratedDocumentJob,
  failGeneratedDocumentJob,
  loadOfficialPdfSource,
  uploadGeneratedPdf,
  type ClaimedDocumentJob,
  type ClaimDocumentJobsInput,
  type CompleteDocumentJobInput,
  type FailDocumentJobInput,
  type OfficialDocumentKind,
  type OfficialPdfSource,
} from "../../data/documents.ts";
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

export type DocumentWorkerDependencies = {
  claimDocuments: (input: ClaimDocumentJobsInput) => Promise<ClaimedDocumentJob[]>;
  loadSource: (requestId: string) => Promise<OfficialPdfSource>;
  render: (document: PdfDocument) => Promise<Buffer>;
  upload: (path: string, buffer: Buffer) => Promise<void>;
  resolveNotification: (
    source: OfficialPdfSource,
    kind: OfficialDocumentKind,
  ) => NotificationDetails;
  completeDocument: (input: CompleteDocumentJobInput) => Promise<void>;
  failDocument: (input: FailDocumentJobInput) => Promise<void>;
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
  const requestNumber = String(source.requestNumber).padStart(6, "0");
  const project = source.project.replace(/\s+/gu, " ").trim();
  const prefix = kind === "initial_request"
    ? "Richiesta materiale"
    : "Report finale richiesta";
  return {
    recipients,
    subject: `${prefix} #${requestNumber} - ${project}`.slice(0, 240),
  };
}

function storagePath(job: ClaimedDocumentJob) {
  if (!TEMPLATE_VERSION_PATTERN.test(job.templateVersion)) {
    throw Object.assign(new Error("Versione template non valida."), {
      code: "INVALID_TEMPLATE_VERSION",
    });
  }
  const filename = job.documentType === "initial_request"
    ? `initial-request-v${job.templateVersion}.pdf`
    : `final-report-v${job.templateVersion}.pdf`;
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
    now: () => new Date(),
    ...overrides,
  };
}

export async function processDocumentJobs(
  options: DocumentJobOptions = {},
  dependencies: Partial<DocumentWorkerDependencies> = {},
): Promise<JobBatchResult> {
  const resolvedDependencies = buildDependencies(dependencies);
  const claimOptions = resolveOptions(options, dependencies.claimDocuments !== undefined);
  const jobs = await resolvedDependencies.claimDocuments(claimOptions);
  const result: JobBatchResult = {
    claimed: jobs.length,
    completed: 0,
    failed: 0,
  };

  for (const job of jobs) {
    try {
      const source = await resolvedDependencies.loadSource(job.requestId);
      const document = mapOfficialPdfDocument(source, job.documentType);
      const buffer = await resolvedDependencies.render(document);
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw Object.assign(new Error("PDF non valido."), {
          code: "INVALID_PDF_BUFFER",
        });
      }

      const path = storagePath(job);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      await resolvedDependencies.upload(path, buffer);
      const notification = resolvedDependencies.resolveNotification(
        source,
        job.documentType,
      );
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
      const retry = getRetryDecision(job.attempts, resolvedDependencies.now());
      try {
        await resolvedDependencies.failDocument({
          jobId: job.id,
          attempts: job.attempts,
          error: errorCode(error),
          retryAt: retry.retryAt,
          terminal: retry.terminal,
        });
      } catch {
        // The lease may have expired or infrastructure may still be unavailable.
        // The database claim path recovers expired processing jobs safely.
      }
    }
  }

  return result;
}
