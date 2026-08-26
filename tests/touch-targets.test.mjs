import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PRIMARY_FLOW_CONTROL_FILES = [
  "components/catalog/catalog-results.tsx",
  "components/requests/add-to-request-button.tsx",
  "components/requests/request-catalog-picker.tsx",
  "components/requests/draft-print-view.tsx",
  "components/layout/app-navigation.tsx",
];

test("primary catalog and request controls keep a 40px minimum target", async () => {
  for (const file of PRIMARY_FLOW_CONTROL_FILES) {
    const source = await readFile(file, "utf8");

    assert.doesNotMatch(source, /\bh-(?:7|8|9)\b/u, `${file} contains a control below 40px`);
    assert.doesNotMatch(
      source,
      /size="(?:xs|sm|icon-xs|icon-sm)"/u,
      `${file} uses a button size below 40px`,
    );
  }
});

test("application navigation links keep a 40px minimum target", async () => {
  const source = await readFile("components/layout/app-navigation.tsx", "utf8");

  assert.equal(source.match(/min-h-10/g)?.length, 3);
});
