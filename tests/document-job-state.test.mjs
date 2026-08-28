import assert from "node:assert/strict";
import test from "node:test";

import { getRetryDecision } from "../lib/domain/documents/job-state.ts";

test("a first failed attempt is retried after one minute", () => {
  assert.deepEqual(
    getRetryDecision(1, new Date("2026-08-28T10:00:00Z")),
    {
      terminal: false,
      retryAt: "2026-08-28T10:01:00.000Z",
    },
  );
});

test("the fifth failed attempt is terminal", () => {
  assert.deepEqual(
    getRetryDecision(5, new Date("2026-08-28T10:00:00Z")),
    {
      terminal: true,
      retryAt: null,
    },
  );
});

test("retry delays follow the deterministic schedule", () => {
  const now = new Date("2026-08-28T10:00:00Z");

  assert.equal(getRetryDecision(2, now).retryAt, "2026-08-28T10:05:00.000Z");
  assert.equal(getRetryDecision(3, now).retryAt, "2026-08-28T10:15:00.000Z");
  assert.equal(getRetryDecision(4, now).retryAt, "2026-08-28T11:00:00.000Z");
});
