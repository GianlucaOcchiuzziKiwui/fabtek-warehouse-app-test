import assert from "node:assert/strict";
import test from "node:test";

import { submitMaterialRequest } from "../lib/domain/requests/submit-request.ts";

const REQUEST_ID = "40000000-0000-4000-8000-000000000001";
const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";

function validInput(overrides = {}) {
  return {
    clientRequestId: "10000000-0000-4000-8000-000000000001",
    project: " Progetto 21 ",
    toolLine: " Linea A ",
    utilities: " Aria compressa ",
    notes: " Consegna urgente ",
    lines: [{
      itemVariantId: VARIANT_ID,
      categoryId: CATEGORY_ID,
      quantity: 2,
    }],
    ...overrides,
  };
}

test("passes only validated identifiers and header fields to the RPC", async () => {
  const calls = [];

  const result = await submitMaterialRequest(validInput({ ignored: "never sent" }), {
    callRpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [{ request_id: REQUEST_ID, request_number: 17 }], error: null };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    data: { requestId: REQUEST_ID, requestNumber: 17 },
  });
  assert.deepEqual(calls, [{
    name: "submit_material_request",
    args: {
      p_client_request_id: "10000000-0000-4000-8000-000000000001",
      p_project: "Progetto 21",
      p_tool_line: "Linea A",
      p_utilities: "Aria compressa",
      p_notes: "Consegna urgente",
      p_lines: [{
        item_variant_id: VARIANT_ID,
        category_id: CATEGORY_ID,
        quantity: 2,
      }],
    },
  }]);
});

test("maps RPC errors without exposing database details", async () => {
  const result = await submitMaterialRequest(validInput(), {
    callRpc: async () => ({
      data: null,
      error: { code: "P0001", message: "internal stock table details" },
    }),
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INSUFFICIENT_STOCK",
      message: "La disponibilit\u00e0 di uno o pi\u00f9 articoli \u00e8 cambiata.",
    },
  });
});

test("returns a generic error for an empty RPC response", async () => {
  const result = await submitMaterialRequest(validInput(), {
    callRpc: async () => ({ data: [], error: null }),
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "UNEXPECTED_ERROR",
      message: "Si \u00e8 verificato un errore imprevisto.",
    },
  });
});

test("rejects malformed input before it reaches the RPC", async () => {
  let callCount = 0;

  const result = await submitMaterialRequest(validInput({ lines: [] }), {
    callRpc: async () => {
      callCount += 1;
      return { data: [], error: null };
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "EMPTY_REQUEST",
      message: "Controlla i dati inseriti.",
    },
  });
  assert.equal(callCount, 0);
});
