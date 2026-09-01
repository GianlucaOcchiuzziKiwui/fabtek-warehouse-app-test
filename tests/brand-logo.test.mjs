import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import typescript from "typescript";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/link" || specifier === "next/image") {
      return nextResolve(`${specifier}.js`, context);
    }
    if (specifier === "./brand-logo") {
      return nextResolve(`${specifier}.tsx`, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    return {
      format: "module",
      source: typescript.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: {
          jsx: typescript.JsxEmit.ReactJSX,
          module: typescript.ModuleKind.ESNext,
          target: typescript.ScriptTarget.ES2022,
        },
      }).outputText,
      shortCircuit: true,
    };
  },
});

const { Brand } = await import("../components/brand.tsx");
const { BrandLogo } = await import("../components/brand-logo.tsx");

test("renders the supplied Fabtek logo instead of the legacy wordmark", () => {
  const brand = Brand();
  const logo = BrandLogo({ className: "test-logo" });
  const children = brand.props.children.flat(Infinity);

  assert.equal(logo.props.src, "/logo.png");
  assert.ok(children.some((child) => child?.props?.children?.type === BrandLogo));
  assert.ok(children.every((child) => child?.type !== "svg"));
  assert.ok(children.every((child) => child !== "FABTEK"));
});
