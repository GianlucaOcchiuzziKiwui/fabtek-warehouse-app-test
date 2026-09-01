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
        format: "module",
        url: "data:text/javascript,export%20const%20updateSession%20%3D%20async%20()%20%3D%3E%20undefined%3B",
      };
    }
    if (specifier === "next/server") {
      return {
        shortCircuit: true,
        url: new URL("../node_modules/next/server.js", import.meta.url).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const nextConfig = (await import("../next.config.ts")).default;
const { config: proxyConfig } = await import("../proxy.ts");

test("the service worker only controls installation and activation", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const listeners = new Map();
  let skipWaitingCalls = 0;
  let claimCalls = 0;

  const worker = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    clients: {
      claim: async () => {
        claimCalls += 1;
      },
    },
    skipWaiting: async () => {
      skipWaitingCalls += 1;
    },
  };

  vm.runInNewContext(source, { self: worker });

  assert.deepEqual([...listeners.keys()], ["install", "activate"]);
  assert.equal(listeners.has("fetch"), false);

  const installPromises = [];
  listeners.get("install")({ waitUntil: (promise) => installPromises.push(promise) });
  await Promise.all(installPromises);

  const activatePromises = [];
  listeners.get("activate")({ waitUntil: (promise) => activatePromises.push(promise) });
  await Promise.all(activatePromises);

  assert.equal(skipWaitingCalls, 1);
  assert.equal(claimCalls, 1);
});

test("the service worker is served with non-cacheable JavaScript headers", async () => {
  const rules = await nextConfig.headers();
  const serviceWorkerRule = rules.find((rule) => rule.source === "/sw.js");

  assert.ok(serviceWorkerRule);
  assert.deepEqual(serviceWorkerRule.headers, [
    { key: "Content-Type", value: "application/javascript; charset=utf-8" },
    { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
  ]);
});

test("public PWA files bypass the authenticated proxy without broad exclusions", () => {
  const [matcher] = proxyConfig.matcher;
  const pattern = new RegExp(matcher);

  assert.equal(pattern.test("/sw.js"), false);
  assert.equal(pattern.test("/manifest.webmanifest"), false);
  assert.equal(pattern.test("/swxjs"), true);
  assert.equal(pattern.test("/sw.js.map"), true);
  assert.equal(pattern.test("/manifest.webmanifest.backup"), true);
  assert.equal(pattern.test("/richieste"), true);
});
