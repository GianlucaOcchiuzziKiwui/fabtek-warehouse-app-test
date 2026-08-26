import assert from "node:assert/strict";
import test from "node:test";

import {
  readConsistentRequestDetail,
  RequestHistoryConsistencyError,
} from "../lib/data/request-consistency.ts";

function fulfillment(id, quantity) {
  return {
    id,
    quantity,
    fulfilledAt: "2026-08-26T15:00:00.000Z",
    fulfilledAtLabel: "26/08/2026, 17:00",
    notes: null,
  };
}

function requestDetail({
  fulfilledQuantity = 7,
  fulfillmentQuantities = [3, 4],
  lineTone = "warning",
  requestTone = "warning",
} = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    requestNumber: 17,
    requestedAt: "2026-08-26T14:30:00.000Z",
    requestedAtLabel: "26/08/2026, 16:30",
    project: "P-44",
    toolLine: "TL-2",
    utilities: "Aria compressa",
    notes: null,
    status: { label: "Stato richiesta", tone: requestTone },
    lines: [{
      id: "20000000-0000-4000-8000-000000000001",
      fabtekCode: "FT-001",
      oracleSapioCode: null,
      categoryName: "Gas",
      familyName: "Flessibili",
      componentName: "Tubo",
      description: "Tubo flessibile PTFE",
      diameter: "DN10",
      material: "PTFE",
      connection: "1/2 NPT",
      unitOfMeasure: "m",
      requestedQuantity: 10,
      fulfilledQuantity,
      remainingQuantity: Math.max(0, 10 - fulfilledQuantity),
      status: { label: "Stato riga", tone: lineTone },
      fulfillments: fulfillmentQuantities.map((quantity, index) => (
        fulfillment(`40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, quantity)
      )),
    }],
  };
}

test("retries the complete read when the first result is torn", async () => {
  const attempts = [
    requestDetail({ fulfillmentQuantities: [3] }),
    requestDetail(),
  ];
  let calls = 0;

  const result = await readConsistentRequestDetail(async () => attempts[calls++]);

  assert.equal(calls, 2);
  assert.deepEqual(result, attempts[1]);
});

test("fails after a bounded number of persistently torn reads", async () => {
  let calls = 0;

  await assert.rejects(
    readConsistentRequestDetail(async () => {
      calls += 1;
      return requestDetail({ fulfillmentQuantities: [3] });
    }),
    RequestHistoryConsistencyError,
  );

  assert.equal(calls, 3);
});

test("rejects incoherent line quantities and statuses", async () => {
  await assert.rejects(
    readConsistentRequestDetail(async () => requestDetail({
      fulfilledQuantity: 11,
      fulfillmentQuantities: [11],
      lineTone: "good",
      requestTone: "good",
    }), 1),
    RequestHistoryConsistencyError,
  );
  await assert.rejects(
    readConsistentRequestDetail(async () => requestDetail({ lineTone: "pending" }), 1),
    RequestHistoryConsistencyError,
  );
});

test("rejects a request status inconsistent with its lines", async () => {
  await assert.rejects(
    readConsistentRequestDetail(async () => requestDetail({ requestTone: "pending" }), 1),
    RequestHistoryConsistencyError,
  );
});

test("preserves an absent or RLS-invisible request without retrying", async () => {
  let calls = 0;

  const result = await readConsistentRequestDetail(async () => {
    calls += 1;
    return null;
  });

  assert.equal(result, null);
  assert.equal(calls, 1);
});

test("does not retry infrastructure or mapping failures", async () => {
  const queryError = new Error("database unavailable");
  let calls = 0;

  await assert.rejects(
    readConsistentRequestDetail(async () => {
      calls += 1;
      throw queryError;
    }),
    (error) => error === queryError,
  );

  assert.equal(calls, 1);
});
