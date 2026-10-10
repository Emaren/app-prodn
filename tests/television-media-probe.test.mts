import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {readFileSync} from "node:fs";

const root=await mkdtemp(path.join(os.tmpdir(),"aoe2war-video-probe-"));
process.env.AOE2_STREAM_STORAGE_DIR=root;
const {probeTelevisionMediaSamples}=await import("../lib/televisionMediaProbe.ts");
const {streamChunkPath}=await import("../lib/streamStorage.ts");
test.after(async()=>{await rm(root,{recursive:true,force:true})});

async function sample(streamId:number,seq:number,bytes:number[]) {
  const target=streamChunkPath(streamId,seq);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,new Uint8Array(bytes));
}
const ebml=[0x1a,0x45,0xdf,0xa3,1,2];
test("sample presence checks WebM initial signature and latest segment only",async()=>{
  await sample(990001,0,ebml);
  await sample(990001,15,[1,2,3,4,5]);
  const result=await probeTelevisionMediaSamples(990001,15);
  assert.equal(result.status,"samples_present");
  assert.equal(result.initPresent,true);
  assert.equal(result.tailPresent,true);
  assert.match(result.note,/continuity\/playback unverified/);
});
test("missing/expired tail never claims saved recording still exists",async()=>{
  await sample(990002,0,ebml);
  const result=await probeTelevisionMediaSamples(990002,11);
  assert.equal(result.status,"missing_samples");
  assert.equal(result.initPresent,true);
  assert.equal(result.tailPresent,false);
});
test("wrong WebM header is visibly unproven rather than playable",async()=>{
  await sample(990003,0,[0,1,2,3,4]);
  const result=await probeTelevisionMediaSamples(990003,0);
  assert.equal(result.status,"invalid_webm_header");
});
test("invalid stream identifiers fail before filesystem access",async()=>{
  assert.equal((await probeTelevisionMediaSamples(-1,0)).status,"invalid_metadata");
  assert.equal((await probeTelevisionMediaSamples(1,-1)).status,"invalid_metadata");
  assert.equal((await probeTelevisionMediaSamples(1,2_000_001)).status,"invalid_metadata");
});
test("read-only bounded probe cannot enumerate/full-read video or delete media",()=>{
  const probe=readFileSync("lib/televisionMediaProbe.ts","utf8");
  const route=readFileSync("app/api/admin/television-readiness/route.ts","utf8");
  assert.match(probe,/Buffer\.allocUnsafe\(4\)/);
  assert.match(probe,/await handle\.read\(prefix, 0, 4, 0\)/);
  assert.doesNotMatch(probe,/readdir|rm\(|unlink|writeFile|readFile\(/);
  assert.match(route,/const totalSampleLimit = 32/);
  assert.match(route,/requireAdmin\(request\)/);
  assert.doesNotMatch(route,/deleteMany|removeStreamChunks|\$executeRaw/);
});
