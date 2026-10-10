import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  streamCapacityAdmission,
  STREAM_MIN_FREE_BYTES,
  StreamStorageLimitError,
} from "../lib/streamStorage.ts";

const MiB = 1024 * 1024;
test("filesystem reserve admits a video chunk only with adequate post-write headroom", () => {
  const reserve = 6 * 1024 * MiB;
  assert.deepEqual(streamCapacityAdmission(reserve + 8*MiB,8*MiB,reserve),
    {allowed:true,reason:"sufficient_headroom"});
  assert.deepEqual(streamCapacityAdmission(reserve + 8*MiB-1,8*MiB,reserve),
    {allowed:false,reason:"volume_reserved_floor"});
  assert.equal(streamCapacityAdmission(reserve+64*MiB,8*MiB,reserve).allowed,true);
});
test("unknown, overflowing or noninteger capacity fails closed for video", () => {
  for(const invalid of [NaN,Infinity,-1,2**54,0.5]) {
    assert.deepEqual(streamCapacityAdmission(invalid, 16*MiB),
      {allowed:false,reason:"capacity_unverified"});
  }
  assert.equal(streamCapacityAdmission(0,8*MiB).allowed,false);
  assert.equal(streamCapacityAdmission(10*MiB,-1).allowed,false);
  assert.ok(STREAM_MIN_FREE_BYTES>=1024*MiB);
});
test("quota and volume errors carry a safe machine-readable reason", () => {
  const reason=new StreamStorageLimitError("Video volume at floor","volume_reserved_floor");
  assert.equal(reason.reason,"volume_reserved_floor");
  assert.equal(reason.name,"StreamStorageLimitError");
  const storage=readFileSync("lib/streamStorage.ts","utf8");
  const route=readFileSync("app/api/streams/[streamId]/chunks/route.ts","utf8");
  const vault=readFileSync("app/api/admin/video-vault/route.ts","utf8");
  assert.match(storage,/await getStreamVolumeHeadroom\(\)/);
  assert.match(storage,/fs.statfs\(STREAM_STORAGE_ROOT\)/);
  assert.match(route,/code: "STREAM_STORAGE_LIMIT"/);
  assert.match(route,/reason: error.reason, terminal: true/);
  assert.match(route,/data: \{ status: "ended", endedAt: new Date\(\), isPrimary: false \}/);
  assert.match(vault,/getStreamVolumeHeadroom\(\)/);
  assert.doesNotMatch(route,/removeStreamChunks|winnerProof.*update|betWager.update/);
});
