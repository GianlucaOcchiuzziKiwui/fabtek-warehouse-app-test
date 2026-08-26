import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("draft quantity errors are programmatically associated with their input", async () => {
  const source = await readFile("components/requests/draft-print-view.tsx", "utf8");

  assert.match(source, /aria-describedby=\{!validation\.result\.ok \? errorId : undefined\}/u);
  assert.match(source, /<p id=\{errorId\}/u);
});

test("catalog-picker quantity errors are programmatically associated with their input", async () => {
  const source = await readFile("components/requests/add-to-request-button.tsx", "utf8");

  assert.match(source, /aria-describedby=\{showQuantityError \? quantityErrorId : undefined\}/u);
  assert.match(source, /<p id=\{quantityErrorId\}/u);
});
