import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@supabase/ssr") {
      return {
        shortCircuit: true,
        format: "module",
        url: "data:text/javascript,export%20const%20createServerClient%20%3D%20(...args)%20%3D%3E%20globalThis.__testCreateServerClient(...args)%3B",
      };
    }
    if (specifier === "next/server") {
      return {
        shortCircuit: true,
        url: new URL("../node_modules/next/server.js", import.meta.url).href,
      };
    }
    if (specifier.startsWith("@/")) {
      return {
        shortCircuit: true,
        url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
      };
    }
    if (
      specifier === "../utils"
      && context.parentURL?.endsWith("/lib/supabase/proxy.ts")
    ) {
      return {
        shortCircuit: true,
        url: new URL("../lib/utils.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.com";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

let clientCreations = 0;
let claimsChecks = 0;
globalThis.__testCreateServerClient = () => {
  clientCreations += 1;
  return {
    auth: {
      getClaims: async () => {
        claimsChecks += 1;
        return { data: { claims: null } };
      },
    },
  };
};

const { NextRequest } = await import("next/server");
const { proxy } = await import("../proxy.ts");

test.after(() => {
  delete globalThis.__testCreateServerClient;
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
});

test("the removed scheduler route follows the normal Supabase session redirect", async () => {
  clientCreations = 0;

  for (const pathname of [
    "/api/internal/jobs",
    "/api/internal/jobs/extra",
    "/api/internal/job",
    "/api/internal/health",
    "/richieste",
  ]) {
    const response = await proxy(new NextRequest(
      `https://materiali.fabtek.it${pathname}`,
    ));
    assert.equal(response.status, 307, pathname);
    assert.equal(
      response.headers.get("location"),
      "https://materiali.fabtek.it/auth/login",
      pathname,
    );
  }

  assert.equal(clientCreations, 5);
});

test("only canonical on-demand PDF routes pass through anonymously after session refresh", async () => {
  clientCreations = 0;
  claimsChecks = 0;
  const requestId = "10000000-0000-4000-8000-000000000001";

  for (const kind of ["initial_request", "final_report"]) {
    const response = await proxy(new NextRequest(
      `https://materiali.fabtek.it/api/requests/${requestId}/pdf/${kind}`,
    ));
    assert.equal(response.status, 200, kind);
    assert.equal(response.headers.get("location"), null, kind);
  }

  for (const pathname of [
    `/api/requests/${requestId}/pdf/draft`,
    `/api/requests/${requestId}/pdf/initial_request/extra`,
    "/api/requests/not-a-uuid/pdf/initial_request",
    `/api/requests/${requestId}/documents/initial_request`,
  ]) {
    const response = await proxy(new NextRequest(
      `https://materiali.fabtek.it${pathname}`,
    ));
    assert.equal(response.status, 307, pathname);
    assert.equal(
      response.headers.get("location"),
      "https://materiali.fabtek.it/auth/login",
      pathname,
    );
  }

  assert.equal(clientCreations, 6);
  assert.equal(claimsChecks, 6);
});
