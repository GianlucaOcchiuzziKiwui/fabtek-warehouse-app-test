import assert from "node:assert/strict";
import test from "node:test";

import { fulfillRequestLine } from "../lib/domain/fulfillment/fulfill-request-line.ts";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_LINE_ID = "20000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "30000000-0000-4000-8000-000000000001";

function validFulfillment(overrides = {}) {
  return {
    requestLineId: REQUEST_LINE_ID,
    quantity: 4,
    idempotencyKey: IDEMPOTENCY_KEY,
    notes: " Consegna reparto nord ",
    ...overrides,
  };
}

function fulfilledRow(overrides = {}) {
  return {
    request_id: REQUEST_ID,
    request_line_id: REQUEST_LINE_ID,
    fulfilled_quantity: 4,
    remaining_quantity: 6,
    line_status: "evasa_parziale",
    request_status: "evasa_parziale",
    ...overrides,
  };
}

test("calls only the fulfillment RPC with the caller's stable idempotency key", async () => {
  const calls = [];
  const result = await fulfillRequestLine(validFulfillment(), {
    callRpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [fulfilledRow()], error: null };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      requestId: REQUEST_ID,
      requestLineId: REQUEST_LINE_ID,
      fulfilledQuantity: 4,
      remainingQuantity: 6,
      lineStatus: "evasa_parziale",
      requestStatus: "evasa_parziale",
    },
  });
  assert.deepEqual(calls, [{
    name: "fulfill_request_line",
    args: {
      p_request_line_id: REQUEST_LINE_ID,
      p_quantity: 4,
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_notes: "Consegna reparto nord",
    },
  }]);
});

test("rejects zero quantity before calling the RPC", async () => {
  let callCount = 0;
  const result = await fulfillRequestLine(validFulfillment({ quantity: 0 }), {
    callRpc: async () => {
      callCount += 1;
      return { data: [fulfilledRow()], error: null };
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INVALID_FULFILLMENT",
      message: "Controlla i dati inseriti.",
    },
  });
  assert.equal(callCount, 0);
});

test("maps an RPC quantity-over-remaining error to a stable fulfillment error", async () => {
  const result = await fulfillRequestLine(validFulfillment(), {
    callRpc: async () => ({
      data: null,
      error: { code: "22023", message: "QUANTITY_EXCEEDS_REMAINING" },
    }),
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "FULFILLMENT_EXCEEDS_REMAINING",
      message: "La quantit\u00e0 supera il residuo disponibile.",
    },
  });
});

test("maps denied RPC access without exposing database details", async () => {
  const result = await fulfillRequestLine(validFulfillment(), {
    callRpc: async () => ({
      data: null,
      error: { code: "42501", message: "internal role details" },
    }),
  });

  assert.deepEqual(result, {
    ok: false,
    error: { code: "FORBIDDEN", message: "Operazione non consentita." },
  });
});

test("rejects an empty RPC response", async () => {
  const result = await fulfillRequestLine(validFulfillment(), {
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
