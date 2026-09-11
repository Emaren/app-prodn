import assert from "node:assert/strict";
import test from "node:test";

import { projectChallengeWatcherReadiness } from "../lib/challengeWatcherReadiness.ts";

const NOW = new Date("2026-09-11T18:00:00.000Z");
const healthy = {
  eventType: "heartbeat",
  appVersion: "1.5.10",
  metadata: { isWatching: true, monitorAttached: true, folderValid: true, folderKind: "hd" },
};

test("no authenticated heartbeat projects No Watcher", () => {
  assert.equal(projectChallengeWatcherReadiness(null, NOW).state, "absent");
});

test("fresh healthy HD heartbeat projects Ready", () => {
  const result = projectChallengeWatcherReadiness({ ...healthy, createdAt: new Date(NOW.getTime() - 30_000) }, NOW);
  assert.equal(result.state, "ready");
  assert.equal(result.connected, true);
  assert.equal(result.monitorAttached, true);
  assert.equal(result.folderReady, true);
  assert.equal(result.appVersion, "1.5.10");
});

test("fresh heartbeat with stopped monitor is Connected but not Ready", () => {
  const result = projectChallengeWatcherReadiness({
    ...healthy,
    createdAt: new Date(NOW.getTime() - 30_000),
    metadata: { ...healthy.metadata, isWatching: false, monitorAttached: false },
  }, NOW);
  assert.equal(result.state, "connected");
  assert.equal(result.connected, true);
  assert.equal(result.monitorAttached, false);
});

test("fresh watcher on the wrong replay folder is not Ready", () => {
  const result = projectChallengeWatcherReadiness({
    ...healthy,
    createdAt: new Date(NOW.getTime() - 30_000),
    metadata: { ...healthy.metadata, folderValid: false, folderKind: "de" },
  }, NOW);
  assert.equal(result.state, "connected");
  assert.equal(result.folderReady, false);
});

test("stale healthy heartbeat is Seen, never Ready", () => {
  const result = projectChallengeWatcherReadiness({ ...healthy, createdAt: new Date(NOW.getTime() - 10 * 60_000) }, NOW);
  assert.equal(result.state, "seen");
  assert.equal(result.connected, false);
});
