import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const { renderPdfDocument } = await import("../lib/pdf/render-pdf.tsx");

const outputDirectory = path.join(process.cwd(), "output", "pdf");
const documentDateLabel = "28/08/2026";

function materialLine(index) {
  const number = String(index).padStart(3, "0");
  return {
    fabtekCode: `FT-${number}`,
    oracleSapioCode: `OR-${String(900 + index)}`,
    categoryName: "Gas",
    familyName: "Flessibili",
    componentName: "Tubo",
    description: `Tubo flessibile PTFE serie ${number}`,
    diameter: index % 2 === 0 ? "DN10" : "DN15",
    material: "PTFE",
    connection: index % 2 === 0 ? "1/2 NPT" : "3/4 NPT",
    unitOfMeasure: "m",
    requestedQuantity: 10 + index,
  };
}

const common = {
  requesterName: "Mario Rossi",
  project: "Progetto 21",
  toolLine: "Linea A",
  utilities: "Aria compressa",
  notes: "Consegna al reparto nord",
  documentDateLabel,
};

const documents = [
  {
    filename: "draft.pdf",
    document: {
      kind: "draft",
      ...common,
      lines: [materialLine(1)],
    },
  },
  {
    filename: "initial-request.pdf",
    document: {
      kind: "initial_request",
      requestNumber: 17,
      statusLabel: "In preparazione",
      ...common,
      lines: Array.from({ length: 48 }, (_, index) => materialLine(index + 1)),
    },
  },
  {
    filename: "final-report.pdf",
    document: {
      kind: "final_report",
      requestNumber: 17,
      statusLabel: "Evasa",
      ...common,
      lines: Array.from({ length: 18 }, (_, index) => {
        const line = materialLine(index + 1);
        const firstDelivery = Math.floor(line.requestedQuantity / 2);
        return {
          ...line,
          fulfilledQuantity: line.requestedQuantity,
          remainingQuantity: 0,
          fulfillments: [
            {
              quantity: firstDelivery,
              fulfilledAtLabel: "27/08/2026 10:00",
              notes: "Prima consegna",
            },
            {
              quantity: line.requestedQuantity - firstDelivery,
              fulfilledAtLabel: "28/08/2026 15:30",
              notes: "Consegna completa",
            },
          ],
        };
      }),
    },
  },
];

await mkdir(outputDirectory, { recursive: true });

for (const fixture of documents) {
  const buffer = await renderPdfDocument(fixture.document);
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${fixture.filename}: invalid PDF signature`);
  }
  if (buffer.length <= 1_000) {
    throw new Error(`${fixture.filename}: PDF is unexpectedly small`);
  }

  await writeFile(path.join(outputDirectory, fixture.filename), buffer);
  console.log(`Rendered ${fixture.filename} (${buffer.length} bytes)`);
}
