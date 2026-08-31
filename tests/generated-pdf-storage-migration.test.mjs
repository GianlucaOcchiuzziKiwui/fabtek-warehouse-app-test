import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260831120000_remove_generated_pdf_storage.sql";

test("generated PDF cleanup migration drops only the legacy read policy", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim().replace(/\s+/gu, " "))
    .filter(Boolean);

  assert.deepEqual(statements, [
    "drop policy if exists storage_generated_documents_select_owner_or_admin on storage.objects",
  ]);

  assert.doesNotMatch(sql, /\bdelete\s+from\s+storage\.(?:objects|buckets)\b/iu);
  assert.doesNotMatch(sql, /\bdrop\s+(?:table|function)\b/iu);
  assert.doesNotMatch(sql, /\btruncate\b/iu);
  assert.doesNotMatch(sql, /\bgenerated_documents\b/iu);
  assert.doesNotMatch(sql, /\bnotification_jobs\b/iu);
  assert.doesNotMatch(sql, /\bsubmit_material_request\b/iu);
  assert.doesNotMatch(sql, /\bfulfill_request_line\b/iu);
});
