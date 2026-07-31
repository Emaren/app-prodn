import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_FINAL_PROOF_VISIBILITY_MS,
  shouldKeepFinalProofVisible,
} from "../lib/liveFinalProofVisibility.ts";

const NOW = Date.UTC(2026, 6, 31, 0, 39, 30);

test("holds Jim-style unresolved final proof in the active surface", () => {
  assert.equal(
    shouldKeepFinalProofVisible({
      liveActivityAtMs: Date.UTC(2026, 6, 31, 0, 38, 33),
      finalActivityAtMs: Date.UTC(2026, 6, 31, 0, 39, 1),
      finalDisposition: "result_review",
      nowMs: NOW,
    }),
    true
  );
});

test("does not hold a trusted final result", () => {
  assert.equal(
    shouldKeepFinalProofVisible({
      liveActivityAtMs: NOW - 60_000,
      finalActivityAtMs: NOW - 30_000,
      finalDisposition: "result_ready",
      nowMs: NOW,
    }),
    false
  );
});

test("does not let an older final row suppress a newer live iteration", () => {
  assert.equal(
    shouldKeepFinalProofVisible({
      liveActivityAtMs: NOW - 10_000,
      finalActivityAtMs: NOW - 20_000,
      finalDisposition: "result_review",
      nowMs: NOW,
    }),
    false
  );
});

test("expires the active pending-proof presentation after the bounded grace", () => {
  assert.equal(
    shouldKeepFinalProofVisible({
      liveActivityAtMs: NOW - LIVE_FINAL_PROOF_VISIBILITY_MS - 60_000,
      finalActivityAtMs: NOW - LIVE_FINAL_PROOF_VISIBILITY_MS - 1,
      finalDisposition: "result_review",
      nowMs: NOW,
    }),
    false
  );
});
