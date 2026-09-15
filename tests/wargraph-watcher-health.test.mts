import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWarGraphWatcherHealth,
  isWarGraphPairingReadyWatcherEvidence,
  isWarGraphWatcherHeartbeatFresh,
  WARGRAPH_WATCHER_FRESH_MS,
} from "../lib/wargraph/watcherHealthContract.ts";
import {
  retryPrismaWriteConflict,
} from "../lib/wargraph/prismaRetry.ts";

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


test("Watcher health transaction retries bounded P2034 conflicts", async () => {
  const delays: number[] = [];
  let attempts = 0;

  const result =
    await retryPrismaWriteConflict(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw Object.assign(new Error("write conflict"), { code: "P2034" });
        }
        return "projected";
      },
      async (delayMs) => {
        delays.push(delayMs);
      },
    );

  assert.equal(result, "projected");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [15, 30]);
});

test("Watcher health transaction does not retry non-P2034 errors", async () => {
  const delays: number[] = [];
  let attempts = 0;
  const error = Object.assign(new Error("database unavailable"), { code: "P1001" });

  await assert.rejects(
    retryPrismaWriteConflict(
      async () => {
        attempts += 1;
        throw error;
      },
      async (delayMs) => {
        delays.push(delayMs);
      },
    ),
    (caught: unknown) => caught === error,
  );

  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test("Watcher health transaction stops after four P2034 attempts", async () => {
  const delays: number[] = [];
  let attempts = 0;
  const error = Object.assign(new Error("write conflict"), { code: "P2034" });

  await assert.rejects(
    retryPrismaWriteConflict(
      async () => {
        attempts += 1;
        throw error;
      },
      async (delayMs) => {
        delays.push(delayMs);
      },
    ),
    (caught: unknown) => caught === error,
  );

  assert.equal(attempts, 4);
  assert.deepEqual(delays, [15, 30, 45]);
});
