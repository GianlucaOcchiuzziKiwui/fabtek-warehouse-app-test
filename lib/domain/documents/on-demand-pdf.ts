import "server-only";

import type { OfficialDocumentKind, OfficialPdfSource } from "../../data/documents.ts";
import { getPdfFilename, type PdfDocument } from "../../pdf/contracts.ts";
import { mapOfficialPdfDocument } from "../../pdf/mappers.ts";

type PdfRenderer = (document: PdfDocument) => Promise<Buffer>;

export class OnDemandPdfError extends Error {
  readonly code: "FINAL_REPORT_NOT_READY" | "PDF_RENDER_FAILED";

  constructor(code: "FINAL_REPORT_NOT_READY" | "PDF_RENDER_FAILED") {
    super("Il PDF non è disponibile in questo momento.");
    this.name = "OnDemandPdfError";
    this.code = code;
  }
}

async function renderPdfDocument(document: PdfDocument): Promise<Buffer> {
  const { renderPdfDocument: render } = await import("../../pdf/server.ts");
  return render(document);
}

export async function createOnDemandPdf(
  source: OfficialPdfSource,
  kind: OfficialDocumentKind,
  dependencies: { render?: PdfRenderer } = {},
): Promise<{ buffer: Buffer; filename: string }> {
  if (kind === "final_report" && source.status !== "evasa") {
    throw new OnDemandPdfError("FINAL_REPORT_NOT_READY");
  }

  const document = mapOfficialPdfDocument(source, kind);
  try {
    const buffer = await (dependencies.render ?? renderPdfDocument)(document);
    return { buffer, filename: getPdfFilename(document) };
  } catch (error) {
    if (error instanceof OnDemandPdfError) throw error;
    throw new OnDemandPdfError("PDF_RENDER_FAILED");
  }
}
