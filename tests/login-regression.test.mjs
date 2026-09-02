import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginFormSource = await readFile(
  new URL("../components/login-form.tsx", import.meta.url),
  "utf8",
);
const inputSource = await readFile(
  new URL("../components/ui/input.tsx", import.meta.url),
  "utf8",
);
const globalStyles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("successful login performs a document navigation after cookies are written", () => {
  assert.match(loginFormSource, /await supabase\.auth\.signInWithPassword/);
  assert.match(loginFormSource, /window\.location\.replace\("\/"\)/);
  assert.doesNotMatch(loginFormSource, /router\.replace\("\/"\)/);
});

test("inputs have theme-safe text and background colors on Android", () => {
  assert.match(inputSource, /bg-background/);
  assert.match(inputSource, /text-foreground/);
  assert.match(inputSource, /placeholder:text-muted-foreground/);
  assert.match(globalStyles, /input:-webkit-autofill/);
  assert.match(globalStyles, /-webkit-text-fill-color: var\(--foreground\)/);
});
