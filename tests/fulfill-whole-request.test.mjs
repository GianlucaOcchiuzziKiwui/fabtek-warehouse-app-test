import assert from "node:assert/strict";
import test from "node:test";

import { fulfillWholeRequest } from "../lib/domain/fulfillment/fulfill-whole-request.ts";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "30000000-0000-4000-8000-000000000001";

test("fulfills every remaining line through one atomic RPC", async () => {
  const calls = [];
  const result = await fulfillWholeRequest({
    requestId: REQUEST_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
  }, {
    async callRpc(name, args) {
      calls.push({ name, args });
      return {
        data: [{
          request_id: REQUEST_ID,
          fulfilled_line_count: 3,
          request_status: "evasa",
        }],
        error: null,
      };
    },
  });

  assert.deepEqual(calls, [{
    name: "fulfill_whole_request",
    args: {
      p_request_id: REQUEST_ID,
      p_idempotency_key: IDEMPOTENCY_KEY,
    },
  }]);
  assert.deepEqual(result, {
    ok: true,
    data: {
      requestId: REQUEST_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fulfilledLineCount: 3,
      requestStatus: "evasa",
    },
  });
});

test("rejects malformed bulk fulfillment input before calling the database", async () => {
  let called = false;
  const result = await fulfillWholeRequest({
    requestId: "invalid",
    idempotencyKey: IDEMPOTENCY_KEY,
  }, {
    async callRpc() {
      called = true;
      return { data: [], error: null };
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "I dati dell'evasione completa non sono validi.",
    },
  });
});

test("maps an already completed request to a stable action error", async () => {
  const result = await fulfillWholeRequest({
    requestId: REQUEST_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
  }, {
    async callRpc() {
      return {
        data: null,
        error: { code: "22023", message: "REQUEST_ALREADY_FULFILLED" },
      };
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "REQUEST_ALREADY_FULFILLED",
      message: "La richiesta risulta già completamente evasa.",
    },
  });
});

test("reports an inventory conflict without claiming that input was invalid", async () => {
  const result = await fulfillWholeRequest({
    requestId: REQUEST_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
  }, {
    async callRpc() {
      return {
        data: null,
        error: { code: "23514", message: "INVENTORY_INVARIANT_VIOLATION" },
      };
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INSUFFICIENT_STOCK",
      message: "La disponibilità di uno o più articoli è cambiata. Nessuna riga è stata evasa.",
    },
  });
});
