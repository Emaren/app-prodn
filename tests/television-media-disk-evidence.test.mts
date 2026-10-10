import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateTelevisionMediaPresence} from "../lib/televisionMediaProbe.ts";

const check=(sequences:number[],opts:Partial<{
  expectedCount:number;initBytes:number|null;lastChunkBytes:number|null;initMagicValid:boolean|null;
}>={})=>evaluateTelevisionMediaPresence({
  streamId:17,expectedCount:opts.expectedCount??3,sequences,
  initBytes:opts.initBytes===undefined?144:opts.initBytes,
  lastChunkBytes:opts.lastChunkBytes===undefined?400:opts.lastChunkBytes,
  initMagicValid:opts.initMagicValid===undefined?true:opts.initMagicValid,
});

test("three existing contiguous WebM slices with EBML initialization are a disk candidate, never playback proof",()=>{
  const a=check([0,1,2]);
  assert.equal(a.status,"candidate_bytes_present");
  assert.equal(a.hasContinuousSequence,true);
  assert.equal(a.observedChunkCount,3);
  assert.equal(a.playbackCertified,false);
});
test("missing, skipped and headerless chunks do not count as a whole recorded game",()=>{
  assert.equal(check([]).status,"missing_directory");
  assert.equal(check([1,2]).status,"missing_init");
  assert.equal(check([0,2]).status,"incomplete_sequences");
  assert.equal(check([0,1]).status,"incomplete_sequences");
  assert.equal(check([0]).status,"incomplete_sequences");
  assert.equal(check([0,1,2],{lastChunkBytes:0}).status,"incomplete_sequences");
});
test("spoofed or corrupt WebM init never gets archive status",()=>{
  assert.equal(check([0,1,2],{initMagicValid:false}).status,"invalid_init");
  assert.equal(check([0,1,2],{initBytes:2}).status,"incomplete_sequences");
  assert.equal(check([0,1,2],{initMagicValid:null}).status,"incomplete_sequences");
});
test("read-only bounded probe does not scan complete media payload or mutate storage",()=>{
  const source=readFileSync("lib/televisionMediaProbe.ts","utf8");
  const route=readFileSync("app/api/admin/television-readiness/route.ts","utf8");
  const page=readFileSync("components/admin/TelevisionReadinessPanel.tsx","utf8");
  assert.match(source,/const MAX_ENTRIES_PER_CAMERA = 20_000/);
  assert.match(source,/const prefix=Buffer.alloc\(WEBM_EBML.length\)/);
  assert.match(source,/await fs.readdir\(dir, \{ withFileTypes: true \}\)/);
  assert.doesNotMatch(source,/fs.writeFile|fs.unlink|fs.rm|fs.rename|fs.copyFile/);
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/MAX_DISK_PROBES = 16/);
  assert.match(route,/inspectTelevisionMediaDisk\(id, expectedCount\)/);
  assert.match(route,/playback_unverified/);
  assert.match(page,/Retention automation: DISABLED/);
  assert.doesNotMatch(route,/removeStreamChunks|deleteMany|updateMany|executeRaw/);
});
