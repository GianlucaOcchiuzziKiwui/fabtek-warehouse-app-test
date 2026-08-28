import "server-only";

import type { CatalogSelection } from "@/lib/data/catalog";
import type { ActionResult } from "@/lib/domain/action-result";
import type { SubmitRequestLineInput } from "@/lib/domain/requests/contracts";
import { canAddDraftLine } from "@/lib/domain/requests/line-rules";
import { validateSubmitRequest } from "@/lib/domain/requests/validation";
import { getPdfFilename, type PdfDocument } from "@/lib/pdf/contracts";
import { mapDraftPdfDocument, toDraftLineDetails } from "@/lib/pdf/mappers";

export type DraftPdfDependencies = {
  requesterName: string;
  now: () => Date;
  loadSelections: (lines: readonly SubmitRequestLineInput[]) => Promise<CatalogSelection[]>;
  render: (document: PdfDocument) => Promise<Buffer>;
};

const INVALID_REQUEST_LINES = {
  code: "INVALID_REQUEST_LINES",
  message: "Uno o più articoli non sono più disponibili.",
} as const;

const CHANGED_AVAILABILITY = {
  code: "INVALID_REQUEST_LINES",
  message: "La disponibilità di uno o più articoli è cambiata.",
} as const;

async function defaultLoadSelections(lines: readonly SubmitRequestLineInput[]) {
  const { getCatalogVariantSelections } = await import("@/lib/data/catalog");
  return getCatalogVariantSelections(lines);
}

async function defaultRender(document: PdfDocument) {
  const { renderPdfDocument } = await import("@/lib/pdf/server");
  return renderPdfDocument(document);
}

export async function createDraftPdf(
  input: unknown,
  dependencies: Pick<DraftPdfDependencies, "requesterName"> & Partial<Omit<DraftPdfDependencies, "requesterName">>,
): Promise<ActionResult<{ buffer: Buffer; filename: string }>> {
  const validated = validateSubmitRequest(input);
  if (!validated.ok) return validated;

  const loadSelections = dependencies.loadSelections ?? defaultLoadSelections;
  const render = dependencies.render ?? defaultRender;
  const now = dependencies.now ?? (() => new Date());
  const selections = await loadSelections(validated.data.lines);
  if (selections.length !== validated.data.lines.length) {
    return { ok: false, error: INVALID_REQUEST_LINES };
  }

  for (const line of validated.data.lines) {
    const selection = selections.find((item) => item.itemVariantId === line.itemVariantId);
    if (!selection || !canAddDraftLine(toDraftLineDetails(selection), line.quantity).ok) {
      return { ok: false, error: CHANGED_AVAILABILITY };
    }
  }

  const document = mapDraftPdfDocument(
    validated.data,
    dependencies.requesterName,
    selections,
    now(),
  );
  return {
    ok: true,
    data: {
      buffer: await render(document),
      filename: getPdfFilename(document),
    },
  };
}
