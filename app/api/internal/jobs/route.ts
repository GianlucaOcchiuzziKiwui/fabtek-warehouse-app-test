import { timingSafeEqual } from "node:crypto";

import {
  processDocumentJobs,
  processNotificationJobs,
  type DocumentJobOptions,
  type JobBatchResult,
} from "../../../../lib/domain/documents/worker.ts";
import { getWorkerConfig } from "../../../../lib/env/documents.ts";

type WorkerConfig = ReturnType<typeof getWorkerConfig>;

type JobRouteFailureEvent = {
  phase: "configuration" | "documents" | "notifications";
  errorCode: string;
};

type JobsHandlerDependencies = {
  getConfig: () => WorkerConfig;
  processDocuments: (
    options: DocumentJobOptions,
  ) => Promise<JobBatchResult>;
  processNotifications: (
    options: DocumentJobOptions,
  ) => Promise<JobBatchResult>;
  compareSecrets: (expected: Buffer, provided: Buffer) => boolean;
  reportFailure: (event: JobRouteFailureEvent) => void;
};

const RESPONSE_HEADERS = { "Cache-Control": "no-store" } as const;

function errorCode(error: unknown) {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && /^[A-Z][A-Z0-9_:-]*$/u.test(error.code)
  ) {
    return error.code.slice(0, 240);
  }
  return "JOB_PROCESSOR_ERROR";
}

function bearerToken(authorization: string | null) {
  return authorization?.match(/^Bearer ([^\s]+)$/u)?.[1] ?? null;
}

function isAuthorized(
  token: string,
  secret: string,
  compareSecrets: JobsHandlerDependencies["compareSecrets"],
) {
  const expected = Buffer.from(secret, "utf8");
  const provided = Buffer.from(token, "utf8");
  if (expected.length !== provided.length) return false;

  try {
    return compareSecrets(expected, provided);
  } catch {
    return false;
  }
}

function safelyReport(
  reportFailure: JobsHandlerDependencies["reportFailure"],
  event: JobRouteFailureEvent,
) {
  try {
    reportFailure(event);
  } catch {
    // Observability failures must not expose details or stop the other processor.
  }
}

export function createJobsHandler(
  overrides: Partial<JobsHandlerDependencies> = {},
) {
  const dependencies: JobsHandlerDependencies = {
    getConfig: getWorkerConfig,
    processDocuments: processDocumentJobs,
    processNotifications: processNotificationJobs,
    compareSecrets: timingSafeEqual,
    reportFailure: (event) => {
      console.error("Internal job scheduler failed", event);
    },
    ...overrides,
  };

  return async function jobsHandler(request: Request) {
    const token = bearerToken(request.headers.get("Authorization"));
    if (!token) {
      return Response.json(
        { error: "UNAUTHORIZED" },
        { status: 401, headers: RESPONSE_HEADERS },
      );
    }

    let config: WorkerConfig;
    try {
      config = dependencies.getConfig();
    } catch (error) {
      safelyReport(dependencies.reportFailure, {
        phase: "configuration",
        errorCode: errorCode(error),
      });
      return Response.json(
        { error: "JOB_PROCESSING_FAILED" },
        { status: 500, headers: RESPONSE_HEADERS },
      );
    }

    if (!isAuthorized(
      token,
      config.jobSecret,
      dependencies.compareSecrets,
    )) {
      return Response.json(
        { error: "UNAUTHORIZED" },
        { status: 401, headers: RESPONSE_HEADERS },
      );
    }

    const options = {
      batchSize: config.batchSize,
      leaseSeconds: config.leaseSeconds,
    };
    let documents: JobBatchResult | undefined;
    let notifications: JobBatchResult | undefined;
    let processingFailed = false;

    try {
      documents = await dependencies.processDocuments(options);
    } catch (error) {
      processingFailed = true;
      safelyReport(dependencies.reportFailure, {
        phase: "documents",
        errorCode: errorCode(error),
      });
    }

    try {
      notifications = await dependencies.processNotifications(options);
    } catch (error) {
      processingFailed = true;
      safelyReport(dependencies.reportFailure, {
        phase: "notifications",
        errorCode: errorCode(error),
      });
    }

    if (processingFailed || !documents || !notifications) {
      return Response.json(
        { error: "JOB_PROCESSING_FAILED" },
        { status: 500, headers: RESPONSE_HEADERS },
      );
    }

    return Response.json(
      { documents, notifications },
      { headers: RESPONSE_HEADERS },
    );
  };
}

export const POST = createJobsHandler();
