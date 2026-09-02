import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260829100000_add_admin_catalog_variant_rpc.sql";
const iconMigrationPath =
  "supabase/migrations/20260830120000_expand_catalog_icon_keys.sql";
const datasheetMigrationPath =
  "supabase/migrations/20260902130000_add_variant_datasheet_url.sql";

async function readMigration() {
  try {
    return await readFile(migrationPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

test("variant ordering is persisted with a deterministic component index", async () => {
  const source = await readMigration();

  assert.match(
    source,
    /alter\s+table\s+public\.item_variants[\s\S]*?add\s+column\s+sort_order\s+integer\s+not\s+null\s+default\s+0/iu,
  );
  assert.match(
    source,
    /create\s+index\s+\w+\s+on\s+public\.item_variants\s*\(\s*component_id\s*,\s*sort_order\s*,\s*fabtek_code\s*\)/iu,
  );
});

test("variant persistence keeps the item-derived taxonomy and an internal admin boundary", async () => {
  const source = await readMigration();

  assert.doesNotMatch(source, /category_families/iu);
  assert.match(
    source,
    /create\s+(?:or\s+replace\s+)?function\s+public\.save_catalog_variant\s*\([\s\S]*?\)\s*returns\s+uuid/iu,
  );
  assert.match(source, /security\s+definer\s+set\s+search_path\s*=\s*''/iu);
  assert.match(source, /auth\.uid\s*\(\s*\)/u);
  assert.match(source, /public\.is_active_user\s*\(\s*\)/u);
  assert.match(source, /public\.has_role\s*\(\s*'admin'\s*\)/u);
  assert.match(source, /errcode\s*=\s*'42501'/u);
});

test("variant persistence rejects empty, null, and duplicate category selections", async () => {
  const source = await readMigration();

  assert.match(source, /p_category_ids\s+is\s+null/iu);
  assert.match(source, /cardinality\s*\(\s*p_category_ids\s*\)\s*=\s*0/iu);
  assert.match(source, /array_position\s*\(\s*p_category_ids\s*,\s*null\s*\)/iu);
  assert.match(
    source,
    /cardinality\s*\(\s*p_category_ids\s*\)[\s\S]*?count\s*\(\s*distinct\s+category_id\s*\)/iu,
  );
});

test("variant persistence writes one variant branch and replaces category associations", async () => {
  const source = await readMigration();

  assert.equal(
    source.match(/insert\s+into\s+public\.item_variants/giu)?.length,
    1,
  );
  assert.equal(
    source.match(/update\s+public\.item_variants/giu)?.length,
    1,
  );
  assert.equal(
    source.match(/delete\s+from\s+public\.item_variant_categories/giu)?.length,
    1,
  );
  assert.equal(
    source.match(/insert\s+into\s+public\.item_variant_categories/giu)?.length,
    1,
  );
  assert.match(source, /where\s+iv\.id\s*=\s*p_id[\s\S]*?for\s+update/iu);
  assert.match(source, /nullif\s*\(\s*btrim\s*\(\s*p_oracle_sapio_code/iu);
  assert.match(source, /unnest\s*\(\s*p_category_ids\s*\)/iu);
});

test("variant RPC execution is explicitly limited to authenticated sessions", async () => {
  const source = await readMigration();

  assert.match(
    source,
    /revoke\s+all\s+on\s+function\s+public\.save_catalog_variant\s*\([\s\S]*?\)\s+from\s+public\s*;/iu,
  );
  assert.match(
    source,
    /revoke\s+all\s+on\s+function\s+public\.save_catalog_variant\s*\([\s\S]*?\)\s+from\s+anon\s*;/iu,
  );
  assert.match(
    source,
    /revoke\s+all\s+on\s+function\s+public\.save_catalog_variant\s*\([\s\S]*?\)\s+from\s+authenticated\s*;/iu,
  );
  assert.match(
    source,
    /grant\s+execute\s+on\s+function\s+public\.save_catalog_variant\s*\([\s\S]*?\)\s+to\s+authenticated\s*;/iu,
  );
});

test("expanded technical icons replace every persisted icon whitelist atomically", async () => {
  let source = "";
  try {
    source = await readFile(iconMigrationPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (const constraint of [
    "categories_icon_key_check",
    "families_icon_key_check",
    "components_icon_key_check",
  ]) {
    assert.match(source, new RegExp(`drop\\s+constraint\\s+${constraint}`, "iu"));
    assert.match(source, new RegExp(`add\\s+constraint\\s+${constraint}`, "iu"));
  }
  for (const iconKey of [
    "bolt",
    "circuit-board",
    "cog",
    "fan",
    "filter",
    "pipette",
    "shield-check",
    "thermometer",
  ]) {
    assert.match(source, new RegExp(`'${iconKey}'`, "u"));
  }
  assert.match(source, /^begin;[\s\S]*commit;\s*$/iu);
});

test("variant datasheet URLs are persisted and constrained to HTTP or HTTPS", async () => {
  let source = "";
  try {
    source = await readFile(datasheetMigrationPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  assert.match(source, /add\s+column\s+datasheet_url\s+text/iu);
  assert.match(source, /datasheet_url[\s\S]*?https\?/iu);
  assert.match(source, /p_datasheet_url\s+text/iu);
  assert.match(source, /nullif\s*\(\s*btrim\s*\(\s*p_datasheet_url/iu);
});
