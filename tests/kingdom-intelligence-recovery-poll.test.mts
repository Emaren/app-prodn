import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isOperatorPreviewOnlyPayload,
  isUsableLiveRecoveryPayload,
  LIVE_RECOVERY_POLL_INTERVAL_MS,
  LIVE_RECOVERY_REQUEST_TIMEOUT_MS,
  shouldPollLiveRecovery,
} from "../app/kingdom-intelligence/liveRecoveryPolicy.ts";

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
});

test("unknown and false-freshness payloads are rejected", () => {
  assert.equal(isUsableLiveRecoveryPayload(null), false);
  assert.equal(isUsableLiveRecoveryPayload([]), false);
  assert.equal(isUsableLiveRecoveryPayload({}), false);
  assert.equal(isUsableLiveRecoveryPayload({ available: "yes" }), false);
  assert.equal(isUsableLiveRecoveryPayload({ available: true }), false);
  assert.equal(isUsableLiveRecoveryPayload({ ...sample(), sampledAt: "garbage" }), false);
  assert.equal(isUsableLiveRecoveryPayload({ ...sample(), observedBytes: -3 }), false);
  assert.equal(isUsableLiveRecoveryPayload({ ...sample(), overallPercent: 110 }), false);
  assert.equal(isUsableLiveRecoveryPayload({ ...sample(), overallPercent: NaN }), false);
  assert.equal(isUsableLiveRecoveryPayload({ ...sample(), sealedChunks: Infinity }), false);
  assert.equal(isUsableLiveRecoveryPayload(sample()), true);
  assert.equal(isUsableLiveRecoveryPayload({ available: false }), true);
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
