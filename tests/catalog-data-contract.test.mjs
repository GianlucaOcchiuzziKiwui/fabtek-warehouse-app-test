import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catalog navigation derives taxonomy from item category associations", async () => {
  const source = await readFile("lib/data/catalog.ts", "utf8");

  assert.doesNotMatch(source, /from\(["']category_families["']\)/u);
  assert.match(source, /from\(["']item_variant_categories["']\)/u);
  assert.match(source, /item_variant:item_variants!inner/u);
  assert.match(source, /component:components!inner/u);
  assert.match(source, /family:families!inner/u);
});
