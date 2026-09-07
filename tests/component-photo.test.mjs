import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { shortCircuit: true, format: "module", url: "data:text/javascript,export%20{}" };
  return nextResolve(specifier, context);
} });
const service = await import("../lib/data/component-photo.ts");
const input = { id: "10000000-0000-4000-8000-000000000001" };
const photo = () => {
  const form = new FormData();
  form.set("file", new File(["image"], "photo.png", { type: "image/png" }));
  return form;
};
function fixture(result = { ok: true, data: { id: input.id } }) {
  const files = new Set(["old.png"]);
  let saved;
  return {
    files, get saved() { return saved; },
    deps: {
      async currentPath() { return "old.png"; },
      async upload() { files.add("new.png"); return "new.png"; },
      async remove(path) { files.delete(path); },
      async save(value, change) { saved = change; return result; },
    },
  };
}
test("replacement saves the new reference before deleting the old file", async () => {
  assert.equal(typeof service.saveComponentWithPhoto, "function");
  const f = fixture();
  const result = await service.saveComponentWithPhoto(input, photo(), f.deps);
  assert.equal(result.ok, true);
  assert.deepEqual([...f.files], ["new.png"]);
  assert.deepEqual(f.saved, { path: "new.png", expectedPath: "old.png" });
});
test("failed save cleans up only the new upload and keeps the current photo", async () => {
  assert.equal(typeof service.saveComponentWithPhoto, "function");
  const f = fixture({ ok: false, error: { code: "FAIL", message: "Failed" } });
  const result = await service.saveComponentWithPhoto(input, photo(), f.deps);
  assert.equal(result.ok, false);
  assert.deepEqual([...f.files], ["old.png"]);
});
test("removing a photo saves null and cleans up storage", async () => {
  assert.equal(typeof service.saveComponentWithPhoto, "function");
  const f = fixture();
  const form = new FormData();
  form.set("remove", "true");
  assert.equal((await service.saveComponentWithPhoto(input, form, f.deps)).ok, true);
  assert.deepEqual(f.saved, { path: null, expectedPath: "old.png" });
  assert.equal(f.files.size, 0);
});
test("saving without a photo change preserves the reference and avoids storage work", async () => {
  assert.equal(typeof service.saveComponentWithPhoto, "function");
  const f = fixture();
  f.deps.currentPath = async () => { throw new Error("Unexpected read"); };
  assert.equal((await service.saveComponentWithPhoto(input, undefined, f.deps)).ok, true);
  assert.equal(f.saved, undefined);
  assert.deepEqual([...f.files], ["old.png"]);
});
test("cleanup failure after persistence returns success with a visible warning", async () => {
  assert.equal(typeof service.saveComponentWithPhoto, "function");
  const f = fixture();
  f.deps.remove = async () => { throw new Error("storage unavailable"); };
  const result = await service.saveComponentWithPhoto(input, photo(), f.deps);
  assert.equal(result.ok, true);
  assert.match(result.data.warning, /pulizia/i);
});
