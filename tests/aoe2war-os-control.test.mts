import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bridgeIsOnline,
  claimNextAoe2OsRun,
  completeAoe2OsRun,
  confirmationMatches,
  createAoe2OsRun,
  loadAoe2OsDashboard,
  readAoe2OsRun,
  writeAoe2OsBridgeHeartbeat,
  writeAoe2OsSnapshot,
  appendAoe2OsRunEvent,
  type Aoe2OsBridgeHeartbeat,
} from "../lib/aoe2Os.ts";

async function withStore(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "aoe2war-os-test-"));
  const previous = process.env.AOE2WAR_OS_STORE_DIR;
  process.env.AOE2WAR_OS_STORE_DIR = root;
  try {
    await fn(root);
  } finally {
    if (previous === undefined) delete process.env.AOE2WAR_OS_STORE_DIR;
    else process.env.AOE2WAR_OS_STORE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}

test("confirmation policy is server-side", () => {
  assert.equal(confirmationMatches("audit", ""), true);
  assert.equal(confirmationMatches("doctor", ""), true);
  assert.equal(confirmationMatches("update_apply", "UPDATE"), true);
  assert.equal(confirmationMatches("update_apply", "update"), false);
  assert.equal(confirmationMatches("deploy", "DEPLOY"), true);
  assert.equal(confirmationMatches("finish", "FINISH"), true);
  assert.equal(confirmationMatches("finish", "finish"), false);
});

test("bridge online window is deterministic", () => {
  const heartbeat: Aoe2OsBridgeHeartbeat = {
    bridgeId: "bridge",
    hostname: "host",
    platform: "test",
    version: "1",
    capabilities: ["audit"],
    currentRunId: null,
    lastSeenAt: new Date(100_000).toISOString(),
  };
  assert.equal(bridgeIsOnline(heartbeat, 120_000, 45_000), true);
  assert.equal(bridgeIsOnline(heartbeat, 200_000, 45_000), false);
});

test("file-backed control plane queues, claims, streams and completes", async () => {
  await withStore(async () => {
    await writeAoe2OsBridgeHeartbeat({
      bridgeId: "bridge",
      hostname: "host",
      platform: "test",
      version: "1",
      capabilities: ["audit"],
      currentRunId: null,
    });

    const run = await createAoe2OsRun({
      action: "audit",
      requestedByUserId: 1,
      requestedByUid: "admin",
      parameters: { message: "ignored by audit", dryRun: true },
    });
    assert.equal(run.status, "queued");
    assert.equal((await readAoe2OsRun(run.id))?.parameters?.dryRun, true);

    await assert.rejects(
      createAoe2OsRun({
        action: "status",
        requestedByUserId: 1,
        requestedByUid: "admin",
      })
    );

    const claimed = await claimNextAoe2OsRun("bridge");
    assert.equal(claimed?.id, run.id);
    assert.equal(claimed?.status, "claimed");

    await appendAoe2OsRunEvent({
      runId: run.id,
      bridgeId: "bridge",
      kind: "stdout",
      message: "hello",
    });

    await completeAoe2OsRun({
      runId: run.id,
      bridgeId: "bridge",
      exitCode: 0,
      result: { ok: true },
      stdoutTail: "hello",
    });

    await writeAoe2OsSnapshot({
      bridgeId: "bridge",
      runId: run.id,
      sourceAction: "audit",
      payload: {
        estate: "HEALTHY",
        p0: 0,
        p1: 0,
        generated_at: new Date().toISOString(),
      },
    });

    const dashboard = await loadAoe2OsDashboard();
    assert.equal(dashboard.activeRun, null);
    assert.equal(dashboard.recentRuns[0]?.status, "succeeded");
    assert.equal(dashboard.snapshot?.estate, "HEALTHY");
  });
});
