import assert from "node:assert/strict";
import test from "node:test";

const uploads = await import("../lib/uploads/policy.ts");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=", "base64");

test("photo uploads accept PNG content and reject files larger than 2 MB", async () => {
  assert.equal(typeof uploads.validateUpload, "function");
  const valid = await uploads.validateUpload(new File([png], "photo.png", { type: "image/png" }), "component-photo");
  assert.equal(valid.contentType, "image/png");
  assert.equal(valid.extension, "png");
  const atLimit = new Uint8Array(2 * 1024 * 1024);
  atLimit.set(png);
  await uploads.validateUpload(new File([atLimit], "photo.png", { type: "image/png" }), "component-photo");
  await assert.rejects(uploads.validateUpload(new File([atLimit, "x"], "photo.png", { type: "image/png" }), "component-photo"), /2 MB/);
});

test("photo validation rejects empty files, SVG, spoofed MIME and unknown purposes", async () => {
  assert.equal(typeof uploads.validateUpload, "function");
  for (const file of [
    new File([], "empty.png", { type: "image/png" }),
    new File(["<svg/>"], "photo.svg", { type: "image/svg+xml" }),
    new File(["<script>alert(1)</script>"], "photo.png", { type: "image/png" }),
    new File([png], "photo.jpg", { type: "image/jpeg" }),
  ]) await assert.rejects(uploads.validateUpload(file, "component-photo"));
  await assert.rejects(uploads.validateUpload(new File([png], "photo.png", { type: "image/png" }), "arbitrary-bucket"));
});

test("only generated upload paths can be used as image URLs", () => {
  assert.equal(typeof uploads.getUploadUrl, "function");
  assert.equal(uploads.getUploadUrl("components/10000000-0000-4000-8000-000000000001.png"), "/api/uploads?path=components%2F10000000-0000-4000-8000-000000000001.png");
  for (const path of [null, "../../secrets", "https://example.org/x.png", "other/x.png"]) {
    assert.equal(uploads.getUploadUrl(path), null);
  }
});

test("catalog mapping keeps the same component photo for all of its variants", async () => {
  const { mapCatalogRows } = await import("../lib/data/catalog-mappers.ts");
  const rows = ["one", "two"].map((id) => ({
    id, fabtek_code: id, description: "Tubo", material: "PFA", connection: "NPT",
    component: { id: "component", name: "Tubazione", photo_path: "components/10000000-0000-4000-8000-000000000001.png" },
    unit_of_measure: { code: "pcs", name: "Pezzi" },
    categories: [{ category: { id: "cat", name: "Gas" } }],
  }));
  const mapped = mapCatalogRows(rows, []);
  assert.equal(mapped.length, 2);
  for (const variant of mapped) assert.equal(variant.component.photoUrl, "/api/uploads?path=components%2F10000000-0000-4000-8000-000000000001.png");
});
