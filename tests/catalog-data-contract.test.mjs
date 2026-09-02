import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const filterOptionsMigrationPath =
  "supabase/migrations/20260902140000_add_catalog_filter_options_rpc.sql";

test("catalog navigation delegates taxonomy calculation to Supabase", async () => {
  const source = await readFile("lib/data/catalog.ts", "utf8");

  let migration = "";
  try {
    migration = await readFile(filterOptionsMigrationPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  assert.doesNotMatch(source, /from\(["']category_families["']\)/u);
  assert.doesNotMatch(source, /const\s+DERIVED_TAXONOMY_SELECT/u);
  assert.match(source, /\.rpc\(["']get_catalog_filter_options["']/u);
  assert.match(
    migration,
    /create\s+(?:or\s+replace\s+)?function\s+public\.get_catalog_filter_options\s*\(/iu,
  );
  assert.match(migration, /select\s+distinct/iu);
  assert.match(migration, /from\s+public\.item_variant_categories/iu);
  assert.match(migration, /grant\s+execute[\s\S]*to\s+authenticated/iu);
});
