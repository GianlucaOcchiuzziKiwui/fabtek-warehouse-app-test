import type { CatalogSelection } from "@/lib/data/catalog";
import type {
  OfficialPdfLineSource,
  OfficialPdfSource,
} from "@/lib/data/documents";
import type { SubmitRequestInput } from "@/lib/domain/requests/contracts";
import type { PdfDocument, PdfLine } from "./contracts";

const DOCUMENT_DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Rome",
});

const EVENT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Rome",
});

export type OfficialPdfMappingErrorCode =
  | "INVALID_OFFICIAL_PDF_SOURCE"
  | "INVALID_FINAL_REPORT_QUANTITIES";

export class OfficialPdfMappingError extends Error {
  readonly code: OfficialPdfMappingErrorCode;

  constructor(code: OfficialPdfMappingErrorCode) {
    super("I dati del documento ufficiale non sono validi.");
    this.name = "OfficialPdfMappingError";
    this.code = code;
  }
}

function mappingError(code: OfficialPdfMappingErrorCode): never {
  throw new OfficialPdfMappingError(code);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return nonEmptyText(value) && !Number.isNaN(new Date(value).getTime());
}

function validateLineSnapshot(line: OfficialPdfLineSource) {
  if (
    !line
    || !nonEmptyText(line.id)
    || !nonEmptyText(line.fabtekCode)
    || (line.oracleSapioCode !== null && !nonEmptyText(line.oracleSapioCode))
    || !nonEmptyText(line.categoryName)
    || !nonEmptyText(line.familyName)
    || !nonEmptyText(line.componentName)
    || !nonEmptyText(line.description)
    || (line.diameter !== null && !nonEmptyText(line.diameter))
    || !nonEmptyText(line.material)
    || !nonEmptyText(line.connection)
    || !nonEmptyText(line.unitOfMeasure)
    || !Number.isSafeInteger(line.requestedQuantity)
    || line.requestedQuantity <= 0
  ) {
    return mappingError("INVALID_OFFICIAL_PDF_SOURCE");
  }
}

function statusLabel(status: OfficialPdfSource["status"]): string {
  switch (status) {
    case "in_preparazione":
      return "In preparazione";
    case "evasa_parziale":
      return "Evasa parzialmente";
    case "evasa":
      return "Evasa";
    default:
      return mappingError("INVALID_OFFICIAL_PDF_SOURCE");
  }
}

export function toDraftLineDetails(selection: CatalogSelection) {
  return {
    stock: {
      trackInventory: selection.variant.stock.trackInventory,
      availableQuantity: selection.variant.stock.availableQuantity,
    },
  };
}

function mapDraftLine(
  line: SubmitRequestInput["lines"][number],
  selection: CatalogSelection,
): PdfLine {
  const category = selection.variant.categories.find(
    (item) => item.id === selection.categoryId,
  );

  return {
    fabtekCode: selection.variant.fabtekCode,
    oracleSapioCode: selection.variant.oracleSapioCode,
    categoryName: category?.name ?? "",
    familyName: selection.variant.family?.name ?? "",
    componentName: selection.variant.component?.name ?? selection.variant.description,
    description: selection.variant.description,
    diameter: selection.variant.diameter,
    material: selection.variant.material,
    connection: selection.variant.connection,
    unitOfMeasure: selection.variant.unitOfMeasure?.code ?? "",
    requestedQuantity: line.quantity,
  };
}

export function mapDraftPdfDocument(
  input: SubmitRequestInput,
  requesterName: string,
  selections: readonly CatalogSelection[],
  now: Date,
): PdfDocument {
  const selectionsByVariantId = new Map(
    selections.map((selection) => [selection.itemVariantId, selection]),
  );

  return {
    kind: "draft",
    requesterName,
    project: input.project,
    toolLine: input.toolLine,
    utilities: input.utilities,
    notes: input.notes,
    documentDateLabel: DOCUMENT_DATE_FORMATTER.format(now),
    lines: input.lines.map((line) => mapDraftLine(
      line,
      selectionsByVariantId.get(line.itemVariantId)!,
    )),
  };
}

function mapOfficialLine(
  line: OfficialPdfLineSource,
  kind: "initial_request" | "final_report",
): PdfLine {
  validateLineSnapshot(line);
  const mapped: PdfLine = {
    fabtekCode: line.fabtekCode.trim(),
    oracleSapioCode: line.oracleSapioCode?.trim() ?? null,
    categoryName: line.categoryName.trim(),
    familyName: line.familyName.trim(),
    componentName: line.componentName.trim(),
    description: line.description.trim(),
    diameter: line.diameter?.trim() ?? null,
    material: line.material.trim(),
    connection: line.connection.trim(),
    unitOfMeasure: line.unitOfMeasure.trim(),
    requestedQuantity: line.requestedQuantity,
  };

  if (kind === "initial_request") return mapped;
  if (
    !Number.isSafeInteger(line.fulfilledQuantity)
    || line.fulfilledQuantity < 0
    || line.fulfilledQuantity !== line.requestedQuantity
    || !Array.isArray(line.fulfillments)
  ) {
    return mappingError("INVALID_FINAL_REPORT_QUANTITIES");
  }

  const fulfillments = line.fulfillments.map((event) => {
    if (
      !event
      || !nonEmptyText(event.id)
      || !Number.isSafeInteger(event.quantity)
      || event.quantity <= 0
      || !validTimestamp(event.fulfilledAt)
      || (event.notes !== null && typeof event.notes !== "string")
    ) {
      return mappingError("INVALID_FINAL_REPORT_QUANTITIES");
    }
    return {
      id: event.id,
      quantity: event.quantity,
      fulfilledAt: event.fulfilledAt,
      fulfilledAtLabel: EVENT_TIMESTAMP_FORMATTER.format(new Date(event.fulfilledAt)),
      notes: event.notes?.trim() || null,
    };
  }).sort((left, right) => (
    left.fulfilledAt.localeCompare(right.fulfilledAt)
    || left.id.localeCompare(right.id)
  ));

  const fulfilledTotal = fulfillments.reduce((total, event) => total + event.quantity, 0);
  if (fulfilledTotal !== line.fulfilledQuantity) {
    return mappingError("INVALID_FINAL_REPORT_QUANTITIES");
  }

  return {
    ...mapped,
    fulfilledQuantity: line.fulfilledQuantity,
    remainingQuantity: line.requestedQuantity - line.fulfilledQuantity,
    fulfillments: fulfillments.map((event) => ({
      quantity: event.quantity,
      fulfilledAtLabel: event.fulfilledAtLabel,
      notes: event.notes,
    })),
  };
}

export function mapOfficialPdfDocument(
  source: OfficialPdfSource,
  kind: "initial_request" | "final_report",
): PdfDocument {
  if (
    !source
    || !nonEmptyText(source.id)
    || !Number.isSafeInteger(source.requestNumber)
    || source.requestNumber <= 0
    || !validTimestamp(source.requestedAt)
    || !nonEmptyText(source.requesterName)
    || !nonEmptyText(source.project)
    || !nonEmptyText(source.toolLine)
    || !nonEmptyText(source.utilities)
    || (source.notes !== null && typeof source.notes !== "string")
    || !Array.isArray(source.lines)
    || source.lines.length === 0
    || (kind === "final_report" && source.status !== "evasa")
  ) {
    return mappingError("INVALID_OFFICIAL_PDF_SOURCE");
  }

  return {
    kind,
    requestNumber: source.requestNumber,
    requesterName: source.requesterName.trim(),
    project: source.project.trim(),
    toolLine: source.toolLine.trim(),
    utilities: source.utilities.trim(),
    notes: source.notes?.trim() || null,
    statusLabel: statusLabel(source.status),
    documentDateLabel: DOCUMENT_DATE_FORMATTER.format(new Date(source.requestedAt)),
    lines: source.lines.map((line) => mapOfficialLine(line, kind)),
  };
}
