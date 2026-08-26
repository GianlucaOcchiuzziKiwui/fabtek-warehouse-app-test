export type RequestStatusCode =
  | "in_preparazione"
  | "evasa_parziale"
  | "evasa";

export type RequestStatusView = {
  label: string;
  tone: "pending" | "warning" | "good";
};

export type RequestListItem = {
  id: string;
  requestNumber: number;
  requestedAt: string;
  requestedAtLabel: string;
  project: string;
  lineCount: number;
  status: RequestStatusView;
};

export type FulfillmentHistoryItem = {
  id: string;
  quantity: number;
  fulfilledAt: string;
  fulfilledAtLabel: string;
  notes: string | null;
};

export type RequestLineDetail = {
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
  remainingQuantity: number;
  status: RequestStatusView;
  fulfillments: FulfillmentHistoryItem[];
};

export type RequestDetail = {
  id: string;
  requestNumber: number;
  requestedAt: string;
  requestedAtLabel: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string | null;
  status: RequestStatusView;
  lines: RequestLineDetail[];
};

type QuantitySummary = {
  requestedQuantity: number;
  fulfilledQuantity: number;
};

export class RequestMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestMappingError";
  }
}

const REQUEST_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Rome",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function mappingError(message: string): never {
  throw new RequestMappingError(message);
}

export function mapRequestStatus(status: unknown): RequestStatusView {
  switch (status) {
    case "evasa":
      return { label: "Evasa", tone: "good" };
    case "evasa_parziale":
      return { label: "Evasa parzialmente", tone: "warning" };
    case "in_preparazione":
      return { label: "In preparazione", tone: "pending" };
    default:
      return mappingError("Stato richiesta non valido.");
  }
}

export function formatRequestTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Data non disponibile";
  return REQUEST_TIMESTAMP_FORMATTER.format(date);
}

export function remainingQuantity(line: QuantitySummary): number {
  return Math.max(0, line.requestedQuantity - line.fulfilledQuantity);
}

function embeddedCount(value: unknown): number {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return mappingError("Conteggio righe richiesta non valido.");
  }
  const count = integer(value[0].count);
  if (count === null || count < 0) {
    return mappingError("Conteggio righe richiesta non valido.");
  }
  return count;
}

export function mapRequestListRows(rows: readonly unknown[]): RequestListItem[] {
  const items: RequestListItem[] = [];

  for (const row of rows) {
    if (!isRecord(row)) mappingError("Riga elenco richieste non valida.");
    const id = text(row.id);
    const requestNumber = integer(row.request_number);
    const requestedAt = text(row.requested_at);
    const project = text(row.project);
    if (!id || requestNumber === null || !requestedAt || !project) {
      mappingError("Riga elenco richieste non valida.");
    }

    items.push({
      id,
      requestNumber,
      requestedAt,
      requestedAtLabel: formatRequestTimestamp(requestedAt),
      project,
      lineCount: embeddedCount(row.lines),
      status: mapRequestStatus(row.status),
    });
  }

  return items;
}

function mapFulfillment(value: unknown): FulfillmentHistoryItem {
  if (!isRecord(value)) return mappingError("Evento evasione non valido.");
  const id = text(value.id);
  const quantity = integer(value.quantity);
  const fulfilledAt = text(value.fulfilled_at);
  if (!id || quantity === null || quantity <= 0 || !fulfilledAt) {
    return mappingError("Evento evasione non valido.");
  }

  return {
    id,
    quantity,
    fulfilledAt,
    fulfilledAtLabel: formatRequestTimestamp(fulfilledAt),
    notes: text(value.notes),
  };
}

type MappedRequestLine = {
  data: RequestLineDetail;
  createdAt: string;
};

function mapRequestLine(value: unknown): MappedRequestLine {
  if (!isRecord(value)) return mappingError("Riga richiesta non valida.");

  const id = text(value.id);
  const fabtekCode = text(value.snapshot_fabtek_code);
  const categoryName = text(value.snapshot_category_name);
  const familyName = text(value.snapshot_family_name);
  const componentName = text(value.snapshot_component_name);
  const description = text(value.snapshot_description);
  const material = text(value.snapshot_material);
  const connection = text(value.snapshot_connection);
  const unitOfMeasure = text(value.snapshot_unit_of_measure);
  const requestedQuantity = integer(value.requested_quantity);
  const fulfilledQuantity = integer(value.fulfilled_quantity);
  const createdAt = text(value.created_at);

  if (
    !id
    || !fabtekCode
    || !categoryName
    || !familyName
    || !componentName
    || !description
    || !material
    || !connection
    || !unitOfMeasure
    || requestedQuantity === null
    || fulfilledQuantity === null
    || !createdAt
  ) {
    return mappingError("Riga richiesta non valida.");
  }

  if (!Array.isArray(value.fulfillments)) {
    return mappingError("Relazione eventi evasione non valida.");
  }

  const fulfillments = value.fulfillments
    .map(mapFulfillment)
    .sort((left, right) => (
      left.fulfilledAt.localeCompare(right.fulfilledAt)
      || left.id.localeCompare(right.id)
    ));
  const quantities = { requestedQuantity, fulfilledQuantity };

  return {
    data: {
      id,
      fabtekCode,
      oracleSapioCode: text(value.snapshot_oracle_sapio_code),
      categoryName,
      familyName,
      componentName,
      description,
      diameter: text(value.snapshot_diameter),
      material,
      connection,
      unitOfMeasure,
      requestedQuantity,
      fulfilledQuantity,
      remainingQuantity: remainingQuantity(quantities),
      status: mapRequestStatus(value.status),
      fulfillments,
    },
    createdAt,
  };
}

export function attachFulfillmentsToLines(
  lineValues: unknown,
  fulfillmentValues: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(lineValues) || !Array.isArray(fulfillmentValues)) {
    return mappingError("Relazioni dettaglio richiesta non valide.");
  }

  const lines: Record<string, unknown>[] = [];
  const linesById = new Map<string, Record<string, unknown>>();

  for (const value of lineValues) {
    if (!isRecord(value)) mappingError("Riga richiesta non valida.");
    const id = text(value.id);
    if (!id || linesById.has(id)) mappingError("Riga richiesta non valida.");

    const line = { ...value, fulfillments: [] as unknown[] };
    mapRequestLine(line);
    lines.push(line);
    linesById.set(id, line);
  }

  const fulfillmentIds = new Set<string>();
  for (const value of fulfillmentValues) {
    if (!isRecord(value)) mappingError("Evento evasione non valido.");
    const requestLineId = text(value.request_line_id);
    const fulfillment = mapFulfillment(value);
    const line = requestLineId ? linesById.get(requestLineId) : undefined;
    if (!line || fulfillmentIds.has(fulfillment.id)) {
      mappingError("Evento evasione non associabile alla richiesta.");
    }

    fulfillmentIds.add(fulfillment.id);
    (line.fulfillments as unknown[]).push(value);
  }

  return lines;
}

export function mapRequestDetail(value: unknown): RequestDetail {
  if (!isRecord(value)) return mappingError("Dettaglio richiesta non valido.");

  const id = text(value.id);
  const requestNumber = integer(value.request_number);
  const requestedAt = text(value.requested_at);
  const project = text(value.project);
  const toolLine = text(value.tool_line);
  const utilities = text(value.utilities);
  if (
    !id
    || requestNumber === null
    || !requestedAt
    || !project
    || !toolLine
    || !utilities
  ) {
    return mappingError("Dettaglio richiesta non valido.");
  }

  if (!Array.isArray(value.lines)) {
    return mappingError("Relazione righe richiesta non valida.");
  }

  const lines = value.lines
    .map(mapRequestLine)
    .sort((left, right) => (
      left.createdAt.localeCompare(right.createdAt)
      || left.data.id.localeCompare(right.data.id)
    ))
    .map((line) => line.data);

  return {
    id,
    requestNumber,
    requestedAt,
    requestedAtLabel: formatRequestTimestamp(requestedAt),
    project,
    toolLine,
    utilities,
    notes: text(value.notes),
    status: mapRequestStatus(value.status),
    lines,
  };
}
