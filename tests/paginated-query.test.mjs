import assert from "node:assert/strict";
import test from "node:test";

import {
  clampPaginationPage,
  collectPaginatedRows,
  PaginatedQueryError,
} from "../lib/data/paginated-query.ts";

test("collects every row when a relation exceeds the PostgREST max_rows limit", async () => {
  const source = Array.from({ length: 1_001 }, (_, index) => ({ id: index + 1 }));
  const ranges = [];

  const rows = await collectPaginatedRows(async (from, to) => {
    ranges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });

  assert.equal(rows.length, 1_001);
  assert.equal(rows[1_000].id, 1_001);
  assert.deepEqual(ranges, [[0, 999], [1_000, 1_999]]);
});

test("rejects a non-array page instead of treating it as an empty relation", async () => {
  await assert.rejects(
    collectPaginatedRows(async () => ({ data: null, error: null })),
    PaginatedQueryError,
  );
});

test("surfaces relation query failures", async () => {
  const databaseError = { code: "XX000" };

  await assert.rejects(
    collectPaginatedRows(async () => ({ data: null, error: databaseError })),
    (error) => error instanceof PaginatedQueryError && error.cause === databaseError,
  );
});

test("clamps an out-of-range page to the last available page", () => {
  assert.equal(clampPaginationPage(99, 21, 20), 2);
  assert.equal(clampPaginationPage(2, 0, 20), 1);
  assert.equal(clampPaginationPage(1, 21, 20), 1);
});
