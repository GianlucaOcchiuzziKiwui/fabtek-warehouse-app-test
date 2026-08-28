import type { CatalogSelection } from "@/lib/data/catalog";
import type { SubmitRequestInput } from "@/lib/domain/requests/contracts";
import type { PdfDocument, PdfLine } from "./contracts";

const DRAFT_DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Rome",
});

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
    documentDateLabel: DRAFT_DATE_FORMATTER.format(now),
    lines: input.lines.map((line) => mapDraftLine(
      line,
      selectionsByVariantId.get(line.itemVariantId)!,
    )),
  };
}
