import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260902120000_add_atomic_whole_request_fulfillment.sql";

async function migrationSource() {
  try {
    return await readFile(migrationPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

test("whole-request fulfillment is one security-definer database transaction", async () => {
  const sql = await migrationSource();

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/iu);
  assert.match(sql, /function\s+public\.fulfill_whole_request\s*\(/iu);
  assert.match(sql, /security\s+definer\s+set\s+search_path\s*=\s*''/iu);
  assert.match(sql, /public\.has_role\s*\(\s*'admin'\s*\)/iu);
  assert.match(sql, /material_requests[\s\S]*for\s+update/iu);
  assert.match(sql, /material_request_lines[\s\S]*order\s+by[\s\S]*for\s+update/iu);
  assert.match(sql, /inventory[\s\S]*order\s+by[\s\S]*for\s+update/iu);
});

test("whole-request fulfillment is idempotent and delegates every residual line", async () => {
  const sql = await migrationSource();

  assert.match(sql, /request_fulfillment_batches/iu);
  assert.match(sql, /unique\s*\(\s*idempotency_key\s*\)/iu);
  assert.match(sql, /requested_quantity\s*-\s*line\.fulfilled_quantity/iu);
  assert.match(sql, /public\.fulfill_request_line\s*\(/iu);
  assert.match(sql, /revoke\s+all[\s\S]*fulfill_whole_request[\s\S]*from\s+public/iu);
  assert.match(sql, /grant\s+execute[\s\S]*fulfill_whole_request[\s\S]*to\s+authenticated/iu);
});
