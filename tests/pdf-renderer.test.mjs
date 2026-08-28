import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import typescript from "typescript";

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    return {
      format: "module",
      source: typescript.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: {
          jsx: typescript.JsxEmit.ReactJSX,
          module: typescript.ModuleKind.ESNext,
          target: typescript.ScriptTarget.ES2022,
        },
      }).outputText,
      shortCircuit: true,
    };
  },
});

const { getPdfFilename } = await import("../lib/pdf/contracts.ts");
const { renderPdfDocument } = await import("../lib/pdf/render-pdf.tsx");

async function extractPdfPages(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
    const content = await (await pdf.getPage(index + 1)).getTextContent();
    return content.items.map((item) => item.str).join(" ");
  }));
  await loadingTask.destroy();
  return pages;
}

async function extractPdfText(buffer) {
  return (await extractPdfPages(buffer)).join("\n");
}

const line = {
  fabtekCode: "FT-001",
  oracleSapioCode: "OR-900",
  categoryName: "Gas",
  familyName: "Flessibili",
  componentName: "Tubo",
  description: "Tubo flessibile PTFE",
  diameter: "DN10",
  material: "PTFE",
  connection: "1/2 NPT",
  unitOfMeasure: "m",
  requestedQuantity: 10,
};

const common = {
  requesterName: "Mario Rossi",
  project: "P-44",
  toolLine: "TL-2",
  utilities: "Aria compressa",
  notes: "Consegna al reparto nord",
  documentDateLabel: "28/08/2026",
  lines: [line],
};

function paginationLine(index) {
  const number = String(index).padStart(3, "0");
  return {
    ...line,
    fabtekCode: `FT-${number}`,
    oracleSapioCode: `OR-${900 + index}`,
    description: `Tubo flessibile PTFE serie ${number}`,
    requestedQuantity: 10 + index,
  };
}

test("renders every document kind as a real PDF", async () => {
  const documents = [
    { kind: "draft", ...common },
    { kind: "initial_request", requestNumber: 17, statusLabel: "In preparazione", ...common },
    { kind: "final_report", requestNumber: 17, statusLabel: "Evasa", ...common,
      lines: [{ ...line, fulfilledQuantity: 10, remainingQuantity: 0, fulfillments: [] }] },
  ];
  for (const document of documents) {
    const buffer = await renderPdfDocument(document);
    assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(buffer.length > 1_000);
  }
});

test("uses stable normalized filenames", () => {
  assert.equal(getPdfFilename({ kind: "draft", ...common }), "fabtek-distinta-bozza.pdf");
  assert.equal(getPdfFilename({ kind: "initial_request", requestNumber: 17, statusLabel: "In preparazione", ...common }), "fabtek-richiesta-000017.pdf");
});

test("renders a larger PDF for an eighty-line material request", async () => {
  const singleLinePdf = await renderPdfDocument({ kind: "draft", ...common });
  const multiPagePdf = await renderPdfDocument({
    kind: "draft",
    ...common,
    lines: Array.from({ length: 80 }, (_, index) => ({
      ...line,
      fabtekCode: `FT-${String(index + 1).padStart(3, "0")}`,
    })),
  });

  assert.equal(multiPagePdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok((multiPagePdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length > 1);
  assert.ok(multiPagePdf.length > singleLinePdf.length);
});

test("retains the final fulfillment when its history spans pages", async () => {
  const finalFulfillment = {
    quantity: 1,
    fulfilledAtLabel: "31/12/2026",
    notes: "ULTIMO-EVASO",
  };
  const buffer = await renderPdfDocument({
    kind: "final_report",
    requestNumber: 17,
    statusLabel: "Evasa",
    ...common,
    lines: [{
      ...line,
      fulfilledQuantity: 150,
      remainingQuantity: 0,
      fulfillments: [
        ...Array.from({ length: 149 }, (_, index) => ({
          quantity: 1,
          fulfilledAtLabel: `01/08/2026 ${String(index + 1).padStart(2, "0")}:00`,
          notes: `Evasione ${index + 1}`,
        })),
        finalFulfillment,
      ],
    }],
  });

  assert.match(await extractPdfText(buffer), /ULTIMO-EVASO/);
});

test("keeps initial request rows complete and final rows with their histories on one page", async () => {
  const initialRequest = await renderPdfDocument({
    kind: "initial_request",
    requestNumber: 17,
    statusLabel: "In preparazione",
    ...common,
    lines: Array.from({ length: 48 }, (_, index) => paginationLine(index + 1)),
  });
  const initialRowPage = (await extractPdfPages(initialRequest)).find((page) => page.includes("FT-009"));

  assert.ok(initialRowPage);
  assert.match(initialRowPage, /serie 009/);
  assert.match(initialRowPage, /OR-909/);
  assert.match(initialRowPage, /19 m/);

  const finalReport = await renderPdfDocument({
    kind: "final_report",
    requestNumber: 17,
    statusLabel: "Evasa",
    ...common,
    lines: Array.from({ length: 18 }, (_, index) => {
      const material = paginationLine(index + 1);
      return {
        ...material,
        fulfilledQuantity: material.requestedQuantity,
        remainingQuantity: 0,
        fulfillments: [
          { quantity: 5, fulfilledAtLabel: "27/08/2026 10:00", notes: `Prima consegna FT-${String(index + 1).padStart(3, "0")}` },
          { quantity: material.requestedQuantity - 5, fulfilledAtLabel: "28/08/2026 15:30", notes: `Consegna completa FT-${String(index + 1).padStart(3, "0")}` },
        ],
      };
    }),
  });
  const finalRowPage = (await extractPdfPages(finalReport)).find((page) => page.includes("FT-006"));

  assert.ok(finalRowPage);
  assert.match(finalRowPage, /Prima consegna FT-006/);
  assert.match(finalRowPage, /Consegna completa FT-006/);
});
