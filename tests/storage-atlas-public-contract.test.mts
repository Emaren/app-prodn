import assert from "node:assert/strict";
import test from "node:test";
import {STORAGE_ATLAS_PRIVATE_SCHEMA,STORAGE_ATLAS_PUBLIC_SCHEMA,toStorageAtlasPublicSnapshot}
 from "../lib/aoe2StorageAtlasPublicContract.ts";

const source=()=>({
 schema:STORAGE_ATLAS_PRIVATE_SCHEMA,kind:"aoe2war-storage-atlas-snapshot",
 assembled_at:"2026-10-27T14:00:00Z",
 planes:["mac","hel1-root","hel1-volume-105319120"].map(plane=>({
  plane,observed_at:"2026-10-27T13:59:00Z",ttl_seconds:300,stale:false,
  coverage:"complete",severity:"OBSERVE",
  filesystem:{mount_source:"/dev/secret",uuid:"private-uuid",mountpoint:"/Users/example"},
  source:{secret_key:"PRIVATE",source_sha:"a".repeat(40)},
  consumers:[{class:"generated_rebuildable",path:"/Users/example/.codex/secret-private"}],
  capacity:{effective_used_percent:65,ordinary_free_bytes:6000000000},
  measured_reclaimed_bytes:999999999999,
  post_cleanup_receipt:{verified:true,private_recovery_key:"secret"}
 }))
});
const now=new Date("2026-10-27T14:00:00Z");
test("Storage Atlas emits pathless typed JSON, never action or invented gain",()=>{
 const out=toStorageAtlasPublicSnapshot(source(),now);
 assert.equal(out.schema,STORAGE_ATLAS_PUBLIC_SCHEMA);
 assert.equal(out.live,false);assert.equal(out.admission,"HOLD");
 assert.equal(out.financial_or_cleanup_authority,false);
 assert.equal(out.planes.length,3);
 assert.equal(out.planes[0].stale,false);
 assert.equal(out.planes[0].ordinary_free_bytes,6000000000);
 assert.equal(out.planes[0].measured_reclaimed_bytes,null);
 const bytes=JSON.stringify(out);
 for(const forbidden of ["/Users/","/dev/","source_sha","secret","uuid","mountpoint","post_cleanup_receipt","private_recovery_key"])
  assert.equal(bytes.includes(forbidden),false,forbidden);
});
test("stale or partial telemetry cannot look healthy",()=>{
 const old=toStorageAtlasPublicSnapshot(source(),new Date("2026-10-27T17:01:00Z"));
 assert.equal(old.planes.every(x=>x.stale&&x.severity==="HOLD"),true);
 const p=source();p.planes[0].coverage="partial";
 const view=toStorageAtlasPublicSnapshot(p,now);
 assert.equal(view.planes[0].severity,"HOLD");
});
test("unknown, duplicate and missing plane refuse publication",()=>{
 const incomplete=source();incomplete.planes.pop();
 assert.throws(()=>toStorageAtlasPublicSnapshot(incomplete,now),/HOLD/);
 const duplicate=source();duplicate.planes[1].plane="mac";
 assert.throws(()=>toStorageAtlasPublicSnapshot(duplicate,now),/HOLD/);
});
test("malformed timestamps, future dates and nonnumeric capacity are held",()=>{
 const bad=source();bad.planes[0].observed_at="tomorrow";
 assert.equal(toStorageAtlasPublicSnapshot(bad,now).planes[0].severity,"HOLD");
 const future=source();future.assembled_at="2026-10-29T13:00:00Z";
 assert.throws(()=>toStorageAtlasPublicSnapshot(future,now),/HOLD/);
 const fake=source();fake.planes[0].capacity.ordinary_free_bytes=-999;
 assert.equal(toStorageAtlasPublicSnapshot(fake,now).planes[0].ordinary_free_bytes,null);
});
