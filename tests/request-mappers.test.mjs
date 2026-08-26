import assert from "node:assert/strict";
import test from "node:test";

import {
  attachFulfillmentsToLines,
  formatRequestTimestamp,
  mapRequestDetail,
  mapRequestListRows,
  mapRequestStatus,
  remainingQuantity,
} from "../lib/data/request-mappers.ts";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const LINE_ID = "20000000-0000-4000-8000-000000000001";

function event({
  id,
  quantity,
  fulfilledAt,
  notes = null,
}) {
  return {
    id,
    quantity,
    fulfilled_at: fulfilledAt,
    notes,
  };
}

function requestRow(lineOverrides = {}) {
  return {
    id: REQUEST_ID,
    request_number: 17,
    requested_at: "2026-08-26T14:30:00.000Z",
    project: "P-44",
    tool_line: "TL-2",
    utilities: "Aria compressa",
    notes: "Consegna al reparto nord",
    status: "evasa_parziale",
    lines: [{
      id: LINE_ID,
      snapshot_fabtek_code: "FT-001",
      snapshot_oracle_sapio_code: "OR-900",
      snapshot_category_name: "Gas",
      snapshot_family_name: "Flessibili",
      snapshot_component_name: "Tubo",
      snapshot_description: "Tubo flessibile PTFE",
      snapshot_diameter: "DN10",
      snapshot_material: "PTFE",
      snapshot_connection: "1/2 NPT",
      snapshot_unit_of_measure: "m",
      requested_quantity: 10,
      fulfilled_quantity: 7,
      status: "evasa_parziale",
      created_at: "2026-08-26T14:30:01.000Z",
      fulfillments: [],
      ...lineOverrides,
    }],
  };
}

test("maps every request status to an explicit Italian label", () => {
  assert.deepEqual(mapRequestStatus("in_preparazione"), {
    label: "In preparazione",
    tone: "pending",
  });
  assert.deepEqual(mapRequestStatus("evasa_parziale"), {
    label: "Evasa parzialmente",
    tone: "warning",
  });
  assert.deepEqual(mapRequestStatus("evasa"), {
    label: "Evasa",
    tone: "good",
  });
});

test("formats server timestamps in Italian and the Europe/Rome timezone", () => {
  assert.equal(
    formatRequestTimestamp("2026-08-26T14:30:00.000Z"),
    "26/08/2026, 16:30",
  );
});

test("derives remaining quantity and preserves every fulfillment event", () => {
  const detail = mapRequestDetail(requestRow({
    fulfillments: [
      event({
        id: "40000000-0000-4000-8000-000000000002",
        quantity: 4,
        fulfilledAt: "2026-08-27T09:15:00.000Z",
      }),
      event({
        id: "40000000-0000-4000-8000-000000000001",
        quantity: 3,
        fulfilledAt: "2026-08-26T15:00:00.000Z",
        notes: "Prima consegna",
      }),
    ],
  }));

  assert.ok(detail);
  assert.equal(detail.lines[0].remainingQuantity, 3);
  assert.deepEqual(
    detail.lines[0].fulfillments.map((item) => item.quantity),
    [3, 4],
  );
  assert.equal(detail.lines[0].fulfillments[0].notes, "Prima consegna");
});

test("orders fulfillment events deterministically by timestamp then id", () => {
  const detail = mapRequestDetail(requestRow({
    fulfillments: [
      event({
        id: "40000000-0000-4000-8000-000000000003",
        quantity: 3,
        fulfilledAt: "2026-08-27T09:15:00.000Z",
      }),
      event({
        id: "40000000-0000-4000-8000-000000000001",
        quantity: 2,
        fulfilledAt: "2026-08-27T09:15:00.000Z",
      }),
      event({
        id: "40000000-0000-4000-8000-000000000002",
        quantity: 2,
        fulfilledAt: "2026-08-26T15:00:00.000Z",
      }),
    ],
  }));

  assert.ok(detail);
  assert.deepEqual(
    detail.lines[0].fulfillments.map((item) => item.id),
    [
      "40000000-0000-4000-8000-000000000002",
      "40000000-0000-4000-8000-000000000001",
      "40000000-0000-4000-8000-000000000003",
    ],
  );
});

test("never returns a negative remaining quantity", () => {
  assert.equal(remainingQuantity({
    requestedQuantity: 3,
    fulfilledQuantity: 5,
  }), 0);
});

test("maps list rows with their embedded line count", () => {
  const items = mapRequestListRows([{
    id: REQUEST_ID,
    request_number: 17,
    requested_at: "2026-08-26T14:30:00.000Z",
    project: "P-44",
    status: "in_preparazione",
    lines: [{ count: 2 }],
  }]);

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    id: REQUEST_ID,
    requestNumber: 17,
    requestedAt: "2026-08-26T14:30:00.000Z",
    requestedAtLabel: "26/08/2026, 16:30",
    project: "P-44",
    lineCount: 2,
    status: {
      label: "In preparazione",
      tone: "pending",
    },
  });
});

test("rejects a missing request-lines relation instead of mapping an empty detail", () => {
  const rowWithoutLines = { ...requestRow() };
  delete rowWithoutLines.lines;

  assert.throws(
    () => mapRequestDetail(rowWithoutLines),
    { name: "RequestMappingError" },
  );
});

test("rejects malformed request lines instead of silently discarding them", () => {
  assert.throws(
    () => mapRequestDetail({ ...requestRow(), lines: [{}] }),
    { name: "RequestMappingError" },
  );
});

test("rejects missing or malformed fulfillment relations", () => {
  const rowWithMissingEvents = requestRow();
  delete rowWithMissingEvents.lines[0].fulfillments;

  assert.throws(
    () => mapRequestDetail(rowWithMissingEvents),
    { name: "RequestMappingError" },
  );
  assert.throws(
    () => mapRequestDetail(requestRow({ fulfillments: [{}] })),
    { name: "RequestMappingError" },
  );
});

test("rejects malformed list rows and missing embedded counts", () => {
  assert.throws(
    () => mapRequestListRows([{ id: REQUEST_ID }]),
    { name: "RequestMappingError" },
  );
  assert.throws(
    () => mapRequestListRows([{
      id: REQUEST_ID,
      request_number: 17,
      requested_at: "2026-08-26T14:30:00.000Z",
      project: "P-44",
      status: "in_preparazione",
    }]),
    { name: "RequestMappingError" },
  );
});

test("associates every separately loaded fulfillment with its request line", () => {
  const line = { ...requestRow().lines[0] };
  delete line.fulfillments;
  const lines = attachFulfillmentsToLines([line], [
    {
      ...event({
        id: "40000000-0000-4000-8000-000000000001",
        quantity: 3,
        fulfilledAt: "2026-08-26T15:00:00.000Z",
      }),
      request_line_id: LINE_ID,
    },
    {
      ...event({
        id: "40000000-0000-4000-8000-000000000002",
        quantity: 4,
        fulfilledAt: "2026-08-27T09:15:00.000Z",
      }),
      request_line_id: LINE_ID,
    },
  ]);

  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].fulfillments.map((item) => item.quantity), [3, 4]);
});

test("rejects missing, malformed, or orphaned separately loaded relations", () => {
  const line = { ...requestRow().lines[0] };
  delete line.fulfillments;

  assert.throws(
    () => attachFulfillmentsToLines(undefined, []),
    { name: "RequestMappingError" },
  );
  assert.throws(
    () => attachFulfillmentsToLines([{}], []),
    { name: "RequestMappingError" },
  );
  assert.throws(
    () => attachFulfillmentsToLines([line], [{}]),
    { name: "RequestMappingError" },
  );
  assert.throws(
    () => attachFulfillmentsToLines([line], [{
      ...event({
        id: "40000000-0000-4000-8000-000000000003",
        quantity: 1,
        fulfilledAt: "2026-08-27T10:00:00.000Z",
      }),
      request_line_id: "20000000-0000-4000-8000-000000000099",
    }]),
    { name: "RequestMappingError" },
  );
});
