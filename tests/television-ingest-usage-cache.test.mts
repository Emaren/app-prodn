import test from "node:test";
import assert from "node:assert/strict";
import {promises as fs,readFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";

const base=await fs.mkdtemp(path.join(os.tmpdir(),"aoe2war-tv-ingest-cost-"));
process.env.AOE2_STREAM_STORAGE_DIR=base;
process.env.AOE2_STREAM_MIN_FREE_BYTES=String(1024*1024*1024);
const storage=await import("../lib/streamStorage.ts");

test("sequential one-second camera writes avoid rescanning every previous chunk",async()=>{
  const streamId=9876501;
  const original=fs.readdir;
  let scans=0;
  (fs as unknown as {readdir:typeof fs.readdir}).readdir=((...args:Parameters<typeof fs.readdir>)=>{
    if(String(args[0])===storage.streamChunkDir(streamId)) scans++;
    return (original as (...args:Parameters<typeof fs.readdir>)=>ReturnType<typeof fs.readdir>)(...args);
  }) as typeof fs.readdir;
  try {
    const a=await storage.writeStreamChunk(streamId,0,Buffer.from([1,2,3,4,5]));
    const b=await storage.writeStreamChunk(streamId,1,Buffer.from([6,7,8]));
    const c=await storage.writeStreamChunk(streamId,2,Buffer.from([9,10]));
    assert.equal(a.created,true);
    assert.equal(b.usage.chunkCount,2);
    assert.deepEqual(c.usage,{chunkCount:3,totalBytes:10,latestSequence:2});
    assert.equal(scans,1,"only the first write needs a full directory reconciliation");
    const retry=await storage.writeStreamChunk(streamId,2,Buffer.from([9,10]));
    assert.equal(retry.created,false);
    assert.equal(scans,1,"idempotent duplicates do not create stat storms");
    await assert.rejects(
      ()=>storage.writeStreamChunk(streamId,2,Buffer.from([99])),
      storage.StreamChunkConflictError,
    );
    assert.equal(scans,1);
    // Another process writes a complete immutable chunk. Directory fingerprint
    // invalidates the cached count before our next admission decision.
    await fs.writeFile(storage.streamChunkPath(streamId,3),Buffer.from([11,12,13,14]));
    const afterForeign=await storage.writeStreamChunk(streamId,4,Buffer.from([15]));
    assert.deepEqual(afterForeign.usage,{chunkCount:5,totalBytes:15,latestSequence:4});
    assert.equal(scans,2,"out-of-process directory modification forces an exact reconciliation");
    await storage.removeStreamChunks(streamId);
    const reset=await storage.writeStreamChunk(streamId,0,Buffer.from([1,2]));
    assert.deepEqual(reset.usage,{chunkCount:1,totalBytes:2,latestSequence:0});
    assert.equal(scans,3,"directory removal invalidates cached usage");
  } finally {
    (fs as unknown as {readdir:typeof fs.readdir}).readdir=original;
  }
});
test("precise disk reads remain available for Vault and retention audit",async()=>{
  const streamId=9876502;
  await Promise.all([0,1,2].map(i=>storage.writeStreamChunk(streamId,i,Buffer.from([i,10+i]))));
  const exact=await storage.getStreamStorageUsage(streamId);
  assert.deepEqual(exact,{chunkCount:3,totalBytes:6,latestSequence:2});
  await storage.removeStreamChunks(streamId);
});
test("cache remains fingerprint-fenced, periodically reconciled and capped",()=>{
  const s=readFileSync("lib/streamStorage.ts","utf8");
  assert.match(s,/WRITE_USAGE_RECONCILE_MS = 5 \* 60 \* 1000/);
  assert.match(s,/MAX_WRITE_USAGE_CACHE_STREAMS = 128/);
  assert.match(s,/streamDirectoryFingerprint\(dir\)/);
  assert.match(s,/stat\(dir, \{ bigint: true \}\)/);
  assert.match(s,/if \(fingerprint !== after\)/);
  assert.match(s,/streamWriteUsageCache.delete\(key\)/);
  assert.match(s,/for \(let i=0;i<filenames.length;i\+=64\)/);
  assert.match(s,/const capacity = streamCapacityAdmission\(freeBytes, data.byteLength\)/);
  assert.doesNotMatch(s,/\.stream-usage\.json|fs\.appendFile/);
});
test.after(async()=>{await fs.rm(base,{recursive:true,force:true})});
