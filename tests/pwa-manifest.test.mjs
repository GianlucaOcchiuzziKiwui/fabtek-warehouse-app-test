import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import createManifest from "../app/manifest.ts";

const expectedIcons = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  {
    src: "/icons/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

const pngFiles = [
  ["../public/icons/icon-192.png", 192, 192],
  ["../public/icons/icon-512.png", 512, 512],
  ["../public/icons/icon-maskable-512.png", 512, 512],
  ["../public/icons/apple-touch-icon.png", 180, 180],
];

test("manifest exposes the Android standalone application contract", () => {
  const manifest = createManifest();

  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "it");
  assert.equal(manifest.theme_color, "#0b2545");
  assert.equal(manifest.background_color, "#ffffff");
  assert.equal(manifest.prefer_related_applications, false);
  assert.deepEqual(manifest.icons, expectedIcons);
});

for (const [relativePath, expectedWidth, expectedHeight] of pngFiles) {
  test(`${relativePath} is an opaque PNG with the expected dimensions`, async () => {
    const png = await readFile(new URL(relativePath, import.meta.url));

    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), expectedWidth);
    assert.equal(png.readUInt32BE(20), expectedHeight);
    assert.equal(png[25], 2, "PNG must use opaque RGB color type");
  });
}
