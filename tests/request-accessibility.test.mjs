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
  const errorParagraphPattern = /<p(?=[\s>])[^>]*\sid=\{quantityErrorId\}/u;

  assert.match(source, /aria-describedby=\{showQuantityError \? quantityErrorId : undefined\}/u);
  assert.doesNotMatch("<p data-id={quantityErrorId}>", errorParagraphPattern);
  assert.match(source, errorParagraphPattern);
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

test("admin request detail exposes complete fulfillment controls with pending feedback", async () => {
  const [detailSource, bulkSource, lineSource] = await Promise.all([
    readFile("components/requests/request-detail.tsx", "utf8"),
    readFile("components/admin/whole-request-fulfillment-button.tsx", "utf8"),
    readFile("components/admin/fulfillment-form.tsx", "utf8"),
  ]);

  assert.match(detailSource, /WholeRequestFulfillmentButton/u);
  assert.match(bulkSource, /Evadi tutto/u);
  assert.match(bulkSource, /window\.confirm/u);
  assert.match(bulkSource, /role=\{feedback\.kind === "error" \? "alert" : "status"\}/u);
  assert.match(lineSource, /Evadi 100%/u);
  assert.match(lineSource, /value="all"/u);
  assert.match(lineSource, /formNoValidate/u);
});

test("admin request list exposes whole-request fulfillment beside detail actions", async () => {
  const [source, buttonSource] = await Promise.all([
    readFile("app/(app)/admin/richieste/page.tsx", "utf8"),
    readFile("components/admin/whole-request-fulfillment-button.tsx", "utf8"),
  ]);

  assert.match(source, /import \{ WholeRequestFulfillmentButton \}/u);
  assert.match(source, /request\.status\.tone !== "good"/u);
  assert.doesNotMatch(source, /remainingLineCount=\{request\.lineCount\}/u);
  assert.equal(source.match(/ariaLabel=\{`Evadi completamente richiesta/gu)?.length, 2);
  assert.match(source, /lg:block/u);
  assert.match(source, /lg:hidden/u);
  assert.equal(
    source.match(/<WholeRequestFulfillmentButton/g)?.length,
    2,
    "desktop and mobile lists must both expose the action",
  );
  assert.match(buttonSource, /aria-label=\{ariaLabel\}/u);
  assert.match(buttonSource, /Evadi completamente tutte le righe residue/u);
});
