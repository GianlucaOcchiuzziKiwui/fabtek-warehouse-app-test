import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire, registerHooks } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const projectRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();

function loadProjectModule(relativePath, overrides = new Map(), cache = new Map()) {
  const filename = path.resolve(projectRoot, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;

  const source = projectRequire("node:fs").readFileSync(filename, "utf8");
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const { code } = transformSync(source, {
    filename,
    jsc: {
      parser: { syntax: "typescript", tsx: filename.endsWith(".tsx") },
      target: "es2022",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });

  function localRequire(specifier) {
    if (overrides.has(specifier)) return overrides.get(specifier);
    if (specifier.startsWith("@/")) {
      const resolved = path.resolve(projectRoot, specifier.slice(2));
      for (const extension of ["", ".ts", ".tsx"]) {
        const candidate = `${resolved}${extension}`;
        try {
          return loadProjectModule(path.relative(projectRoot, candidate), overrides, cache);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
    }
    return projectRequire(specifier);
  }

  new Function("require", "module", "exports", code)(
    localRequire,
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        format: "module",
        url: "data:text/javascript,export%20{}",
      };
    }
    return nextResolve(specifier, context);
  },
});

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";

test("the on-demand document boundary loads without persisted-pipeline secrets", async () => {
  const secretNames = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "REQUEST_EMAIL_RECIPIENTS",
    "EMAIL_FROM",
    "JOB_RUNNER_SECRET",
  ];
  const previousValues = new Map(secretNames.map((name) => [name, process.env[name]]));
  for (const name of secretNames) delete process.env[name];

  try {
    const cleanDocumentsModule = await import(
      `../lib/data/documents.ts?on-demand-boundary=${Date.now()}`
    );
    const cleanOnDemandModule = await import(
      `../lib/domain/documents/on-demand-pdf.ts?on-demand-boundary=${Date.now()}`
    );

    assert.equal(typeof cleanDocumentsModule.loadAuthorizedOfficialPdfSource, "function");
    assert.equal(typeof cleanOnDemandModule.createOnDemandPdf, "function");
    assert.deepEqual(
      Object.keys(cleanDocumentsModule).sort(),
      ["DocumentDataError", "loadAuthorizedOfficialPdfSource"],
    );
  } finally {
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});


test("draft document route is authenticated, server-rendered, and non-cacheable", async () => {
  const source = await readFile("app/api/documents/draft/route.ts", "utf8");

  assert.doesNotMatch(source, /export const runtime/u);
  assert.match(source, /getCurrentProfile/u);
  assert.match(source, /can\(profile, "requests:create"\)/u);
  assert.match(source, /Content-Disposition/u);
  assert.match(source, /Cache-Control/u);
  assert.doesNotMatch(source, /window\.print/u);
});

test("on-demand PDF route uses the Cache Components-compatible default runtime", async () => {
  const source = await readFile(
    "app/api/requests/[requestId]/pdf/[kind]/route.ts",
    "utf8",
  );

  assert.doesNotMatch(source, /export const runtime/u);
});

function officialPdfSource(overrides = {}) {
  return {
    id: REQUEST_ID,
    requestNumber: 42,
    requestedAt: "2026-08-31T09:30:00.000Z",
    requesterName: "Mario Rossi",
    project: "Progetto Alfa",
    toolLine: "Linea 1",
    utilities: "Aria compressa",
    notes: null,
    status: "evasa",
    lines: [{
      id: "20000000-0000-4000-8000-000000000001",
      fabtekCode: "FAB-001",
      oracleSapioCode: null,
      categoryName: "Categoria",
      familyName: "Famiglia",
      componentName: "Componente",
      description: "Descrizione",
      diameter: null,
      material: "Acciaio",
      connection: "Filettata",
      unitOfMeasure: "pz",
      requestedQuantity: 1,
      fulfilledQuantity: 1,
      fulfillments: [{
        id: "40000000-0000-4000-8000-000000000001",
        quantity: 1,
        fulfilledAt: "2026-08-31T10:30:00.000Z",
        notes: null,
      }],
    }],
    ...overrides,
  };
}

test("on-demand request PDF route authorizes, validates, gates final reports, and returns a private attachment", async () => {
  const route = await import("../app/api/requests/[requestId]/pdf/[kind]/route.ts");
  const activeProfile = {
    id: "30000000-0000-4000-8000-000000000001",
    full_name: "Mario Rossi",
    role: "user",
    is_active: true,
  };
  const request = new Request("http://localhost/api/requests/10000000-0000-4000-8000-000000000001/pdf/initial_request");
  const context = {
    params: Promise.resolve({ requestId: REQUEST_ID, kind: "initial_request" }),
  };
  const invalidUuidContext = {
    params: Promise.resolve({ requestId: "invalid", kind: "initial_request" }),
  };
  const invalidKindContext = {
    params: Promise.resolve({ requestId: REQUEST_ID, kind: "draft" }),
  };
  const earlyFinalContext = {
    params: Promise.resolve({ requestId: REQUEST_ID, kind: "final_report" }),
  };

  for (const [profile, status] of [
    [null, 401],
    [{ ...activeProfile, is_active: false }, 403],
  ]) {
    const handler = route.createRequestPdfHandler({
      getProfile: async () => profile,
      loadSource: async () => officialPdfSource(),
      renderPdf: async () => Buffer.from("%PDF-on-demand"),
      reportFailure: () => {},
    });
    assert.equal((await handler(request, context)).status, status);
  }

  let sourceLoads = 0;
  const handler = route.createRequestPdfHandler({
    getProfile: async () => activeProfile,
    loadSource: async () => {
      sourceLoads += 1;
      return officialPdfSource();
    },
    renderPdf: async () => Buffer.from("%PDF-on-demand"),
    reportFailure: () => {},
  });
  assert.equal((await handler(request, invalidUuidContext)).status, 404);
  assert.equal((await handler(request, invalidKindContext)).status, 404);
  assert.equal(sourceLoads, 0);

  let renderCalls = 0;
  const earlyFinalHandler = route.createRequestPdfHandler({
    getProfile: async () => activeProfile,
    loadSource: async () => officialPdfSource({ status: "evasa_parziale" }),
    renderPdf: async () => {
      renderCalls += 1;
      return Buffer.from("%PDF-on-demand");
    },
    reportFailure: () => {},
  });
  assert.equal((await earlyFinalHandler(request, earlyFinalContext)).status, 409);
  assert.equal(renderCalls, 0);

  const invisibleHandler = route.createRequestPdfHandler({
    getProfile: async () => activeProfile,
    loadSource: async () => null,
    renderPdf: async () => Buffer.from("%PDF-on-demand"),
    reportFailure: () => {},
  });
  assert.equal((await invisibleHandler(request, context)).status, 404);

  const response = await handler(request, context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="fabtek-richiesta-000042.pdf"');
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from("%PDF-on-demand"));
});

function requestDetailView(canGenerateFinalReport) {
  return {
    id: REQUEST_ID,
    requestNumber: 42,
    requestedAt: "2026-08-31T09:30:00.000Z",
    requestedAtLabel: "31/08/2026, 11:30",
    project: "Progetto Alfa",
    toolLine: "Linea 1",
    utilities: "Aria compressa",
    notes: null,
    status: canGenerateFinalReport
      ? { label: "In preparazione", tone: "pending" }
      : { label: "Evasa", tone: "good" },
    canGenerateFinalReport,
    lines: [{
      id: "20000000-0000-4000-8000-000000000001",
      fabtekCode: "FAB-001",
      oracleSapioCode: null,
      categoryName: "Categoria",
      familyName: "Famiglia",
      componentName: "Componente",
      description: "Descrizione",
      diameter: null,
      material: "Acciaio",
      connection: "Filettata",
      unitOfMeasure: "pz",
      requestedQuantity: 1,
      fulfilledQuantity: 0,
      remainingQuantity: 1,
      status: { label: "In preparazione", tone: "pending" },
      fulfillments: [],
    }],
  };
}

test("request detail renders on-demand PDF actions from the explicit final-report capability", () => {
  const { RequestDetail } = loadProjectModule("components/requests/request-detail.tsx", new Map([
    ["@/components/admin/fulfillment-form", { FulfillmentForm: () => null }],
    ["@/components/admin/whole-request-fulfillment-button", {
      WholeRequestFulfillmentButton: () => null,
    }],
    ["@/components/requests/request-status-badge", {
      RequestStatusBadge: ({ status }) => React.createElement("span", null, status.label),
    }],
  ]));

  const preparationHtml = renderToStaticMarkup(React.createElement(RequestDetail, {
    request: requestDetailView(false),
  }));
  const completedHtml = renderToStaticMarkup(React.createElement(RequestDetail, {
    request: requestDetailView(true),
  }));

  assert.match(preparationHtml, /Genera PDF richiesta/u);
  assert.doesNotMatch(preparationHtml, /Genera report finale/u);
  assert.match(preparationHtml, /Il report finale sar\u00e0 disponibile/u);
  assert.match(completedHtml, /Genera PDF richiesta/u);
  assert.match(completedHtml, /Genera report finale/u);
});

function loadRequestPdfButton(kind = "initial_request") {
  const state = [];
  let stateIndex = 0;
  const TestButton = (props) => React.createElement("button", props);
  const { RequestPdfDownloadButton } = loadProjectModule(
    "components/requests/request-pdf-download-button.tsx",
    new Map([
      ["react", {
        ...React,
        useState(initialValue) {
          const index = stateIndex++;
          if (!(index in state)) state[index] = initialValue;
          return [state[index], (value) => {
            state[index] = typeof value === "function" ? value(state[index]) : value;
          }];
        },
      }],
      ["@/components/ui/button", { Button: TestButton }],
    ]),
  );

  function render() {
    stateIndex = 0;
    return RequestPdfDownloadButton({
      requestId: REQUEST_ID,
      kind,
      label: kind === "initial_request"
        ? "Genera PDF richiesta"
        : "Genera report finale",
    });
  }

  function button() {
    return render().props.children[0];
  }

  return { button, render };
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  };
}

test("request PDF download button downloads one PDF while busy and reports failed responses accessibly", async () => {
  let fetchCalls = 0;
  let resolveResponse;
  let revokedObjectUrl = null;
  const blob = new Blob(["%PDF-on-demand"], { type: "application/pdf" });
  const anchors = [];
  const restoredGlobals = [
    replaceGlobal("fetch", async (url) => {
      fetchCalls += 1;
      assert.equal(url, `/api/requests/${REQUEST_ID}/pdf/initial_request`);
      return new Promise((resolve) => { resolveResponse = resolve; });
    }),
    replaceGlobal("URL", {
      createObjectURL(value) {
        assert.equal(value, blob);
        return "blob:request-pdf";
      },
      revokeObjectURL(value) {
        revokedObjectUrl = value;
      },
    }),
    replaceGlobal("document", {
      body: { append(anchor) { anchors.push(anchor); } },
      createElement(tagName) {
        assert.equal(tagName, "a");
        return {
          click() { this.clicked = true; },
          remove() { this.removed = true; },
        };
      },
    }),
  ];

  try {
    const downloadButton = loadRequestPdfButton();
    const firstDownload = downloadButton.button().props.onClick();
    const busyButton = downloadButton.button();

    assert.equal(busyButton.props["aria-busy"], true);
    await busyButton.props.onClick();
    assert.equal(fetchCalls, 1);

    resolveResponse({
      ok: true,
      headers: new Headers({
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="fabtek-richiesta-000042.pdf"',
      }),
      blob: async () => blob,
    });
    await firstDownload;

    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].href, "blob:request-pdf");
    assert.equal(anchors[0].download, "fabtek-richiesta-000042.pdf");
    assert.equal(anchors[0].clicked, true);
    assert.equal(anchors[0].removed, true);
    assert.equal(revokedObjectUrl, "blob:request-pdf");

    replaceGlobal("fetch", async () => ({
      ok: false,
      headers: new Headers(),
      json: async () => ({ error: "Errore interno" }),
    }));
    const failedButton = loadRequestPdfButton();
    await failedButton.button().props.onClick();
    const errorHtml = renderToStaticMarkup(failedButton.render());

    assert.match(errorHtml, /role="alert"/u);
    assert.match(errorHtml, /Non \u00e8 stato possibile generare il PDF/u);
  } finally {
    for (const restore of restoredGlobals.reverse()) restore();
  }
});

test("request PDF download button uses the canonical final-report filename", async () => {
  const blob = new Blob(["%PDF-on-demand"], { type: "application/pdf" });
  const anchors = [];
  const restoredGlobals = [
    replaceGlobal("fetch", async (url) => {
      assert.equal(url, `/api/requests/${REQUEST_ID}/pdf/final_report`);
      return {
        ok: true,
        headers: new Headers({
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="fabtek-report-finale-000042.pdf"',
        }),
        blob: async () => blob,
      };
    }),
    replaceGlobal("URL", {
      createObjectURL: () => "blob:final-report",
      revokeObjectURL: () => {},
    }),
    replaceGlobal("document", {
      body: { append(anchor) { anchors.push(anchor); } },
      createElement() {
        return { click() {}, remove() {} };
      },
    }),
  ];

  try {
    await loadRequestPdfButton("final_report").button().props.onClick();
    assert.equal(anchors[0].download, "fabtek-report-finale-000042.pdf");
  } finally {
    for (const restore of restoredGlobals.reverse()) restore();
  }
});

test("request PDF download button rejects unsafe or non-PDF server filenames", async () => {
  const unsafeFilenames = [
    'attachment; filename="../fabtek-richiesta-000042.pdf"',
    'attachment; filename="fabtek-richiesta-000042.exe"',
    'attachment; filename=".pdf"',
    null,
  ];

  for (const contentDisposition of unsafeFilenames) {
    const anchors = [];
    const headers = new Headers({ "content-type": "application/pdf" });
    if (contentDisposition) headers.set("content-disposition", contentDisposition);
    const restoredGlobals = [
      replaceGlobal("fetch", async () => ({
        ok: true,
        headers,
        blob: async () => new Blob(["%PDF-on-demand"], { type: "application/pdf" }),
      })),
      replaceGlobal("URL", {
        createObjectURL: () => "blob:fallback",
        revokeObjectURL: () => {},
      }),
      replaceGlobal("document", {
        body: { append(anchor) { anchors.push(anchor); } },
        createElement() {
          return { click() {}, remove() {} };
        },
      }),
    ];

    try {
      await loadRequestPdfButton().button().props.onClick();
      assert.equal(anchors[0].download, "fabtek-richiesta.pdf");
    } finally {
      for (const restore of restoredGlobals.reverse()) restore();
    }
  }
});
