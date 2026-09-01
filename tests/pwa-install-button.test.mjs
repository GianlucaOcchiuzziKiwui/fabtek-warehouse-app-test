import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import typescript from "typescript";

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl(`
          export const useState = (initial) => globalThis.__pwaUseState(initial);
          export const useEffect = (effect) => globalThis.__pwaUseEffect(effect);
        `),
      };
    }
    if (specifier === "react/jsx-runtime") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl(`
          export const Fragment = Symbol.for("test.fragment");
          export const jsx = (type, props) => ({ type, props });
          export const jsxs = jsx;
        `),
      };
    }
    if (specifier === "@/components/ui/button") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl("export function Button(props) { return props; }")
      };
    }
    if (specifier === "@/lib/pwa/install-lifecycle") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl(`
          export const startPwaInstallLifecycle = (options) =>
            globalThis.__startPwaInstallLifecycle(options);
        `),
      };
    }
    if (specifier === "lucide-react") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl("export function Download(props) { return props; }")
      };
    }
    if (specifier === "next/font/google") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl(`
          const font = () => ({ variable: "test-font" });
          export const IBM_Plex_Sans = font;
          export const Oswald = font;
        `),
      };
    }
    if (specifier === "next-themes") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl("export function ThemeProvider(props) { return props.children; }")
      };
    }
    if (specifier === "./globals.css") {
      return {
        shortCircuit: true,
        format: "module",
        url: moduleUrl("export default {};"),
      };
    }
    if (specifier === "@/components/pwa/install-app-button") {
      return {
        shortCircuit: true,
        url: new URL("../components/pwa/install-app-button.tsx", import.meta.url).href,
      };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const dataPrefix = "data:text/javascript,";
    if (url.startsWith(dataPrefix)) {
      return {
        format: "module",
        source: decodeURIComponent(url.slice(dataPrefix.length)),
        shortCircuit: true,
      };
    }
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

let state = null;
let effect;
let lifecycleOptions;
let cleanupCalls = 0;

globalThis.__pwaUseState = (initial) => {
  if (state === undefined) state = initial;
  return [state, (value) => { state = typeof value === "function" ? value(state) : value; }];
};
globalThis.__pwaUseEffect = (callback) => { effect = callback; };
globalThis.__startPwaInstallLifecycle = (options) => {
  lifecycleOptions = options;
  return () => { cleanupCalls += 1; };
};

const { InstallAppButton } = await import("../components/pwa/install-app-button.tsx");
const { default: RootLayout, metadata, viewport } = await import("../app/layout.tsx");

test.after(() => {
  delete globalThis.__pwaUseState;
  delete globalThis.__pwaUseEffect;
  delete globalThis.__startPwaInstallLifecycle;
});

test("the install button stays hidden until Chromium offers an install prompt", async () => {
  state = null;
  effect = undefined;
  lifecycleOptions = undefined;
  cleanupCalls = 0;

  assert.equal(InstallAppButton(), null);
  assert.equal(typeof effect, "function");

  globalThis.window = {};
  const cleanup = effect();
  assert.equal(typeof lifecycleOptions.onInstallAction, "function");

  let installCalls = 0;
  const install = async () => { installCalls += 1; };
  lifecycleOptions.onInstallAction(install);

  const button = InstallAppButton();
  assert.equal(button.type.name, "Button");
  assert.equal(button.props["aria-label"], "Installa app");
  assert.equal(button.props.title, "Installa app");
  assert.equal(button.props.size, "icon");
  assert.match(button.props.className, /fixed/);
  assert.match(button.props.className, /bottom-4/);
  assert.match(button.props.className, /right-4/);

  button.props.onClick();
  await Promise.resolve();
  assert.equal(installCalls, 1);

  cleanup();
  assert.equal(cleanupCalls, 1);
  delete globalThis.window;
});

test("root metadata and layout expose installable app settings globally", () => {
  assert.deepEqual(metadata.appleWebApp, {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fabtek Materiali",
  });
  assert.equal(metadata.icons.apple, "/icons/apple-touch-icon.png");
  assert.deepEqual(viewport.themeColor, [
    { media: "(prefers-color-scheme: light)", color: "#0b2545" },
    { media: "(prefers-color-scheme: dark)", color: "#061527" },
  ]);

  const layout = RootLayout({ children: "content" });
  const body = layout.props.children;
  const bodyChildren = Array.isArray(body.props.children)
    ? body.props.children
    : [body.props.children];

  assert.ok(bodyChildren.some((child) => child?.type === InstallAppButton));
});
