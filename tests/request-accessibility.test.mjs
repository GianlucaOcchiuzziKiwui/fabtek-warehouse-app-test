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
  assert.match(source, /<p\s+[^>]*\bid=\{quantityErrorId\}/u);
});

test("request retries expose the locked original payload and retry guidance", async () => {
  const source = await readFile("components/requests/submit-request-button.tsx", "utf8");

  assert.match(source, /role="alert"/u);
  assert.match(source, /Ritenta stessa richiesta/u);
  assert.match(source, /stessi dati del primo tentativo/u);
  assert.match(source, /href="\/richieste"/u);
  assert.match(source, /aria-describedby=\{blockedRecoveryWarningId\}/u);
  assert.match(source, /Ho verificato lo storico/u);
  assert.match(source, /potrebbe creare una nuova richiesta/u);
});

test("request text inputs do not use UTF-16 maxLength limits", async () => {
  for (const file of [
    "components/requests/request-header-form.tsx",
    "components/admin/fulfillment-form.tsx",
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /maxLength=/u, `${file} uses UTF-16 maxLength`);
  }
});
