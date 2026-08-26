import assert from "node:assert/strict";
import test from "node:test";

import { resolveSafeNextPath } from "../lib/auth/redirect.ts";

const origin = "https://materiali.fabtek.it";

test("uses the home page when next is missing", () => {
  assert.equal(resolveSafeNextPath(null, origin), "/");
});

test("preserves a local path with query string and hash", () => {
  assert.equal(
    resolveSafeNextPath("/richieste?stato=aperte#recenti", origin),
    "/richieste?stato=aperte#recenti",
  );
});

test("rejects absolute and protocol-relative redirects", () => {
  assert.equal(resolveSafeNextPath("https://example.com/phishing", origin), "/");
  assert.equal(resolveSafeNextPath("//example.com/phishing", origin), "/");
  assert.equal(resolveSafeNextPath("/\\example.com/phishing", origin), "/");
});
