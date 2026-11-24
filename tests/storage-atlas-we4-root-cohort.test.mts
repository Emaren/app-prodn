import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {projectValidatedRuntimeCohort,unknownRuntimeCohort,
  WE4_COHORT_SOURCE_SHA256,WE4_COHORT_GROSS_BYTES}
  from "../lib/storageAtlasGenerationCohort.ts";
const now=new Date("2026-11-22T08:22:06.025Z");
const keep=["9cf670724c82","f50ead889c61","da0bee282e52"];
function fixture(){
 const ids=[...keep,...Array.from({length:23},(_,i)=>(i+1).toString(16).padStart(12,"0"))];
 const small=Math.floor(WE4_COHORT_GROSS_BYTES/26);
 return {
  schema:"we4.hel1.actual-runtime-inventory.v1",count:26,measured_count:26,
  mount_dev:2049,observed_utc:"2026-11-22T04:22:06.025312+00:00",
  reclaim_bytes:null,whole_filesystem_scanned:false,
  rows:ids.map((id,i)=>({
    allocated_bytes:i===25?WE4_COHORT_GROSS_BYTES-small*25:small,
    allocation_status:"MEASURED_SELECTED_TREE",
    build_id:"SyntheticCaseBuild-"+i.toString().padStart(3,"0"),
    device:2049,generation:id,inode:10000+i,
    mode:"0o755",mtime_ns:1795290000000000000,
    source_sha:id+"d".repeat(28)
  }))
 };
}
test("26 exact source generation totals are GROSS only, never unique reclaim",()=>{
 const p=projectValidatedRuntimeCohort(fixture(),now);
 assert.equal(p.measuredCount,26);
 assert.equal(p.rows.length,26);
 assert.equal(p.measuredGrossBytes,41255313408);
 assert.equal(p.sourceHash,WE4_COHORT_SOURCE_SHA256);
 assert.equal(p.status,"SOURCE_ONLY_DIGEST_PINNED_NOT_SIGNED");
 assert.equal(p.signedSourceAtRead,false);
 assert.equal(p.liveDependenciesCheckedNow,false);
 assert.equal(p.uniqueReclaimBytes,null);
 assert.equal(p.fullFilesystemCensus,false);
 assert.equal(p.rows.filter(x=>x.disposition.startsWith("KEEP")).length,3);
 for(const row of p.rows){
  assert.equal(row.deleteAuthorized,false);
  assert.equal(row.transferAuthorized,false);
  assert.equal(row.uniqueReclaimBytes,null);
  assert.match(row.sourceSha,/^[0-9a-f]{40}$/);
  assert.ok(row.buildId);
  assert.ok(row.ageSeconds!==null);
 }
});
test("unadmitted baseline hides individual generation identities",()=>{
 const x=unknownRuntimeCohort();
 assert.equal(x.status,"NOT_ADMITTED");
 assert.deepEqual(x.rows,[]);
 assert.equal(x.measuredCount,null);
 assert.equal(x.measuredGrossBytes,null);
 assert.equal(x.sourceObservedAt,null);
 assert.equal(x.reason,"SOURCE_ONLY_NOT_ENROLLED");
});
test("strict 26-row source denies duplicates, incorrect total, false complete crawl and reclaim",()=>{
 const x=fixture();
 x.rows[1].generation=x.rows[0].generation;
 assert.throws(()=>projectValidatedRuntimeCohort(x,now),/HOLD/);
 const y=fixture();y.rows[0].allocated_bytes++;
 assert.throws(()=>projectValidatedRuntimeCohort(y,now),/HOLD/);
 const z=fixture();z.whole_filesystem_scanned=true;
 assert.throws(()=>projectValidatedRuntimeCohort(z,now),/HOLD/);
 const a=fixture();a.reclaim_bytes=1;
 assert.throws(()=>projectValidatedRuntimeCohort(a,now),/HOLD/);
});
test("source SHA, BUILD_ID, filesystem identity and negative observations are strict",()=>{
 for(const change of [
  (x:ReturnType<typeof fixture>)=>{x.rows[0].source_sha="0".repeat(40);},
  (x:ReturnType<typeof fixture>)=>{x.rows[0].build_id="PATH=/tmp/secret";},
  (x:ReturnType<typeof fixture>)=>{x.rows[0].device=8;},
  (x:ReturnType<typeof fixture>)=>{x.rows[0].allocated_bytes=-1;},
  (x:ReturnType<typeof fixture>)=>{x.rows[0].mode="0o777";},
  (x:ReturnType<typeof fixture>)=>{x.rows[0].inode=0;},
  (x:ReturnType<typeof fixture>)=>{x.rows[0].generation="../tmp/private";},
  (x:ReturnType<typeof fixture>)=>{x.rows[0].fake_permit=true;}
 ]){
  const f=fixture();change(f);
  assert.throws(()=>projectValidatedRuntimeCohort(f,now),/HOLD/);
 }
});
test("future, mismatched source clock and incomplete row collections stay on HOLD",()=>{
 const x=fixture();
 assert.throws(()=>projectValidatedRuntimeCohort(x,new Date("2026-11-21T05:00:00Z")),/HOLD|INVALID/);
 const y=fixture();y.rows.pop();
 assert.throws(()=>projectValidatedRuntimeCohort(y,now),/HOLD/);
 const z=fixture();z.observed_utc="2026-11-22T10:22:06.025312+00:00";
 assert.throws(()=>projectValidatedRuntimeCohort(z,now),/HOLD/);
});
test("server-only bounded owner file read has fixed path, digest, NOFOLLOW and auth gate",()=>{
 const code=readFileSync("lib/storageAtlasGenerationCohortServer.ts","utf8");
 const api=readFileSync("app/api/admin/storage-os/atlas/route.ts","utf8");
 const ui=readFileSync("components/storage-os/StorageSpatialAtlas.tsx","utf8");
 assert.match(code,/import "server-only"/);
 assert.match(code,/constants\.O_NOFOLLOW/);
 assert.match(code,/stat\.nlink!==1/);
 assert.match(code,/createHash\("sha256"\)/);
 assert.match(code,/process\.env\.AOE2WAR_ATLAS_WE4_RUNTIME_COHORT_GATE!==SOURCE_GATE/);
 assert.match(code,/const ROOT_RUNTIME_COHORT_SOURCE=/);
 assert.match(code,/["']\/run\/private\/aoe2war-storage-atlas\//);
 assert.doesNotMatch(readFileSync("lib/storageAtlasGenerationCohort.ts","utf8"),
   /\/run\/private\/aoe2war-storage-atlas\//);
 assert.doesNotMatch(code,/readFileSync\(.*process\.env|execSync|spawn\(|ssh/);
 assert.ok(api.indexOf("if(\"error\" in admin)return admin.error;")<
   api.indexOf("await readRuntimeCohort()"));
 assert.match(ui,/26 runtime generations/);
 assert.match(ui,/SOURCE_ONLY_DIGEST_PINNED_NOT_SIGNED/);
 assert.match(ui,/current.id==="hel1-root"/);
 assert.doesNotMatch(ui,/\/run\/private\/aoe2war-storage-atlas/);
});
