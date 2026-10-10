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
