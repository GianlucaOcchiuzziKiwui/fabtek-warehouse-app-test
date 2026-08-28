import { Font, renderToBuffer } from "@react-pdf/renderer";
import path from "node:path";

import { FabtekPdf } from "./document.tsx";
import type { PdfDocument } from "./contracts.ts";

Font.register({
  family: "IBM Plex Sans",
  fonts: [
    { src: path.join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff"), fontWeight: 600 },
  ],
});

export async function renderPdfDocument(document: PdfDocument): Promise<Buffer> {
  if (document.lines.length === 0) throw new Error("PDF_DOCUMENT_EMPTY");
  return renderToBuffer(<FabtekPdf document={document} />);
}
