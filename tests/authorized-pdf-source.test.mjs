import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        format: "module",
        url: "data:text/javascript,export%20{}",
      };
    }
    if (/supabase[\\/]admin(?:\.ts)?$/u.test(specifier)) {
      throw new Error("authorized PDF reads must not import the Admin client");
    }
    return nextResolve(specifier, context);
  },
});

const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  DocumentDataError,
  loadAuthorizedOfficialPdfSource,
} = await import("../lib/data/documents.ts");

test.after(() => {
  if (previousServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
  }
});

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const LINE_ID = "20000000-0000-4000-8000-000000000001";

function uuid(prefix, index) {
  return `${prefix}0000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function requestRow(overrides = {}) {
  return {
    id: REQUEST_ID,
    request_number: 42,
    requested_at: "2026-08-31T09:30:00.000Z",
    requester: { full_name: "Mario Rossi" },
    project: "Progetto Alfa",
    tool_line: "Linea 1",
    utilities: "Aria compressa",
    notes: null,
    status: "evasa",
    ...overrides,
  };
}

function lineRow(index = 1, overrides = {}) {
  return {
    id: index === 1 ? LINE_ID : uuid("2", index),
    snapshot_fabtek_code: `FAB-${index.toString().padStart(4, "0")}`,
    snapshot_oracle_sapio_code: null,
    snapshot_category_name: "Categoria",
    snapshot_family_name: "Famiglia",
    snapshot_component_name: "Componente",
    snapshot_description: `Descrizione ${index}`,
    snapshot_diameter: null,
    snapshot_material: "Acciaio",
    snapshot_connection: "Filettata",
    snapshot_unit_of_measure: "pz",
    requested_quantity: 1,
    fulfilled_quantity: 1,
    created_at: `2026-08-31T09:${index.toString().padStart(2, "0")}:00.000Z`,
    ...overrides,
  };
}

function fulfillmentRow(index, overrides = {}) {
  return {
    id: uuid("4", index),
    request_line_id: LINE_ID,
    quantity: 1,
    fulfilled_at: new Date(Date.UTC(2026, 7, 31, 10, 0, index)).toISOString(),
    notes: null,
    request_line: {},
    ...overrides,
  };
}

function sessionClient({ request = requestRow(), lines = [lineRow()], fulfillments = [] } = {}) {
  const calls = [];
  let storageReads = 0;

  function query(table) {
    const state = { table, orders: [] };
    const builder = {
      select(columns) {
        calls.push([table, "select", columns]);
        return builder;
      },
      eq(column, value) {
        calls.push([table, "eq", column, value]);
        return builder;
      },
      order(column, options) {
        state.orders.push([column, options]);
        calls.push([table, "order", column, options]);
        return builder;
      },
      async maybeSingle() {
        calls.push([table, "maybeSingle"]);
        return { data: request, error: null };
      },
      async range(from, to) {
        calls.push([table, "range", from, to]);
        const rows = table === "material_request_lines" ? lines : fulfillments;
        return { data: rows.slice(from, to + 1), error: null };
      },
    };
    return builder;
  }

  const client = {
    from(table) {
      assert.ok([
        "material_requests",
        "material_request_lines",
        "fulfillment_events",
      ].includes(table), `unexpected table ${table}`);
      calls.push([table, "from"]);
      return query(table);
    },
  };
  Object.defineProperty(client, "storage", {
    get() {
      storageReads += 1;
      throw new Error("authorized PDF reads must not access Storage");
    },
  });

  return {
    calls,
    client,
    get storageReads() { return storageReads; },
  };
}

test("authorized PDF source returns null for an RLS-invisible request", async () => {
  const session = sessionClient({ request: null });
  let clientCreations = 0;

  const result = await loadAuthorizedOfficialPdfSource(
    REQUEST_ID,
    "initial_request",
    { createClient: async () => {
      clientCreations += 1;
      return session.client;
    } },
  );

  assert.equal(result, null);
  assert.equal(clientCreations, 1);
  assert.deepEqual(
    session.calls.filter(([, operation]) => operation === "from").map(([table]) => table),
    ["material_requests"],
  );
  assert.equal(session.storageReads, 0);
});

test("authorized initial request loads every line page without fulfillment or Storage access", async () => {
  const lines = Array.from({ length: 1_001 }, (_, index) => lineRow(index + 1));
  const session = sessionClient({ lines });

  const result = await loadAuthorizedOfficialPdfSource(
    REQUEST_ID,
    "initial_request",
    { createClient: async () => session.client },
  );

  assert.equal(result.lines.length, 1_001);
  assert.equal(result.lines[0].id, LINE_ID);
  assert.equal(result.lines.at(-1).id, uuid("2", 1_001));
  assert.deepEqual(
    session.calls.filter(([table, operation]) => table === "material_request_lines" && operation === "range"),
    [
      ["material_request_lines", "range", 0, 999],
      ["material_request_lines", "range", 1_000, 1_999],
    ],
  );
  assert.equal(session.calls.some(([table]) => table === "fulfillment_events"), false);
  assert.equal(session.storageReads, 0);
});

test("authorized final report paginates fulfillments with deterministic query and result order", async () => {
  const fulfillments = Array.from(
    { length: 1_001 },
    (_, index) => fulfillmentRow(index + 1),
  );
  const session = sessionClient({
    lines: [lineRow(1, { requested_quantity: 1_001, fulfilled_quantity: 1_001 })],
    fulfillments,
  });

  const result = await loadAuthorizedOfficialPdfSource(
    REQUEST_ID,
    "final_report",
    { createClient: async () => session.client },
  );

  assert.equal(result.lines[0].fulfillments.length, 1_001);
  assert.equal(result.lines[0].fulfillments[0].id, uuid("4", 1));
  assert.equal(result.lines[0].fulfillments.at(-1).id, uuid("4", 1_001));
  assert.deepEqual(
    session.calls.filter(([table, operation]) => table === "fulfillment_events" && ["order", "range"].includes(operation)),
    [
      ["fulfillment_events", "order", "fulfilled_at", { ascending: true }],
      ["fulfillment_events", "order", "id", { ascending: true }],
      ["fulfillment_events", "range", 0, 999],
      ["fulfillment_events", "order", "fulfilled_at", { ascending: true }],
      ["fulfillment_events", "order", "id", { ascending: true }],
      ["fulfillment_events", "range", 1_000, 1_999],
    ],
  );
  assert.equal(session.storageReads, 0);
});

test("authorized PDF source rejects malformed persisted data", async () => {
  const session = sessionClient({ request: requestRow({ request_number: "42" }) });

  await assert.rejects(
    loadAuthorizedOfficialPdfSource(
      REQUEST_ID,
      "initial_request",
      { createClient: async () => session.client },
    ),
    (error) => {
      assert.equal(error instanceof DocumentDataError, true);
      assert.equal(error.code, "INVALID_OFFICIAL_SOURCE_RESPONSE");
      return true;
    },
  );
  assert.equal(session.storageReads, 0);
});
