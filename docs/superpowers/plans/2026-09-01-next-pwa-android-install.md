# Fabtek Materiali Android PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Fabtek Materiali installable from Chrome on Android as an online-only standalone PWA with an in-app install button.

**Architecture:** Use the native Next.js 16 manifest API, exact branded PNG launcher icons, and a public service worker that owns no fetches or caches. A testable browser lifecycle module captures Chromium's install prompt and a small global client component renders the existing Button only while that prompt is usable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, Tailwind CSS 4, Lucide React, browser Service Worker and Web App Manifest APIs.

**Spec:** `docs/superpowers/specs/2026-09-01-next-pwa-android-install-design.md`

## Global Constraints

- The app remains online-only: no `fetch` listener, Cache API, precache, background sync, or offline mutation queue.
- Auth, Supabase requests, application APIs, and PDFs remain network-only.
- Use native Next.js support and existing dependencies; add no npm package.
- Target Chrome and Chromium browsers on Android while degrading safely elsewhere.
- Installation always requires the user's confirmation in the browser prompt.
- Keep both portrait and landscape available.
- Preserve all existing business behavior, authentication, RLS, and API contracts.

---

### Task 1: Branded launcher icons and native manifest

**Files:**
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-maskable-512.png`
- Create: `public/icons/apple-touch-icon.png`
- Create: `app/manifest.ts`
- Create: `tests/pwa-manifest.test.mjs`

**Interfaces:**
- Consumes: the exact left-hand graphic mark from `public/logo.png` and Next.js `MetadataRoute.Manifest`.
- Produces: `manifest(): MetadataRoute.Manifest` and four opaque, square PNG assets referenced by the manifest and root metadata.

- [ ] **Step 1: Write the failing manifest and icon contract test**

Create `tests/pwa-manifest.test.mjs`. Import `app/manifest.ts`, call the default export, and assert literal contract values. Read each PNG's IHDR bytes directly so the test has no image dependency:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { default: manifest } = await import("../app/manifest.ts");

function pngContract(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

test("publishes the installable Android manifest contract", () => {
  const value = manifest();
  assert.equal(value.id, "/");
  assert.equal(value.scope, "/");
  assert.equal(value.start_url, "/");
  assert.equal(value.display, "standalone");
  assert.equal(value.lang, "it");
  assert.equal(value.theme_color, "#0b2545");
  assert.equal(value.background_color, "#ffffff");
  assert.equal(value.prefer_related_applications, false);
  assert.deepEqual(value.icons, [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
});

test("ships opaque square launcher icons at their declared sizes", async () => {
  for (const [path, size] of [
    ["public/icons/icon-192.png", 192],
    ["public/icons/icon-512.png", 512],
    ["public/icons/icon-maskable-512.png", 512],
    ["public/icons/apple-touch-icon.png", 180],
  ]) {
    const image = pngContract(await readFile(path));
    assert.deepEqual([image.width, image.height], [size, size], path);
    assert.equal(image.colorType, 2, `${path} must be opaque RGB`);
  }
});
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run: `node --no-warnings --test tests/pwa-manifest.test.mjs`

Expected: FAIL because `app/manifest.ts` and the icon files do not exist.

- [ ] **Step 3: Generate exact branded icons from the existing logo**

Create `public/icons/`. Use `System.Drawing` to crop the existing left symbol from the transparent source, composite it without reinterpretation on white, and export 24-bit RGB PNGs. Calculate the non-transparent bounds only in the left 300 pixels rather than hard-coding a crop. Use 82% content width for normal/Apple icons and 72% for the maskable safe area:

```powershell
Add-Type -AssemblyName System.Drawing
$source = [Drawing.Bitmap]::FromFile((Resolve-Path 'public/logo.png'))
$left = New-Object Drawing.Rectangle 0,0,300,$source.Height
$minX = 300; $minY = $source.Height; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $source.Height; $y++) {
  for ($x = 0; $x -lt 300; $x++) {
    if ($source.GetPixel($x, $y).A -gt 0) {
      $minX = [Math]::Min($minX, $x); $maxX = [Math]::Max($maxX, $x)
      $minY = [Math]::Min($minY, $y); $maxY = [Math]::Max($maxY, $y)
    }
  }
}
$crop = New-Object Drawing.Rectangle $minX,$minY,($maxX-$minX+1),($maxY-$minY+1)
function Export-PwaIcon([string]$path, [int]$size, [double]$contentRatio) {
  $bitmap = New-Object Drawing.Bitmap $size,$size,[Drawing.Imaging.PixelFormat]::Format24bppRgb
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([Drawing.Color]::White)
  $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $content = [int][Math]::Round($size * $contentRatio)
  $offset = [int][Math]::Floor(($size - $content) / 2)
  $destination = New-Object Drawing.Rectangle $offset,$offset,$content,$content
  $graphics.DrawImage($source, $destination, $crop, [Drawing.GraphicsUnit]::Pixel)
  $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
}
Export-PwaIcon 'public/icons/icon-192.png' 192 0.82
Export-PwaIcon 'public/icons/icon-512.png' 512 0.82
Export-PwaIcon 'public/icons/icon-maskable-512.png' 512 0.72
Export-PwaIcon 'public/icons/apple-touch-icon.png' 180 0.82
$source.Dispose()
```

Visually inspect `icon-512.png` and `icon-maskable-512.png`; the exact mark must be centered, sharp, and inside the maskable safe area.

- [ ] **Step 4: Implement the manifest**

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    scope: "/",
    start_url: "/",
    name: "Fabtek Materiali",
    short_name: "Fabtek",
    description: "Gestione delle richieste materiali Fabtek.",
    lang: "it",
    dir: "ltr",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b2545",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 5: Run the test and verify GREEN**

Run: `node --no-warnings --test tests/pwa-manifest.test.mjs`

Expected: 2 tests PASS.

- [ ] **Step 6: Commit the manifest slice**

```bash
git add app/manifest.ts public/icons tests/pwa-manifest.test.mjs
git commit -m "feat: add Android PWA manifest and icons"
```

---

### Task 2: Online-only service worker and public delivery contract

**Files:**
- Create: `public/sw.js`
- Create: `tests/pwa-service-worker.test.mjs`
- Modify: `next.config.ts`
- Modify: `proxy.ts`

**Interfaces:**
- Consumes: public root scope `/` and the existing Supabase proxy matcher.
- Produces: `/sw.js` with immediate install/activate lifecycle, exact security/update headers, and public `/sw.js` plus `/manifest.webmanifest` routes.

- [ ] **Step 1: Write the failing executable worker/config test**

Create `tests/pwa-service-worker.test.mjs`. Evaluate the real worker in a VM with a fake `self`, simulate `install` and `activate`, and import the real configs:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import vm from "node:vm";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase/proxy") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20async%20function%20updateSession()%20%7B%7D",
      };
    }
    return nextResolve(specifier, context);
  },
});

const { default: nextConfig } = await import("../next.config.ts");
const { config: proxyConfig } = await import("../proxy.ts");

test("the online-only worker activates without owning network requests", async () => {
  const listeners = new Map();
  let skipped = 0;
  let claimed = 0;
  const source = await readFile("public/sw.js", "utf8");
  vm.runInNewContext(source, {
    self: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting() { skipped += 1; return Promise.resolve(); },
      clients: { claim() { claimed += 1; return Promise.resolve(); } },
    },
  });
  assert.deepEqual([...listeners.keys()], ["install", "activate"]);
  const waits = [];
  listeners.get("install")({ waitUntil(value) { waits.push(value); } });
  listeners.get("activate")({ waitUntil(value) { waits.push(value); } });
  await Promise.all(waits);
  assert.equal(skipped, 1);
  assert.equal(claimed, 1);
});

test("serves the worker with non-cacheable security headers", async () => {
  const entries = await nextConfig.headers();
  const worker = entries.find((entry) => entry.source === "/sw.js");
  assert.deepEqual(Object.fromEntries(worker.headers.map(({ key, value }) => [key, value])), {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'",
  });
});

test("keeps worker and manifest outside the authenticated proxy", () => {
  const matcher = new RegExp(proxyConfig.matcher[0]);
  assert.equal(matcher.test("/sw.js"), false);
  assert.equal(matcher.test("/manifest.webmanifest"), false);
  assert.equal(matcher.test("/swxjs"), true);
  assert.equal(matcher.test("/richieste"), true);
});
```

- [ ] **Step 2: Run the worker test and verify RED**

Run: `node --no-warnings --test tests/pwa-service-worker.test.mjs`

Expected: FAIL because `public/sw.js`, worker headers, and proxy exclusions are missing.

- [ ] **Step 3: Implement the online-only worker**

Create `public/sw.js` with no `fetch` handler and no cache access:

```js
/* global self */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
```

- [ ] **Step 4: Add worker headers and proxy exclusions**

Extend `next.config.ts` with an async `headers()` returning the exact `/sw.js` contract from the test. Update the negative lookahead in `proxy.ts` to exclude both exact public PWA filenames while retaining the existing static/image exclusions:

```ts
matcher: [
  "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
],
```

- [ ] **Step 5: Run the worker test and verify GREEN**

Run: `node --no-warnings --test tests/pwa-service-worker.test.mjs`

Expected: 3 tests PASS with no worker fetch/cache behavior.

- [ ] **Step 6: Commit the worker slice**

```bash
git add public/sw.js next.config.ts proxy.ts tests/pwa-service-worker.test.mjs
git commit -m "feat: add online-only PWA service worker"
```

---

### Task 3: Testable browser installation lifecycle

**Files:**
- Create: `lib/pwa/install-lifecycle.ts`
- Create: `tests/pwa-install-lifecycle.test.mjs`

**Interfaces:**
- Consumes: a `Window`-compatible event target, optional `ServiceWorkerContainer`, and callback `onInstallAction(action: InstallAction | null)`.
- Produces: `startPwaInstallLifecycle(options): () => void` and `InstallAction = () => Promise<void>`.

- [ ] **Step 1: Write failing lifecycle tests with real fake event targets**

Create `tests/pwa-install-lifecycle.test.mjs` with fake event targets that exercise the real lifecycle module:

```js
import assert from "node:assert/strict";
import test from "node:test";

const { startPwaInstallLifecycle } = await import("../lib/pwa/install-lifecycle.ts");

class FakeEventTarget {
  listeners = new Map();
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeMediaQuery extends FakeEventTarget {
  matches = false;
}

function environment() {
  const media = new FakeMediaQuery();
  const windowObject = new FakeEventTarget();
  windowObject.matchMedia = () => media;
  return { media, windowObject };
}

test("registers the root worker without consulting the HTTP cache", async () => {
  const { windowObject } = environment();
  const registrations = [];
  startPwaInstallLifecycle({
    windowObject,
    serviceWorker: { register: async (...args) => registrations.push(args) },
    onInstallAction() {},
    onError(error) { throw error; },
  });
  await Promise.resolve();
  assert.deepEqual(registrations, [["/sw.js", { scope: "/", updateViaCache: "none" }]]);
});

test("offers and consumes one Chromium install prompt", async () => {
  const { windowObject } = environment();
  let action = null;
  let prevented = 0;
  let prompted = 0;
  startPwaInstallLifecycle({ windowObject, serviceWorker: null,
    onInstallAction(value) { action = value; }, onError(error) { throw error; } });
  windowObject.dispatch("beforeinstallprompt", {
    preventDefault() { prevented += 1; },
    async prompt() { prompted += 1; return { outcome: "dismissed" }; },
  });
  assert.equal(prevented, 1);
  assert.equal(typeof action, "function");
  const install = action;
  await install();
  await install();
  assert.equal(prompted, 1);
  assert.equal(action, null);
});

test("never offers installation in standalone mode and clears on appinstalled", () => {
  const { media, windowObject } = environment();
  let action = null;
  const promptEvent = { preventDefault() {}, async prompt() { return { outcome: "accepted" }; } };
  media.matches = true;
  startPwaInstallLifecycle({ windowObject, serviceWorker: null,
    onInstallAction(value) { action = value; }, onError(error) { throw error; } });
  windowObject.dispatch("beforeinstallprompt", promptEvent);
  assert.equal(action, null);
  media.matches = false;
  media.dispatch("change");
  windowObject.dispatch("beforeinstallprompt", promptEvent);
  assert.equal(typeof action, "function");
  windowObject.dispatch("appinstalled", {});
  assert.equal(action, null);
});
```

Also assert that the returned cleanup removes window and media listeners, that a rejected service worker registration calls `onError` with `Impossibile registrare il service worker PWA.`, and that a rejected prompt calls `onError` with `Impossibile aprire il prompt di installazione PWA.` without producing an unhandled rejection.

- [ ] **Step 2: Run the lifecycle test and verify RED**

Run: `node --no-warnings --test tests/pwa-install-lifecycle.test.mjs`

Expected: FAIL because `startPwaInstallLifecycle` does not exist.

- [ ] **Step 3: Implement the lifecycle module**

Implement narrow local interfaces instead of extending global DOM declarations. The module must:

```ts
export type InstallAction = () => Promise<void>;

export function startPwaInstallLifecycle({
  windowObject,
  serviceWorker,
  onInstallAction,
  onError,
}: PwaInstallLifecycleOptions): () => void {
  const media = windowObject.matchMedia("(display-mode: standalone)");
  let currentPrompt: InstallPromptEvent | null = null;

  const clear = () => {
    currentPrompt = null;
    onInstallAction(null);
  };
  const onBeforeInstallPrompt: EventListener = (browserEvent) => {
    const event = browserEvent as InstallPromptEvent;
    event.preventDefault();
    if (media.matches) return clear();
    currentPrompt = event;
    onInstallAction(async () => {
      if (currentPrompt !== event) return;
      clear();
      try {
        await event.prompt();
      } catch (cause) {
        onError(new Error("Impossibile aprire il prompt di installazione PWA.", { cause }));
      }
    });
  };
  const onInstalled = () => clear();
  const onDisplayModeChange = () => { if (media.matches) clear(); };

  windowObject.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  windowObject.addEventListener("appinstalled", onInstalled);
  media.addEventListener("change", onDisplayModeChange);
  if (media.matches) clear();

  if (serviceWorker) {
    void serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((cause) => onError(new Error("Impossibile registrare il service worker PWA.", { cause })));
  }

  return () => {
    windowObject.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    windowObject.removeEventListener("appinstalled", onInstalled);
    media.removeEventListener("change", onDisplayModeChange);
  };
}
```

Use these narrow interfaces; do not add global DOM declarations or use `any`:

```ts
interface InstallPromptEvent extends Event {
  preventDefault(): void;
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface DisplayModeQuery {
  matches: boolean;
  addEventListener(type: "change", listener: EventListener): void;
  removeEventListener(type: "change", listener: EventListener): void;
}

interface InstallWindow {
  matchMedia(query: "(display-mode: standalone)"): DisplayModeQuery;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface InstallServiceWorkerContainer {
  register(scriptURL: string, options: {
    scope: string;
    updateViaCache: "none";
  }): Promise<unknown>;
}

interface PwaInstallLifecycleOptions {
  windowObject: InstallWindow;
  serviceWorker: InstallServiceWorkerContainer | null;
  onInstallAction(action: InstallAction | null): void;
  onError(error: Error): void;
}
```

- [ ] **Step 4: Run lifecycle tests and verify GREEN**

Run: `node --no-warnings --test tests/pwa-install-lifecycle.test.mjs`

Expected: every registration, prompt, standalone, appinstalled, cleanup, and error-path test PASS.

- [ ] **Step 5: Commit the lifecycle slice**

```bash
git add lib/pwa/install-lifecycle.ts tests/pwa-install-lifecycle.test.mjs
git commit -m "feat: manage PWA installation lifecycle"
```

---

### Task 4: Global floating install control and application metadata

**Files:**
- Create: `components/pwa/install-app-button.tsx`
- Create: `tests/pwa-install-button.test.mjs`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `startPwaInstallLifecycle`, `InstallAction`, existing `Button`, Lucide `Download`, and the four Task 1 icons.
- Produces: `InstallAppButton()` rendered once by `RootLayout`, global PWA metadata, and light/dark viewport theme colors.

- [ ] **Step 1: Write the failing component and root-layout contract test**

Use the existing Node hook pattern to transpile TSX. Substitute React hooks and the lifecycle boundary, but retain the real `Button` component as the returned element type:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import typescript from "typescript";

let state = null;
let effect = null;
let lifecycleOptions = null;
globalThis.__pwaUseState = (initial) => [state ?? initial, (value) => {
  state = typeof value === "function" ? value(state) : value;
}];
globalThis.__pwaUseEffect = (callback) => { effect = callback; };
globalThis.__pwaStartLifecycle = (options) => {
  lifecycleOptions = options;
  return () => {};
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20const%20useState%3DglobalThis.__pwaUseState%3Bexport%20const%20useEffect%3DglobalThis.__pwaUseEffect%3B",
      };
    }
    if (specifier === "@/lib/pwa/install-lifecycle") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20const%20startPwaInstallLifecycle%3DglobalThis.__pwaStartLifecycle%3B",
      };
    }
    if (specifier === "@/components/ui/button") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20function%20Button(props)%7Breturn%20props.children%7D",
      };
    }
    if (specifier === "lucide-react") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20function%20Download()%7Breturn%20null%7D",
      };
    }
    if (specifier === "next/font/google") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20const%20IBM_Plex_Sans%3D()%3D%3E(%7Bvariable%3A'ibm'%7D)%3Bexport%20const%20Oswald%3D()%3D%3E(%7Bvariable%3A'oswald'%7D)%3B",
      };
    }
    if (specifier === "next-themes") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20function%20ThemeProvider(props)%7Breturn%20props.children%7D",
      };
    }
    if (specifier.startsWith("@/")) {
      const relative = specifier.slice(2);
      const extension = relative.startsWith("components/") ? ".tsx" : ".ts";
      return { shortCircuit: true, url: new URL(`../${relative}${extension}`, import.meta.url).href };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("globals.css")) {
      return { format: "module", source: "export {};", shortCircuit: true };
    }
    if (!new URL(url).pathname.endsWith(".tsx")) return nextLoad(url, context);
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

const { Button } = await import("@/components/ui/button");
const { InstallAppButton } = await import("../components/pwa/install-app-button.tsx");

test("renders a touch-friendly fixed install action only when installable", async () => {
  let prompts = 0;
  const initial = InstallAppButton();
  assert.equal(initial, null);
  effect();
  lifecycleOptions.onInstallAction(async () => { prompts += 1; });
  const button = InstallAppButton();
  assert.equal(button.type, Button);
  assert.equal(button.props["aria-label"], "Installa app");
  assert.equal(button.props.title, "Installa app");
  assert.match(button.props.className, /fixed/u);
  assert.match(button.props.className, /bottom-4/u);
  assert.match(button.props.className, /right-4/u);
  assert.equal(button.props.size, "icon");
  await button.props.onClick();
  assert.equal(prompts, 1);
});

test.after(() => {
  delete globalThis.__pwaUseState;
  delete globalThis.__pwaUseEffect;
  delete globalThis.__pwaStartLifecycle;
});
```

With those resolver/load substitutions, import the root layout under a unique query string. Assert its metadata/viewport literals and inspect the real returned element tree for one install component after the theme provider:

```js
const layoutModule = await import("../app/layout.tsx?pwa-contract");
const { default: RootLayout, metadata, viewport } = layoutModule;
assert.equal(metadata.appleWebApp.capable, true);
assert.equal(metadata.appleWebApp.title, "Fabtek Materiali");
assert.equal(metadata.icons.apple, "/icons/apple-touch-icon.png");
assert.deepEqual(viewport.themeColor, [
  { media: "(prefers-color-scheme: light)", color: "#0b2545" },
  { media: "(prefers-color-scheme: dark)", color: "#061527" },
]);
const root = RootLayout({ children: "content" });
const body = root.props.children;
assert.equal(body.props.children[1].type, InstallAppButton);
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `node --no-warnings --test tests/pwa-install-button.test.mjs`

Expected: FAIL because the component and PWA root metadata do not exist.

- [ ] **Step 3: Implement the client install button**

Create `components/pwa/install-app-button.tsx`:

```tsx
"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { type InstallAction, startPwaInstallLifecycle } from "@/lib/pwa/install-lifecycle";

export function InstallAppButton() {
  const [install, setInstall] = useState<InstallAction | null>(null);

  useEffect(() => startPwaInstallLifecycle({
    windowObject: window,
    serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
    onInstallAction(action) { setInstall(() => action); },
    onError(error) { console.error(error.message, error); },
  }), []);

  if (!install) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="accent"
      className="fixed bottom-4 right-4 z-50 shadow-lg print:hidden"
      aria-label="Installa app"
      title="Installa app"
      onClick={() => void install()}
    >
      <Download aria-hidden="true" />
    </Button>
  );
}
```

The 40px icon button satisfies the existing touch target contract despite being visually compact.

- [ ] **Step 4: Add root metadata and mount the component**

In `app/layout.tsx`, import `Viewport` and `InstallAppButton`, extend `metadata`, and export `viewport`:

```ts
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b2545" },
    { media: "(prefers-color-scheme: dark)", color: "#061527" },
  ],
};
```

Add:

```ts
icons: { apple: "/icons/apple-touch-icon.png" },
appleWebApp: {
  capable: true,
  title: "Fabtek Materiali",
  statusBarStyle: "black-translucent",
},
```

Render `<InstallAppButton />` after `</ThemeProvider>` inside `<body>` so it is available on auth and authenticated layouts without inheriting their suspense/data boundaries.

- [ ] **Step 5: Run the component test and verify GREEN**

Run: `node --no-warnings --test tests/pwa-install-button.test.mjs`

Expected: component visibility, install action, touch target, metadata, and root mounting tests PASS.

- [ ] **Step 6: Run focused and complete automated verification**

Run:

```bash
node --no-warnings --test tests/pwa-manifest.test.mjs tests/pwa-service-worker.test.mjs tests/pwa-install-lifecycle.test.mjs tests/pwa-install-button.test.mjs tests/proxy-security.test.mjs tests/touch-targets.test.mjs
npm test
npx eslint app/manifest.ts app/layout.tsx components/pwa/install-app-button.tsx lib/pwa/install-lifecycle.ts tests/pwa-manifest.test.mjs tests/pwa-service-worker.test.mjs tests/pwa-install-lifecycle.test.mjs tests/pwa-install-button.test.mjs next.config.ts proxy.ts public/sw.js
npm run build
git diff --check
```

Expected: focused tests, 277+ complete tests, scoped lint, build, and whitespace check all exit 0. If global `npm run lint` still reports the known unrelated `RequestCartHeader` import, report it separately and do not modify it in this task.

- [ ] **Step 7: Verify production HTTP and browser behavior**

Start the production build with `npm start`. Verify:

```text
GET /manifest.webmanifest -> 200, application/manifest+json
GET /sw.js -> 200, application/javascript; charset=utf-8
GET /icons/icon-192.png -> 200, image/png
GET /icons/icon-512.png -> 200, image/png
```

Confirm `/sw.js` returns the exact `Cache-Control`, `X-Content-Type-Options`, and CSP headers. In Chrome DevTools Application, confirm the manifest has no installability errors, the service worker controls scope `/`, no Cache Storage entry is created, the icon mask preview is not clipped, and the install button disappears after an `appinstalled` event. Do not claim a real Android install unless it is tested on an HTTPS Android environment.

- [ ] **Step 8: Commit the completed UI integration**

```bash
git add app/layout.tsx components/pwa/install-app-button.tsx tests/pwa-install-button.test.mjs
git commit -m "feat: add PWA install control"
```

After the commit, run `git status --short` and require a clean tree.
