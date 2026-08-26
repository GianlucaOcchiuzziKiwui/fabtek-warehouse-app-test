import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REQUEST_UI_FILES = [
  "app/(app)/richieste/error.tsx",
  "app/(app)/richieste/page.tsx",
  "app/(app)/richieste/[requestId]/loading.tsx",
  "app/(app)/richieste/[requestId]/not-found.tsx",
  "app/(app)/richieste/[requestId]/page.tsx",
  "components/requests/request-detail.tsx",
  "components/requests/submit-request-button.tsx",
];

test("request UI copy does not contain UTF-8 mojibake", async () => {
  for (const file of REQUEST_UI_FILES) {
    const source = await readFile(file, "utf8");

    assert.doesNotMatch(source, /[ÃÂ]/u, `${file} contains mojibake`);
  }
});
