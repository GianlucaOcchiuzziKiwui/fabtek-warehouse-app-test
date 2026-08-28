import "server-only";

import { collectPaginatedRows } from "./paginated-query.ts";
import { createAdminClient } from "../supabase/admin.ts";

export type OfficialDocumentKind = "initial_request" | "final_report";

export type ClaimedDocumentJob = {
  id: string;
  requestId: string;
  documentType: OfficialDocumentKind;
  templateVersion: string;
  attempts: number;
  leaseExpiresAt: string;
};

export type OfficialPdfFulfillmentSource = {
  id: string;
  quantity: number;
  fulfilledAt: string;
  notes: string | null;
};

export type OfficialPdfLineSource = {
  id: string;
  fabtekCode: string;
  oracleSapioCode: string | null;
  categoryName: string;
  familyName: string;
  componentName: string;
  description: string;
  diameter: string | null;
  material: string;
  connection: string;
  unitOfMeasure: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  fulfillments: OfficialPdfFulfillmentSource[];
};

export type OfficialPdfSource = {
  id: string;
  requestNumber: number;
  requestedAt: string;
  requesterName: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string | null;
  status: "in_preparazione" | "evasa_parziale" | "evasa";
  lines: OfficialPdfLineSource[];
};

export type ClaimDocumentJobsInput = {
  batchSize: number;
  leaseSeconds: number;
};

export type CompleteDocumentJobInput = {
  jobId: string;
  attempts: number;
  storagePath: string;
  sha256: string;
  templateVersion: string;
  recipients: string[];
  subject: string;
};

export type FailDocumentJobInput = {
  jobId: string;
  attempts: number;
  error: string;
  retryAt: string | null;
  terminal: boolean;
};

export type DocumentDataErrorCode =
  | "CLAIM_DOCUMENTS_FAILED"
  | "INVALID_DOCUMENT_JOB_RESPONSE"
  | "LOAD_OFFICIAL_SOURCE_FAILED"
  | "DOCUMENT_SOURCE_NOT_FOUND"
  | "INVALID_OFFICIAL_SOURCE_RESPONSE"
  | "UPLOAD_GENERATED_PDF_FAILED"
  | "COMPLETE_DOCUMENT_JOB_FAILED"
  | "FAIL_DOCUMENT_JOB_FAILED"
  | "DOCUMENT_JOB_LEASE_LOST";

export class DocumentDataError extends Error {
  readonly code: DocumentDataErrorCode;

  constructor(code: DocumentDataErrorCode) {
    super("I documenti non sono disponibili in questo momento.");
    this.name = "DocumentDataError";
    this.code = code;
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;
type DocumentDataDependencies = {
  createClient: () => AdminClient;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DOCUMENT_KINDS = new Set<OfficialDocumentKind>([
  "initial_request",
  "final_report",
]);
const REQUEST_STATUSES = new Set<OfficialPdfSource["status"]>([
  "in_preparazione",
  "evasa_parziale",
  "evasa",
]);
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

const REQUEST_SELECT = `
  id,
  request_number,
  requested_at,
  project,
  tool_line,
  utilities,
  notes,
  status,
  requester:profiles!material_requests_requester_id_fkey(full_name)
`;

const REQUEST_LINE_SELECT = `
  id,
  snapshot_fabtek_code,
  snapshot_oracle_sapio_code,
  snapshot_category_name,
  snapshot_family_name,
  snapshot_component_name,
  snapshot_description,
  snapshot_diameter,
  snapshot_material,
  snapshot_connection,
  snapshot_unit_of_measure,
  requested_quantity,
  fulfilled_quantity,
  created_at
`;

const FULFILLMENT_SELECT = `
  id,
  request_line_id,
  quantity,
  fulfilled_at,
  notes,
  request_line:material_request_lines!inner()
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    ? value
    : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized || Number.isNaN(new Date(normalized).getTime())) return null;
  return normalized;
}

function documentDataError(code: DocumentDataErrorCode): never {
  throw new DocumentDataError(code);
}

function clientFrom(dependencies: Partial<DocumentDataDependencies>) {
  return (dependencies.createClient ?? createAdminClient)();
}

function mapClaimedJob(value: unknown): ClaimedDocumentJob {
  if (!isRecord(value)) return documentDataError("INVALID_DOCUMENT_JOB_RESPONSE");

  const id = text(value.id);
  const requestId = text(value.request_id);
  const documentType = text(value.document_type);
  const templateVersion = text(value.template_version);
  const attempts = positiveInteger(value.attempts);
  const leaseExpiresAt = timestamp(value.lease_expires_at);

  if (
    !id
    || !UUID_PATTERN.test(id)
    || !requestId
    || !UUID_PATTERN.test(requestId)
    || !documentType
    || !DOCUMENT_KINDS.has(documentType as OfficialDocumentKind)
    || !templateVersion
    || attempts === null
    || !leaseExpiresAt
  ) {
    return documentDataError("INVALID_DOCUMENT_JOB_RESPONSE");
  }

  return {
    id,
    requestId,
    documentType: documentType as OfficialDocumentKind,
    templateVersion,
    attempts,
    leaseExpiresAt,
  };
}

function mapFulfillment(value: unknown): OfficialPdfFulfillmentSource & {
  requestLineId: string;
} {
  if (!isRecord(value)) return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  const id = text(value.id);
  const requestLineId = text(value.request_line_id);
  const quantity = positiveInteger(value.quantity);
  const fulfilledAt = timestamp(value.fulfilled_at);
  const notes = optionalText(value.notes);
  if (
    !id
    || !UUID_PATTERN.test(id)
    || !requestLineId
    || !UUID_PATTERN.test(requestLineId)
    || quantity === null
    || !fulfilledAt
    || notes === undefined
  ) {
    return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  }
  return { id, requestLineId, quantity, fulfilledAt, notes };
}

function mapLine(
  value: unknown,
  fulfillments: Map<string, OfficialPdfFulfillmentSource[]>,
): OfficialPdfLineSource {
  if (!isRecord(value)) return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");

  const id = text(value.id);
  const fabtekCode = text(value.snapshot_fabtek_code);
  const oracleSapioCode = optionalText(value.snapshot_oracle_sapio_code);
  const categoryName = text(value.snapshot_category_name);
  const familyName = text(value.snapshot_family_name);
  const componentName = text(value.snapshot_component_name);
  const description = text(value.snapshot_description);
  const diameter = optionalText(value.snapshot_diameter);
  const material = text(value.snapshot_material);
  const connection = text(value.snapshot_connection);
  const unitOfMeasure = text(value.snapshot_unit_of_measure);
  const requestedQuantity = positiveInteger(value.requested_quantity);
  const fulfilledQuantity = nonNegativeInteger(value.fulfilled_quantity);

  if (
    !id
    || !UUID_PATTERN.test(id)
    || !fabtekCode
    || oracleSapioCode === undefined
    || !categoryName
    || !familyName
    || !componentName
    || !description
    || diameter === undefined
    || !material
    || !connection
    || !unitOfMeasure
    || requestedQuantity === null
    || fulfilledQuantity === null
    || fulfilledQuantity > requestedQuantity
  ) {
    return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  }

  return {
    id,
    fabtekCode,
    oracleSapioCode,
    categoryName,
    familyName,
    componentName,
    description,
    diameter,
    material,
    connection,
    unitOfMeasure,
    requestedQuantity,
    fulfilledQuantity,
    fulfillments: fulfillments.get(id) ?? [],
  };
}

function mapOfficialSource(
  request: unknown,
  lines: readonly unknown[],
  fulfillmentRows: readonly unknown[],
): OfficialPdfSource {
  if (!isRecord(request) || !isRecord(request.requester)) {
    return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  }

  const id = text(request.id);
  const requestNumber = positiveInteger(request.request_number);
  const requestedAt = timestamp(request.requested_at);
  const requesterName = text(request.requester.full_name);
  const project = text(request.project);
  const toolLine = text(request.tool_line);
  const utilities = text(request.utilities);
  const notes = optionalText(request.notes);
  const status = text(request.status);
  if (
    !id
    || !UUID_PATTERN.test(id)
    || requestNumber === null
    || !requestedAt
    || !requesterName
    || !project
    || !toolLine
    || !utilities
    || notes === undefined
    || !status
    || !REQUEST_STATUSES.has(status as OfficialPdfSource["status"])
  ) {
    return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  }

  const fulfillments = new Map<string, OfficialPdfFulfillmentSource[]>();
  for (const row of fulfillmentRows) {
    const { requestLineId, ...event } = mapFulfillment(row);
    const events = fulfillments.get(requestLineId) ?? [];
    events.push(event);
    fulfillments.set(requestLineId, events);
  }

  const mappedLines = lines.map((line) => mapLine(line, fulfillments));
  if (mappedLines.length === 0) {
    return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  }
  const lineIds = new Set(mappedLines.map((line) => line.id));
  if (
    lineIds.size !== mappedLines.length
    || [...fulfillments.keys()].some((lineId) => !lineIds.has(lineId))
  ) {
    return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  }

  return {
    id,
    requestNumber,
    requestedAt,
    requesterName,
    project,
    toolLine,
    utilities,
    notes,
    status: status as OfficialPdfSource["status"],
    lines: mappedLines,
  };
}

export async function claimGeneratedDocumentJobs(
  input: ClaimDocumentJobsInput,
  dependencies: Partial<DocumentDataDependencies> = {},
): Promise<ClaimedDocumentJob[]> {
  const supabase = clientFrom(dependencies);
  try {
    const { data, error } = await supabase.rpc("claim_generated_document_jobs", {
      p_limit: input.batchSize,
      p_lease_seconds: input.leaseSeconds,
    });
    if (error) return documentDataError("CLAIM_DOCUMENTS_FAILED");
    if (!Array.isArray(data)) return documentDataError("INVALID_DOCUMENT_JOB_RESPONSE");
    return data.map(mapClaimedJob);
  } catch (error) {
    if (error instanceof DocumentDataError) throw error;
    return documentDataError("CLAIM_DOCUMENTS_FAILED");
  }
}

export async function loadOfficialPdfSource(
  requestId: string,
  dependencies: Partial<DocumentDataDependencies> = {},
): Promise<OfficialPdfSource> {
  if (!UUID_PATTERN.test(requestId)) {
    return documentDataError("INVALID_OFFICIAL_SOURCE_RESPONSE");
  }
  const supabase = clientFrom(dependencies);

  try {
    const { data: request, error } = await supabase
      .from("material_requests")
      .select(REQUEST_SELECT)
      .eq("id", requestId)
      .maybeSingle();
    if (error) return documentDataError("LOAD_OFFICIAL_SOURCE_FAILED");
    if (!request) return documentDataError("DOCUMENT_SOURCE_NOT_FOUND");

    const [lines, fulfillments] = await Promise.all([
      collectPaginatedRows(async (from, to) => {
        const response = await supabase
          .from("material_request_lines")
          .select(REQUEST_LINE_SELECT)
          .eq("request_id", requestId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        return { data: response.data, error: response.error };
      }),
      collectPaginatedRows(async (from, to) => {
        const response = await supabase
          .from("fulfillment_events")
          .select(FULFILLMENT_SELECT)
          .eq("request_line.request_id", requestId)
          .order("fulfilled_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        return { data: response.data, error: response.error };
      }),
    ]);

    return mapOfficialSource(request, lines, fulfillments);
  } catch (error) {
    if (error instanceof DocumentDataError) throw error;
    return documentDataError("LOAD_OFFICIAL_SOURCE_FAILED");
  }
}

export async function uploadGeneratedPdf(
  path: string,
  buffer: Buffer,
  dependencies: Partial<DocumentDataDependencies> = {},
): Promise<void> {
  const supabase = clientFrom(dependencies);
  try {
    const { error } = await supabase.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(path, buffer, {
        upsert: true,
        contentType: "application/pdf",
        cacheControl: "0",
      });
    if (error) return documentDataError("UPLOAD_GENERATED_PDF_FAILED");
  } catch (error) {
    if (error instanceof DocumentDataError) throw error;
    return documentDataError("UPLOAD_GENERATED_PDF_FAILED");
  }
}

export async function completeGeneratedDocumentJob(
  input: CompleteDocumentJobInput,
  dependencies: Partial<DocumentDataDependencies> = {},
): Promise<void> {
  const supabase = clientFrom(dependencies);
  try {
    const { data, error } = await supabase.rpc("complete_generated_document_job", {
      p_job_id: input.jobId,
      p_attempts: input.attempts,
      p_storage_path: input.storagePath,
      p_content_sha256: input.sha256,
      p_template_version: input.templateVersion,
      p_recipients: input.recipients,
      p_subject: input.subject,
    });
    if (error) return documentDataError("COMPLETE_DOCUMENT_JOB_FAILED");
    if (data !== true) return documentDataError("DOCUMENT_JOB_LEASE_LOST");
  } catch (error) {
    if (error instanceof DocumentDataError) throw error;
    return documentDataError("COMPLETE_DOCUMENT_JOB_FAILED");
  }
}

export async function failGeneratedDocumentJob(
  input: FailDocumentJobInput,
  dependencies: Partial<DocumentDataDependencies> = {},
): Promise<void> {
  const supabase = clientFrom(dependencies);
  try {
    const { data, error } = await supabase.rpc("fail_generated_document_job", {
      p_job_id: input.jobId,
      p_attempts: input.attempts,
      p_error: input.error,
      p_retry_at: input.retryAt,
      p_terminal: input.terminal,
    });
    if (error) return documentDataError("FAIL_DOCUMENT_JOB_FAILED");
    if (data !== true) return documentDataError("DOCUMENT_JOB_LEASE_LOST");
  } catch (error) {
    if (error instanceof DocumentDataError) throw error;
    return documentDataError("FAIL_DOCUMENT_JOB_FAILED");
  }
}
