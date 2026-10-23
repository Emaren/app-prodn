import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isOperatorPreviewOnlyPayload,
  isUsableLiveRecoveryPayload,
  LIVE_RECOVERY_FUTURE_SKEW_MS,
  LIVE_RECOVERY_MAX_SAMPLE_AGE_MS,
  LIVE_RECOVERY_POLL_INTERVAL_MS,
  LIVE_RECOVERY_REQUEST_TIMEOUT_MS,
  shouldPollLiveRecovery,
} from "../app/kingdom-intelligence/liveRecoveryPolicy.ts";

const FIXED_NOW_MS = Date.parse("2026-10-20T15:00:05.000Z");
const accept = (value: unknown, nowMs = FIXED_NOW_MS) =>
  isUsableLiveRecoveryPayload(value, nowMs);

const sample = () => ({
  available: true,
  sampledAt: "2026-10-20T15:00:00.000Z",
  totalClasses: 5,
  completedClasses: 1,
  observedBytes: 1000,
  expectedBytes: 2000,
  classPercent: 50,
  overallPercent: 30,
  sealedChunks: 3,
  denominatorSource: "campaign_state",
});

test("one coalesced sample runs only with subscribers and a visible tab", () => {
  assert.equal(shouldPollLiveRecovery(0, "visible"), false);
  assert.equal(shouldPollLiveRecovery(1, "hidden"), false);
  assert.equal(shouldPollLiveRecovery(2, "prerender"), false);
  assert.equal(shouldPollLiveRecovery(2, "visible"), true);
  assert.equal(LIVE_RECOVERY_POLL_INTERVAL_MS, 5000);
  assert.equal(LIVE_RECOVERY_REQUEST_TIMEOUT_MS, 4000);
  assert.equal(LIVE_RECOVERY_MAX_SAMPLE_AGE_MS, 15_000);
  assert.equal(LIVE_RECOVERY_FUTURE_SKEW_MS, 5_000);
});

test("unknown and false-freshness payloads are rejected", () => {
  assert.equal(accept(null), false);
  assert.equal(accept([]), false);
  assert.equal(accept({}), false);
  assert.equal(accept({ available: "yes" }), false);
  assert.equal(accept({ available: true }), false);
  assert.equal(accept({ ...sample(), sampledAt: "garbage" }), false);
  assert.equal(accept({ ...sample(), observedBytes: -3 }), false);
  assert.equal(accept({ ...sample(), overallPercent: 110 }), false);
  assert.equal(accept({ ...sample(), overallPercent: NaN }), false);
  assert.equal(accept({ ...sample(), sealedChunks: Infinity }), false);
  assert.equal(accept(sample()), true);
  assert.equal(accept({ available: false }), true);
});

test("source observation freshness is distinct from local receipt time", () => {
  const at = (deltaMs: number) => new Date(FIXED_NOW_MS + deltaMs).toISOString();
  assert.equal(accept({ ...sample(), sampledAt: at(-15_000) }), true, "old boundary inclusive");
  assert.equal(accept({ ...sample(), sampledAt: at(-15_001) }), false, "too old");
  assert.equal(accept({ ...sample(), sampledAt: at(5_000) }), true, "clock skew boundary inclusive");
  assert.equal(accept({ ...sample(), sampledAt: at(5_001) }), false, "too far in future");
  assert.equal(accept({ ...sample(), sampledAt: "2020-01-01T00:00:00.000Z" }), false);
  assert.equal(accept({ ...sample(), sampledAt: "2099-01-01T00:00:00.000Z" }), false);
  assert.equal(accept({ ...sample(), sampledAt: null }), false);
  assert.equal(accept({ ...sample(), sampledAt: undefined }), false);
  assert.equal(accept(sample(), Number.NaN), false);
  // Late read/retransmission must not upgrade an older source observation to live.
  assert.equal(accept(sample(), FIXED_NOW_MS + 15_001), false);
  assert.equal(accept({ available: false, reason: "operator_preview_only" }), true);
});

test("integer and class invariants reject impossible live Recovery evidence", () => {
  assert.equal(accept({ ...sample(), completedClasses: 5, totalClasses: 2 }), false);
  assert.equal(accept({ ...sample(), completedClasses: 1.5 }), false);
  assert.equal(accept({ ...sample(), totalClasses: 1.5 }), false);
  assert.equal(accept({ ...sample(), sealedChunks: 1.2 }), false);
  assert.equal(accept({ ...sample(), completedClasses: -1 }), false);
  assert.equal(accept({ ...sample(), completedClasses: Infinity }), false);
  assert.equal(accept({ ...sample(), completedClasses: Number.MAX_SAFE_INTEGER + 1 }), false);
  assert.equal(accept({ ...sample(), totalClasses: Number.MAX_SAFE_INTEGER + 1 }), false);
  assert.equal(accept({ ...sample(), completedClasses: null }), false);
  assert.equal(accept({ ...sample(), totalClasses: undefined }), false);
  assert.equal(accept({ ...sample(), completedClasses: 0, totalClasses: 0, sealedChunks: 0 }), true);
  assert.equal(accept({ ...sample(), completedClasses: 2, totalClasses: 2 }), true);
  assert.equal(accept({ ...sample(), completedClasses: undefined, totalClasses: undefined }), true);
});

test("operator-preview refusal is terminal without disabling real preview samples", () => {
  assert.equal(isOperatorPreviewOnlyPayload({ available: false, reason: "operator_preview_only" }), true);
  assert.equal(isOperatorPreviewOnlyPayload({ available: false, reason: "no_running_recovery_campaign" }), false);
  assert.equal(isOperatorPreviewOnlyPayload({ available: true, reason: "operator_preview_only" }), false);
  assert.equal(isOperatorPreviewOnlyPayload(null), false);
});

test("hook wires abort, stale-completion fencing and background cancellation", () => {
  const hook = readFileSync("app/kingdom-intelligence/useLiveRecoveryProgress.ts", "utf8");
  assert.match(hook, /sharedPollPromise/);
  assert.match(hook, /operatorPreviewOnly = true/);
  assert.match(hook, /if \(firstSubscriber && !operatorPreviewOnly\)/);
  assert.match(hook, /listeners = new Set<Listener>/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /sharedController\?\.abort\(\)/);
  assert.match(hook, /requestGeneration === generation && canPoll\(\)/);
  assert.match(hook, /signal: controller\.signal/);
  assert.match(hook, /clearTimeout\(timeout\)/);
  assert.match(hook, /if \(!response\.ok\) throw/);
  assert.match(hook, /publish\(null\)/);
  assert.match(hook, /void pollSharedRecovery\(\)/);
  assert.match(hook, /cache: "no-store"/);
  assert.doesNotMatch(hook, /setInterval/);
});
