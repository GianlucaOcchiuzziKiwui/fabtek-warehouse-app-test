import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home profile lookup is streamed behind Suspense", async () => {
  const source = await readFile("app/(app)/page.tsx", "utf8");

  assert.match(source, /async function HomeActionsForCurrentProfile\(\)/u);
  assert.match(source, /<Suspense\s+fallback=/u);
  assert.match(source, /<HomeActionsForCurrentProfile \/>/u);
});
