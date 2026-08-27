import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRequestHeaderHref,
  REQUEST_MATERIALS_PATH,
  buildRequestMaterialsHref,
} from "../lib/domain/requests/navigation.ts";

const VARIANT_ID = "20000000-0000-0000-0000-000000000001";
const CATEGORY_ID = "30000000-0000-0000-0000-000000000001";

test("the second request step has a dedicated route", () => {
  assert.equal(REQUEST_MATERIALS_PATH, "/richieste/nuova/materiali");
  assert.equal(buildRequestMaterialsHref(), REQUEST_MATERIALS_PATH);
});

test("preserves a valid catalog selection when continuing from the header", () => {
  assert.equal(
    buildRequestMaterialsHref({ variantId: VARIANT_ID, categoryId: CATEGORY_ID }),
    `${REQUEST_MATERIALS_PATH}?variantId=${VARIANT_ID}&categoryId=${CATEGORY_ID}`,
  );
});

test("preserves the catalog selection when returning to edit the header", () => {
  assert.equal(
    buildRequestHeaderHref({ variantId: VARIANT_ID, categoryId: CATEGORY_ID }),
    `/richieste/nuova?variantId=${VARIANT_ID}&categoryId=${CATEGORY_ID}`,
  );
});

test("drops partial or malformed catalog selections", () => {
  assert.equal(
    buildRequestMaterialsHref({ variantId: VARIANT_ID }),
    REQUEST_MATERIALS_PATH,
  );
  assert.equal(
    buildRequestMaterialsHref({ variantId: "javascript:alert(1)", categoryId: CATEGORY_ID }),
    REQUEST_MATERIALS_PATH,
  );
});

test("keeps the request header and material catalog on separate pages", async () => {
  const [headerPage, materialsPage] = await Promise.all([
    readFile("app/(app)/richieste/nuova/page.tsx", "utf8"),
    readFile("app/(app)/richieste/nuova/materiali/page.tsx", "utf8").catch(() => ""),
  ]);

  assert.doesNotMatch(headerPage, /RequestCatalogPicker|CartSummary/u);
  assert.match(materialsPage, /RequestCatalogPicker/u);
  assert.match(materialsPage, /CartSummary/u);
});
