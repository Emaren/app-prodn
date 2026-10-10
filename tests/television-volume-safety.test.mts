import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {streamCapacityAdmission, STREAM_MIN_FREE_BYTES} from "../lib/streamStorage.ts";

test("video admission preserves reserved filesystem free space",()=>{
  const gib=1024*1024*1024;
  assert.deepEqual(streamCapacityAdmission(8*gib, 1*gib, 6*gib), {
    allowed:true, reason:"sufficient_headroom",
  });
  assert.deepEqual(streamCapacityAdmission(6*gib, 1, 6*gib), {
    allowed:false, reason:"volume_reserved_floor",
  });
  assert.deepEqual(streamCapacityAdmission(0, 1, 6*gib), {
    allowed:false, reason:"volume_reserved_floor",
  });
  assert.equal(STREAM_MIN_FREE_BYTES >= gib, true);
});
test("unverified or malformed filesystem capacity fails closed",()=>{
  for(const available of [NaN,Infinity,-1,0.5]){
    assert.equal(streamCapacityAdmission(available,512,1024).allowed,false);
  }
  assert.equal(streamCapacityAdmission(1024,-1,0).allowed,false);
  assert.equal(streamCapacityAdmission(1024,2,NaN).allowed,false);
});
test("actual video writer checks mounted filesystem free bytes before creating a chunk",()=>{
  const text=readFileSync("lib/streamStorage.ts","utf8");
  const writer=text.slice(text.indexOf("export async function writeStreamChunk("));
  const cap=writer.indexOf("getStreamVolumeHeadroom()");
  const write=writer.indexOf("fs.open(temporaryPath");
  assert.ok(cap>=0 && write>cap);
  assert.match(text,/await fs.statfs\(STREAM_STORAGE_ROOT\)/);
  assert.match(text,/Video paused to preserve the mounted filesystem free-space reserve/);
  assert.match(text,/Video storage capacity could not be verified/);
  const api=readFileSync("app/api/admin/video-vault/route.ts","utf8");
  assert.match(api,/volume: volume \?\?/);
  assert.match(readFileSync("components/admin/VideoVaultDashboard.tsx","utf8"),/Verified video-volume free:/);
});
