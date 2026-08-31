import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
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
const { mapOfficialPdfDocument } = await import("../lib/pdf/mappers.ts");
const { renderPdfDocument } = await import("../lib/pdf/render-pdf.tsx");

async function extractPdfPages(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
    const page = await pdf.getPage(index + 1);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const items = content.items.map((item) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
    }));
    return { height: viewport.height, items, text: items.map((item) => item.text).join(" ") };
  }));
  await loadingTask.destroy();
  return pages;
}

async function extractPdfText(buffer) {
  return (await extractPdfPages(buffer)).map((page) => page.text).join("\n");
}

async function extractFirstPageFillColors(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const operators = await page.getOperatorList();
  const colors = operators.fnArray.flatMap((operator, index) => {
    if (operator !== OPS.setFillRGBColor) return [];
    const args = operators.argsArray[index];
    if (args.length === 1 && typeof args[0] === "string") {
      return [args[0].toLowerCase()];
    }
    const channels = args.length === 1 && args[0]?.length === 3
      ? Array.from(args[0])
      : Array.from(args);
    const hex = channels.map((channel) => Math.round(
      channel <= 1 ? channel * 255 : channel,
    ).toString(16).padStart(2, "0")).join("");
    return [`#${hex}`];
  });
  await loadingTask.destroy();
  return colors;
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

test("renders the current request status as a header badge in every PDF kind", async () => {
  const documents = [
    {
      document: { kind: "draft", ...common },
      title: "Distinta richiesta materiale",
      status: "Bozza",
    },
    {
      document: {
        kind: "initial_request",
        requestNumber: 17,
        statusLabel: "In preparazione",
        ...common,
      },
      title: "Richiesta materiale #17",
      status: "In preparazione",
    },
    {
      document: {
        kind: "final_report",
        requestNumber: 17,
        statusLabel: "Evasa",
        ...common,
        lines: [{
          ...line,
          fulfilledQuantity: 10,
          remainingQuantity: 0,
          fulfillments: [],
        }],
      },
      title: "Report finale richiesta #17",
      status: "Evasa",
    },
  ];

  for (const { document, title, status } of documents) {
    const [page] = await extractPdfPages(await renderPdfDocument(document));
    const titleItem = page.items.find((item) => item.text.includes(title));
    const statusItems = page.items.filter((item) => item.text === status);

    assert.ok(titleItem, `${document.kind} title must be rendered`);
    const headerStatusItems = statusItems.filter(
      (item) => Math.abs(item.y - titleItem.y) < 4,
    );
    assert.equal(headerStatusItems.length, 1, `${document.kind} must render one status badge`);
    assert.ok(
      Math.abs(headerStatusItems[0].y - titleItem.y) < 4,
      `${document.kind} status must stay aligned with the title`,
    );
  }
});

test("maps every request status to the matching PDF badge tone", () => {
  const source = {
    id: "10000000-0000-4000-8000-000000000001",
    requestNumber: 17,
    requestedAt: "2026-08-31T09:30:00.000Z",
    requesterName: "Mario Rossi",
    project: "P-44",
    toolLine: "TL-2",
    utilities: "Aria compressa",
    notes: null,
    status: "in_preparazione",
    lines: [{
      id: "20000000-0000-4000-8000-000000000001",
      ...line,
      fulfilledQuantity: 0,
      fulfillments: [],
    }],
  };

  for (const [status, statusLabel, statusTone] of [
    ["in_preparazione", "In preparazione", "pending"],
    ["evasa_parziale", "Evasa parzialmente", "warning"],
    ["evasa", "Evasa", "good"],
  ]) {
    const document = mapOfficialPdfDocument({ ...source, status }, "initial_request");
    assert.equal(document.statusLabel, statusLabel);
    assert.equal(document.statusTone, statusTone);
  }
});

test("renders PDF status badges with the UI semantic palette", async () => {
  const documents = [
    {
      document: { kind: "draft", ...common },
      foreground: "#5b6472",
      background: "#eaecef",
    },
    {
      document: {
        kind: "initial_request",
        requestNumber: 17,
        statusLabel: "Evasa parzialmente",
        statusTone: "warning",
        ...common,
      },
      foreground: "#8c550c",
      background: "#fbeedd",
    },
    {
      document: {
        kind: "final_report",
        requestNumber: 17,
        statusLabel: "Evasa",
        statusTone: "good",
        ...common,
        lines: [{ ...line, fulfilledQuantity: 10, remainingQuantity: 0, fulfillments: [] }],
      },
      foreground: "#246b42",
      background: "#e4f3ea",
    },
  ];

  for (const { document, foreground, background } of documents) {
    const colors = await extractFirstPageFillColors(await renderPdfDocument(document));
    assert.ok(
      colors.includes(foreground),
      `${document.kind} badge must use ${foreground}; rendered ${colors.join(", ")}`,
    );
    assert.ok(
      colors.includes(background),
      `${document.kind} badge must use ${background}; rendered ${colors.join(", ")}`,
    );
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
  const initialRowPage = (await extractPdfPages(initialRequest)).find((page) => page.text.includes("FT-009"));

  assert.ok(initialRowPage);
  assert.match(initialRowPage.text, /serie 009/);
  assert.match(initialRowPage.text, /OR-909/);
  assert.match(initialRowPage.text, /19 m/);
  const footerTop = Math.min(...initialRowPage.items
    .filter((item) => item.text.includes("Fabtek"))
    .map((item) => item.y));
  for (const rowText of ["FT-009", "serie 009", "OR-909", "19 m"]) {
    const item = initialRowPage.items.find((candidate) => candidate.text.includes(rowText));
    assert.ok(item);
    assert.ok(item.y > footerTop + 8, `${rowText} must stay above the footer`);
  }

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
  const finalRowPage = (await extractPdfPages(finalReport)).find((page) => page.text.includes("FT-006"));

  assert.ok(finalRowPage);
  assert.match(finalRowPage.text, /Prima consegna FT-006/);
  assert.match(finalRowPage.text, /Consegna completa FT-006/);
});

test("keeps the first history entry with a four-entry final material row", async () => {
  const finalReport = await renderPdfDocument({
    kind: "final_report",
    requestNumber: 17,
    statusLabel: "Evasa",
    ...common,
    lines: Array.from({ length: 30 }, (_, index) => {
      const number = String(index + 1).padStart(3, "0");
      const material = { ...paginationLine(index + 1), fabtekCode: `MAT-${number}` };
      return {
        ...material,
        fulfilledQuantity: material.requestedQuantity,
        remainingQuantity: 0,
        fulfillments: Array.from({ length: 4 }, (_, fulfillmentIndex) => ({
          quantity: 1,
          fulfilledAtLabel: `28/08/2026 ${fulfillmentIndex + 1}:00`,
          notes: `MAT-${number}-H${fulfillmentIndex + 1}`,
        })),
      };
    }),
  });
  const materialPage = (await extractPdfPages(finalReport)).find((page) => page.text.includes("MAT-016"));

  assert.ok(materialPage);
  assert.match(materialPage.text, /MAT-016-H1/);
});
