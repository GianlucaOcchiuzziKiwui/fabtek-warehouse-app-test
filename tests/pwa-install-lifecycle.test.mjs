import assert from "node:assert/strict";
import test from "node:test";

import { startPwaInstallLifecycle } from "../lib/pwa/install-lifecycle.ts";

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

  dispatch(type, event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function createEnvironment({ standalone = false, registrationError } = {}) {
  const windowObject = new FakeEventTarget();
  const mediaQuery = new FakeEventTarget();
  mediaQuery.matches = standalone;
  windowObject.matchMedia = (query) => {
    assert.equal(query, "(display-mode: standalone)");
    return mediaQuery;
  };

  const registrations = [];
  const serviceWorker = {
    register(url, options) {
      registrations.push([url, options]);
      return registrationError
        ? Promise.reject(registrationError)
        : Promise.resolve({});
    },
  };

  const actions = [];
  const errors = [];
  const cleanup = startPwaInstallLifecycle({
    windowObject,
    serviceWorker,
    onInstallAction: (action) => actions.push(action),
    onError: (error) => errors.push(error),
  });

  return {
    actions,
    cleanup,
    errors,
    mediaQuery,
    registrations,
    windowObject,
  };
}

function createInstallPrompt({ rejection } = {}) {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  let promptCalls = 0;
  event.prompt = async () => {
    promptCalls += 1;
    if (rejection) throw rejection;
  };

  return { event, get promptCalls() { return promptCalls; } };
}

test("registers the root service worker without using the HTTP cache", async () => {
  const environment = createEnvironment();

  assert.deepEqual(environment.registrations, [
    ["/sw.js", { scope: "/", updateViaCache: "none" }],
  ]);
  await Promise.resolve();
  assert.deepEqual(environment.errors, []);
});

test("offers a captured install prompt exactly once", async () => {
  const environment = createEnvironment();
  const prompt = createInstallPrompt();

  environment.windowObject.dispatch("beforeinstallprompt", prompt.event);

  assert.equal(prompt.event.defaultPrevented, true);
  assert.equal(typeof environment.actions.at(-1), "function");

  const install = environment.actions.at(-1);
  await install();
  await install();

  assert.equal(prompt.promptCalls, 1);
  assert.equal(environment.actions.at(-1), null);
});

test("does not offer installation in standalone mode and clears it after installation", () => {
  const standaloneEnvironment = createEnvironment({ standalone: true });
  standaloneEnvironment.windowObject.dispatch(
    "beforeinstallprompt",
    createInstallPrompt().event,
  );
  assert.equal(standaloneEnvironment.actions.length, 0);

  const environment = createEnvironment();
  environment.windowObject.dispatch("beforeinstallprompt", createInstallPrompt().event);
  environment.windowObject.dispatch("appinstalled");
  assert.equal(environment.actions.at(-1), null);

  environment.windowObject.dispatch("beforeinstallprompt", createInstallPrompt().event);
  environment.mediaQuery.matches = true;
  environment.mediaQuery.dispatch("change");
  assert.equal(environment.actions.at(-1), null);
});

test("cleanup removes all lifecycle listeners without publishing state", () => {
  const environment = createEnvironment();
  const actionCount = environment.actions.length;

  environment.cleanup();
  environment.windowObject.dispatch("beforeinstallprompt", createInstallPrompt().event);
  environment.windowObject.dispatch("appinstalled");
  environment.mediaQuery.dispatch("change");

  assert.equal(environment.actions.length, actionCount);
});

test("reports service worker registration failures with context", async () => {
  const cause = new Error("network unavailable");
  const environment = createEnvironment({ registrationError: cause });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(environment.errors.length, 1);
  assert.equal(
    environment.errors[0].message,
    "Impossibile registrare il service worker PWA.",
  );
  assert.equal(environment.errors[0].cause, cause);
});

test("reports prompt failures and still consumes the captured prompt", async () => {
  const environment = createEnvironment();
  const cause = new Error("prompt blocked");
  const prompt = createInstallPrompt({ rejection: cause });

  environment.windowObject.dispatch("beforeinstallprompt", prompt.event);
  await environment.actions.at(-1)();

  assert.equal(environment.actions.at(-1), null);
  assert.equal(environment.errors.length, 1);
  assert.equal(
    environment.errors[0].message,
    "Impossibile aprire il prompt di installazione PWA.",
  );
  assert.equal(environment.errors[0].cause, cause);
});
