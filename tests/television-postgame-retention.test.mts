import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { effectiveStreamRetentionMs, MIN_POSTGAME_MEDIA_MS, postgameMediaProtected } from "../lib/streamPostgameRetention.ts";

test("even an operator override of one millisecond cannot shorten postgame video below 15 minutes", () => {
  assert.equal(MIN_POSTGAME_MEDIA_MS, 15*60*1000);
  assert.equal(effectiveStreamRetentionMs(1, 6*60*60*1000), MIN_POSTGAME_MEDIA_MS);
  assert.equal(effectiveStreamRetentionMs(NaN, 10_000), MIN_POSTGAME_MEDIA_MS);
  assert.equal(effectiveStreamRetentionMs(Infinity, 22_000), MIN_POSTGAME_MEDIA_MS);
  assert.equal(effectiveStreamRetentionMs(6*60*60*1000, 0), 6*60*60*1000);
});

test("media remains protected until the actual postgame deadline, fail closed for missing/future/invalid timestamps", () => {
  const now = new Date("2026-10-10T10:00:00.000Z");
  const stamp = age => new Date(now.getTime()-age);
  assert.equal(postgameMediaProtected(stamp(MIN_POSTGAME_MEDIA_MS-1), now), true);
  assert.equal(postgameMediaProtected(stamp(MIN_POSTGAME_MEDIA_MS), now), false);
  assert.equal(postgameMediaProtected(stamp(MIN_POSTGAME_MEDIA_MS+1), now), false);
  assert.equal(postgameMediaProtected(stamp(-1_000), now), true);
  assert.equal(postgameMediaProtected(null, now), true);
  assert.equal(postgameMediaProtected(new Date(NaN), now), true);
});

test("scheduled cleanup and both operator deletion paths share the same enforcement", () => {
  const cleanup = readFileSync("lib/streamCleanup.ts", "utf8");
  const vault = readFileSync("app/api/admin/video-vault/route.ts", "utf8");
  const retained = readFileSync("lib/retainedStreamDemo.ts", "utf8");
  const retainedApi = readFileSync("app/api/admin/streams/retained-demo/route.ts", "utf8");
  assert.match(cleanup,/CHUNK_RETENTION_MS = effectiveStreamRetentionMs/);
  assert.match(cleanup,/postgameMediaProtected\(stream\.endedAt \?\? stream\.updatedAt, now\)/);
  assert.match(vault,/postgameMediaProtected\(stream\.endedAt \?\? stream\.updatedAt\)/);
  assert.match(vault,/STREAM_POSTGAME_MEDIA_PROTECTED/);
  assert.match(retained,/postgameMediaProtected\(stream\.endedAt \?\? stream\.updatedAt\)/);
  assert.match(retainedApi,/error instanceof PostgameMediaProtectedError/);
  assert.match(retainedApi,/STREAM_POSTGAME_MEDIA_PROTECTED/);
});

test("operator receives an explicit protection deadline; UI cannot present an enabled delete button early", () => {
  const vaultApi = readFileSync("app/api/admin/video-vault/route.ts","utf8");
  const dashboard = readFileSync("components/admin/VideoVaultDashboard.tsx","utf8");
  assert.match(vaultApi,/postgameProtected: \["ended", "failed"\]/);
  assert.match(vaultApi,/postgameUntil: \["ended", "failed"\]/);
  assert.match(vaultApi,/MIN_POSTGAME_MEDIA_MS/);
  assert.match(dashboard,/row\.postgameProtected/);
  assert.match(dashboard,/Postgame protected until/);
  assert.match(dashboard,/&& !row\.retained && !row\.postgameProtected|&&!row\.retained&&!row\.postgameProtected/);
  assert.match(dashboard,/if\(row\.retained\|\|row\.postgameProtected\|\|/);
});

test("stale cleanup rechecks heartbeat and video writer state instead of ending recovered cameras", () => {
  const cleanup = readFileSync("lib/streamCleanup.ts","utf8");
  const lock = cleanup.indexOf("await lockVideoChunkWriter(tx, stream.id)");
  const conditional = cleanup.indexOf("lastHeartbeatAt: { lt: staleBefore }",lock);
  const update = cleanup.indexOf("await tx.gameWatchStream.updateMany(",lock);
  assert.ok(lock>0 && update>lock && conditional>update);
  assert.match(cleanup,/status: \{ in: \["starting", "live"\] \}/);
  assert.match(cleanup,/batch = staleStreams\.slice\(offset, offset \+ 8\)/);
  assert.match(cleanup,/ended: endedStaleCount/);
});
