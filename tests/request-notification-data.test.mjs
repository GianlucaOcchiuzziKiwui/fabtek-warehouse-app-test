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
    return nextResolve(specifier, context);
  },
});

const { loadAuthorizedFulfillmentNotification } = await import(
  "../lib/data/request-notifications.ts"
);

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_LINE_ID = "20000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "30000000-0000-4000-8000-000000000001";

function sessionClient(row) {
  const calls = [];
  const builder = {
    select(columns) {
      calls.push(["select", columns]);
      return builder;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return builder;
    },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return { data: row, error: null };
    },
  };
  return {
    calls,
    client: {
      from(table) {
        calls.push(["from", table]);
        return builder;
      },
    },
  };
}

function notificationRow(overrides = {}) {
  return {
    quantity: 4,
    notes: " Consegna reparto nord ",
    request_line: {
      id: REQUEST_LINE_ID,
      request_id: REQUEST_ID,
      request: {
        id: REQUEST_ID,
        requester_email: "Mario@Example.com",
      },
    },
    ...overrides,
  };
}

test("fulfillment notification reads the persisted event and requester email through RLS", async () => {
  const session = sessionClient(notificationRow());

  const result = await loadAuthorizedFulfillmentNotification({
    requestId: REQUEST_ID,
    requestLineId: REQUEST_LINE_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
  }, {
    createClient: async () => session.client,
  });

  assert.deepEqual(result, {
    requesterEmail: "mario@example.com",
    deliveredQuantity: 4,
    notes: "Consegna reparto nord",
  });
  assert.deepEqual(session.calls.slice(-3), [
    ["eq", "idempotency_key", IDEMPOTENCY_KEY],
    ["eq", "request_line_id", REQUEST_LINE_ID],
    ["maybeSingle"],
  ]);
});

test("fulfillment notification rejects an event associated with another request", async () => {
  const session = sessionClient(notificationRow({
    request_line: {
      id: REQUEST_LINE_ID,
      request_id: "10000000-0000-4000-8000-000000000099",
      request: {
        id: "10000000-0000-4000-8000-000000000099",
        requester_email: "mario@example.com",
      },
    },
  }));

  await assert.rejects(
    loadAuthorizedFulfillmentNotification({
      requestId: REQUEST_ID,
      requestLineId: REQUEST_LINE_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    }, {
      createClient: async () => session.client,
    }),
    /dati della notifica non sono disponibili/iu,
  );
});
