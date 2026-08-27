import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("step 4 uses the item table defined by mock.html", async () => {
  const source = await readFile("components/requests/request-catalog-picker.tsx", "utf8");

  assert.match(source, /<table[^>]*data-request-item-table/u);
  for (const heading of [
    "Part #",
    "Misura",
    "Materiale",
    "Connessione",
    "Disponibilità",
    "Quantità",
  ]) {
    assert.match(source, new RegExp(`>${heading}<`, "u"));
  }
  assert.match(source, /bg-brand-navy[^\n]*text-white/u);
  assert.match(source, /overflow-x-auto/u);
});

test("step 4 item rows keep both mock actions", async () => {
  const addButton = await readFile("components/requests/add-to-request-button.tsx", "utf8");

  assert.match(addButton, /Data Sheet/u);
  assert.match(addButton, /"Aggiungi"/u);
  assert.match(addButton, /aria-label="Riduci quantit/u);
  assert.match(addButton, /aria-label="Aumenta quantit/u);
});

test("table cells stay outside the interactive client boundary", async () => {
  const picker = await readFile("components/requests/request-catalog-picker.tsx", "utf8");
  const controls = await readFile("components/requests/add-to-request-button.tsx", "utf8");

  assert.match(picker, /<td[^>]*colSpan=\{2\}[^>]*>[\s\S]*?<RequestItemRowControls/u);
  assert.doesNotMatch(controls, /<td\b/u);
});
