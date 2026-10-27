import test from "node:test";
import assert from "node:assert/strict";
import {sentinelPublicProjection,SENTINEL_PUBLIC_SCHEMA} from "../lib/aoe2StorageSentinelEvents.ts";
test("unsigned/missing evidence is UNKNOWN/HOLD without pretending LIVE",()=>{
 const p=sentinelPublicProjection(null);
 assert.equal(p.schema,SENTINEL_PUBLIC_SCHEMA);
 assert.equal(p.admission,"HOLD");assert.equal(p.live,false);
 assert.deepEqual(p.unresolved,[]);
});
test("operator private events project only allowlisted anonymized text",()=>{
 const data={schema:"aoe2war.storage-sentinel.private-projection.v1",
 last_ingested_at:"2026-10-27T19:59:00Z",token:"PRIVATE_KEY",
 unresolved:[{plane:"hel1-volume-105319120",rule:"snapshot_admission_hold",
   severity:"CRITICAL",observed_at:"2026-10-27T19:58:00Z",coverage:"partial",
   reason:"SNAPSHOT_88_PERCENT_HOLD",mountpoint:"/mnt/HC_Volume_105319120",
   source_sha:"a".repeat(40),receipt_digest:"b".repeat(64)}]};
 const p=sentinelPublicProjection(data,new Date("2026-10-27T20:00:00Z"));
 assert.equal(p.live,false);
 assert.equal(p.unresolved[0].age_seconds,120);
 const text=JSON.stringify(p);
 for(const s of ["/mnt/","source_sha","receipt_digest","PRIVATE_KEY","token","mountpoint"])
  assert.equal(text.includes(s),false,s);
});
test("malformed rules, future clocks, arbitrary sensitive strings refuse",()=>{
 const payload={schema:"aoe2war.storage-sentinel.private-projection.v1",
  unresolved:[{plane:"mac",rule:"storage_pressure",severity:"HOLD",
  observed_at:"2026-10-27T20:50:00Z",coverage:"complete",reason:"SECRET/path"}]};
 const p=sentinelPublicProjection(payload,new Date("2026-10-27T20:00:00Z"));
 assert.equal(p.unresolved.length,0);
});
