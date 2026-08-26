import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catalog availability is bounded to the variants returned by each query", async () => {
  const source = await readFile("lib/data/catalog.ts", "utf8");

  assert.equal(
    source.match(/\.in\("item_variant_id", variantIds\)/gu)?.length,
    2,
  );
});
