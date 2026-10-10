import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFileSync } from "node:fs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "aoe2war-television-media-audit-"));
process.env.AOE2_STREAM_STORAGE_DIR = root;
const { inspectOneVideoStream, inspectTelevisionMediaInventory } =
  await import("../lib/televisionMediaAudit.ts");

async function record(id:number, seqs:number[]) {
  const dir = path.join(root, String(id));
  await fs.mkdir(dir, {recursive:true});
  for (const n of seqs) await fs.writeFile(path.join(dir, n+".webm"),
    Buffer.from(n===0?[0x1a,0x45,0xdf,0xa3,0x05]:[1,2,3,4,5]));
}

test("media inventory certifies only exact on-disk 0..N sequences and registry agreement", async () => {
  await record(1001, [0,1,2]);
  const x=await inspectOneVideoStream({id:1001,chunkCount:3,latestChunkSeq:2});
  assert.equal(x.state,"sequence_complete");
  assert.equal(x.actualBytes,15);
  assert.equal(x.missingSequenceCount,0);
  assert.equal(x.playbackProven,false);
});
test("broken or absent initialization, missing segments and registry drift never pass", async () => {
  await record(1002,[1,3]);
  const g=await inspectOneVideoStream({id:1002,chunkCount:2,latestChunkSeq:3});
  assert.equal(g.state,"gapped_media");
  assert.equal(g.missingSequenceCount,2);
  const drift=await inspectOneVideoStream({id:1001,chunkCount:4,latestChunkSeq:3});
  assert.equal(drift.state,"gapped_media");
  const miss=await inspectOneVideoStream({id:1004,chunkCount:4,latestChunkSeq:3});
  assert.equal(miss.state,"missing_media");
  assert.equal(miss.actualBytes,0);
});
test("empty and invalid WebM segments do not produce fake playable evidence", async () => {
  await fs.mkdir(path.join(root,"1005"),{recursive:true});
  const empty=await inspectOneVideoStream({id:1005,chunkCount:1,latestChunkSeq:0});
  assert.equal(empty.state,"empty_media");
  await fs.writeFile(path.join(root,"1005","0.webm"), Buffer.alloc(0));
  const invalid=await inspectOneVideoStream({id:1005,chunkCount:1,latestChunkSeq:0});
  assert.equal(invalid.state,"unreadable_media");
});
test("a perfectly numbered archive with an invalid WebM header remains unverified",async()=>{
  await record(1006,[0,1,2]);
  await fs.writeFile(path.join(root,"1006","0.webm"),Buffer.from([1,2,3,4,5]));
  const bad=await inspectOneVideoStream({id:1006,chunkCount:3,latestChunkSeq:2});
  assert.equal(bad.state,"invalid_webm_header");
  assert.equal(bad.playbackProven,false);
  assert.equal(bad.actualBytes,15);
});
test("a header-only recording cannot masquerade as a complete POV",async()=>{
  await record(1007,[0]);
  const only=await inspectOneVideoStream({id:1007,chunkCount:1,latestChunkSeq:0});
  assert.notEqual(only.state,"sequence_complete");
});
test("multi-POV audit is deduplicated, bounded and never certifies playback",async()=>{
  const result=await inspectTelevisionMediaInventory([
    {id:1001,chunkCount:3,latestChunkSeq:2},
    {id:1001,chunkCount:3,latestChunkSeq:2},
    {id:1002,chunkCount:2,latestChunkSeq:3},
  ]);
  assert.equal(result.scanned,2);
  assert.equal(result.completeSequences,1);
  assert.equal(result.allPlaybackProven,false);
});
test("admin audit is bounded, authorization-gated and incapable of deleting video",()=>{
  const source=readFileSync("lib/televisionMediaAudit.ts","utf8");
  const api=readFileSync("app/api/admin/television-readiness/route.ts","utf8");
  const ui=readFileSync("components/admin/TelevisionReadinessPanel.tsx","utf8");
  assert.match(source,/MAX_INSPECTED_CHUNKS = 5_000/);
  assert.match(source,/WEBM_EBML_HEADER/);
  assert.match(source,/Buffer.alloc\(WEBM_EBML_HEADER.length\)/);
  assert.match(source,/MAX_STREAM_PROBES = 16/);
  assert.match(source,/CACHE_MS = 60_000/);
  assert.match(api,/requireAdmin\(request\)/);
  assert.match(api,/inspectTelevisionMediaInventory\(expectedStreams\)/);
  assert.match(ui,/Sequence-consistent does NOT prove browser decode/);
  assert.doesNotMatch(source,/fs\.rm\(|fs\.unlink\(|fs\.writeFile\(/);
  assert.doesNotMatch(api,/removeStreamChunks|deleteMany|updateMany/);
});
test.after(async()=>{ await fs.rm(root,{recursive:true,force:true}); });
