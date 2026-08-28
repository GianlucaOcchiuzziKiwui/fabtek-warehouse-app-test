import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("draft document route is authenticated, server-rendered, and non-cacheable", async () => {
  const source = await readFile("app/api/documents/draft/route.ts", "utf8");

  assert.doesNotMatch(source, /export const runtime/u);
  assert.match(source, /getCurrentProfile/u);
  assert.match(source, /can\(profile, "requests:create"\)/u);
  assert.match(source, /Content-Disposition/u);
  assert.match(source, /Cache-Control/u);
  assert.doesNotMatch(source, /window\.print/u);
});
