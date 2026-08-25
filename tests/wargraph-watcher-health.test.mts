import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWarGraphWatcherHealth,
  isWarGraphPairingReadyWatcherEvidence,
  isWarGraphWatcherHeartbeatFresh,
  WARGRAPH_WATCHER_FRESH_MS,
} from "../lib/wargraph/watcherHealthContract.ts";

test("Watcher connection remains distinct from an attached HD monitor", () => {
  assert.deepEqual(
    classifyWarGraphWatcherHealth({ eventType: "heartbeat", metadata: {} }),
    { connected: true, monitorAttached: false },
  );
  assert.deepEqual(
    classifyWarGraphWatcherHealth({
      eventType: "heartbeat",
      metadata: {
        isWatching: true,
        monitorAttached: true,
        folderValid: true,
        folderKind: "hd",
      },
    }),
    { connected: true, monitorAttached: true },
  );
});

test("stop/error and DE-folder evidence fail Ready health closed", () => {
  const healthyMetadata = {
    isWatching: true,
    monitorAttached: true,
    folderValid: true,
    folderKind: "hd",
  };
  for (const eventType of ["watcher_stopped", "watching_stopped", "watcher_error"]) {
    assert.equal(
      classifyWarGraphWatcherHealth({ eventType, metadata: healthyMetadata })
        .monitorAttached,
      false,
    );
  }
  assert.equal(
    classifyWarGraphWatcherHealth({
      eventType: "heartbeat",
      metadata: { ...healthyMetadata, folderKind: "de" },
    }).monitorAttached,
    false,
  );
});


test("Watcher heartbeat freshness is bounded and rejects future evidence", () => {
  const now = new Date("2026-08-24T22:00:00.000Z");

  assert.equal(
    isWarGraphWatcherHeartbeatFresh(
      new Date(now.getTime() - WARGRAPH_WATCHER_FRESH_MS),
      now,
    ),
    true,
  );

  assert.equal(
    isWarGraphWatcherHeartbeatFresh(
      new Date(now.getTime() - WARGRAPH_WATCHER_FRESH_MS - 1),
      now,
    ),
    false,
  );

  assert.equal(
    isWarGraphWatcherHeartbeatFresh(
      new Date(now.getTime() + 1),
      now,
    ),
    false,
  );
});

test("pairing READY requires fresh healthy authenticated Watcher evidence", () => {
  const now = new Date("2026-08-24T22:00:00.000Z");
  const valid = {
    watcherSeenAt: new Date(now.getTime() - 10_000),
    watcherHealthy: true,
    watcherIdentityHash: "a".repeat(64),
    now,
  };

  assert.equal(
    isWarGraphPairingReadyWatcherEvidence(valid),
    true,
  );

  assert.equal(
    isWarGraphPairingReadyWatcherEvidence({
      ...valid,
      watcherHealthy: false,
    }),
    false,
  );

  assert.equal(
    isWarGraphPairingReadyWatcherEvidence({
      ...valid,
      watcherIdentityHash: null,
    }),
    false,
  );

  assert.equal(
    isWarGraphPairingReadyWatcherEvidence({
      ...valid,
      watcherSeenAt: new Date(
        now.getTime() -
          WARGRAPH_WATCHER_FRESH_MS -
          1,
      ),
    }),
    false,
  );
});
