export type PdfFulfillment = {
  quantity: number;
  fulfilledAtLabel: string;
  notes: string | null;
};

export type PdfLine = {
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
  fulfilledQuantity?: number;
  remainingQuantity?: number;
  fulfillments?: PdfFulfillment[];
};

type PdfCommon = {
  requesterName: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string | null;
  documentDateLabel: string;
  lines: PdfLine[];
};

export type PdfStatusTone = "pending" | "warning" | "good";

export type PdfDocument =
  | ({ kind: "draft" } & PdfCommon)
  | ({ kind: "initial_request"; requestNumber: number; statusLabel: string; statusTone: PdfStatusTone } & PdfCommon)
  | ({ kind: "final_report"; requestNumber: number; statusLabel: string; statusTone: PdfStatusTone } & PdfCommon);

export function getPdfFilename(document: PdfDocument) {
  if (document.kind === "draft") return "fabtek-distinta-bozza.pdf";
  const number = String(document.requestNumber).padStart(6, "0");
  return document.kind === "initial_request"
    ? `fabtek-richiesta-${number}.pdf`
    : `fabtek-report-finale-${number}.pdf`;
}
