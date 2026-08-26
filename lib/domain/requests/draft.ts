export type RequestDraftHeader = {
  project: string;
  toolLine: string;
  utilities: string;
  notes: string;
};

export type RequestDraftLine = {
  itemVariantId: string;
  categoryId: string;
  quantity: number;
};

export type RequestDraft = {
  version: 1;
  clientRequestId: string;
  header: RequestDraftHeader;
  lines: RequestDraftLine[];
};

export type DraftAction =
  | { type: "set-header"; header: Partial<RequestDraftHeader> }
  | { type: "add-line"; line: RequestDraftLine }
  | { type: "set-quantity"; itemVariantId: string; quantity: number }
  | { type: "remove-line"; itemVariantId: string }
  | { type: "hydrate"; draft: RequestDraft }
  | { type: "reset" };

const DRAFT_VERSION = 1;
const MAX_QUANTITY = 999_999;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseHeader(value: unknown): RequestDraftHeader | null {
  if (!isRecord(value)) return null;

  const { project, toolLine, utilities, notes } = value;
  if (
    typeof project !== "string"
    || typeof toolLine !== "string"
    || typeof utilities !== "string"
    || typeof notes !== "string"
  ) {
    return null;
  }

  return { project, toolLine, utilities, notes };
}

function parseLine(value: unknown): RequestDraftLine | null {
  if (!isRecord(value)) return null;

  const { itemVariantId, categoryId, quantity } = value;
  if (
    !isUuid(itemVariantId)
    || !isUuid(categoryId)
    || typeof quantity !== "number"
    || !Number.isInteger(quantity)
    || quantity < 1
    || quantity > MAX_QUANTITY
  ) {
    return null;
  }

  return { itemVariantId, categoryId, quantity };
}

export function createEmptyDraft(): RequestDraft {
  return {
    version: DRAFT_VERSION,
    clientRequestId: crypto.randomUUID(),
    header: { project: "", toolLine: "", utilities: "", notes: "" },
    lines: [],
  };
}

export function parsePersistedRequestDraft(snapshot: string | null): RequestDraft | null {
  if (!snapshot) return null;

  try {
    const value: unknown = JSON.parse(snapshot);
    if (!isRecord(value) || value.version !== DRAFT_VERSION || !isUuid(value.clientRequestId)) {
      return null;
    }

    const header = parseHeader(value.header);
    if (!header || !Array.isArray(value.lines)) return null;

    const variantIds = new Set<string>();
    const lines: RequestDraftLine[] = [];
    for (const valueLine of value.lines) {
      const line = parseLine(valueLine);
      if (!line || variantIds.has(line.itemVariantId)) return null;
      variantIds.add(line.itemVariantId);
      lines.push(line);
    }

    return {
      version: DRAFT_VERSION,
      clientRequestId: value.clientRequestId,
      header,
      lines,
    };
  } catch {
    return null;
  }
}

export function requestDraftReducer(
  draft: RequestDraft,
  action: DraftAction,
): RequestDraft {
  switch (action.type) {
    case "set-header":
      return { ...draft, header: { ...draft.header, ...action.header } };
    case "add-line": {
      const line = parseLine(action.line);
      if (!line) return draft;

      const existingLineIndex = draft.lines.findIndex(
        (draftLine) => draftLine.itemVariantId === line.itemVariantId,
      );
      if (existingLineIndex === -1) {
        return { ...draft, lines: [...draft.lines, line] };
      }

      return {
        ...draft,
        lines: draft.lines.map((draftLine, index) => (
          index === existingLineIndex ? line : draftLine
        )),
      };
    }
    case "set-quantity":
      if (
        !Number.isInteger(action.quantity)
        || action.quantity < 1
        || action.quantity > MAX_QUANTITY
      ) {
        return draft;
      }
      return {
        ...draft,
        lines: draft.lines.map((line) => (
          line.itemVariantId === action.itemVariantId
            ? { ...line, quantity: action.quantity }
            : line
        )),
      };
    case "remove-line":
      return {
        ...draft,
        lines: draft.lines.filter((line) => line.itemVariantId !== action.itemVariantId),
      };
    case "hydrate":
      return action.draft;
    case "reset":
      return createEmptyDraft();
  }
}
