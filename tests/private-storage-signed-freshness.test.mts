import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectSignedFreshness,unknownSignedFreshness} from "../lib/storageSignedFreshness.ts";
import type {StorageVisualView} from "../lib/storageVisualPrivate.ts";

const NOW=new Date("2026-10-29T21:00:00Z");
const receipt=(id:"mac"|"hel1-root"|"hel1-volume-105319120",observedAt:string,status:"RECEIPT"|"STALE"="RECEIPT"):StorageVisualView=>({
 authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",source:"SIGNED_PRIVATE_RECEIPT",
 planes:[{id,observedAt,status,coverage:"PARTIAL",hogs:[],events:[]}]
});
const api=readFileSync("app/api/admin/storage-os/freshness/route.ts","utf8");
const panel=readFileSync("components/storage-os/SignedFreshnessPanel.tsx","utf8");
const page=readFileSync("app/admin/storage-os/page.tsx","utf8");
test("explicit private schema has 3 missing UNKNOWN planes and 0/2, no live",()=>{
 const v=unknownSignedFreshness(NOW);
 assert.equal(v.schema,"aoe2war.storage-os.signed-freshness.v1");
 assert.equal(v.planes.length,3);assert.ok(v.planes.every(x=>x.status==="UNKNOWN"&&x.ageSeconds===null));
 assert.equal(v.macNaturalCyclesVerified,0);assert.equal(v.hel1NaturalCyclesVerified,0);
 assert.equal(v.liveReceiver,"NOT_PROVEN");assert.equal(v.hostPermit,"NOT_PROVEN");
 assert.equal(v.bridgeAck,"UNKNOWN_NOT_IN_SIGNED_VISUAL_CONTRACT");
 assert.equal(v.publicProjection,"UNAVAILABLE");
});
test("existing verified server visual has age but NOT source HMAC read/ACK/schedule witness",()=>{
 const v=projectSignedFreshness(receipt("mac","2026-10-29T20:59:00Z"),NOW);
 assert.equal(v.planes[0].status,"CURRENT_SERVER_SIGNED");
 assert.equal(v.planes[0].ageSeconds,60);
 assert.equal(v.planes[0].serverVisualHmacVerified,true);
 assert.equal(v.planes[0].sourceHmacVerifiedAtRead,false);
 assert.equal(v.planes[0].durableBridgeAckVerified,false);
 assert.equal(v.macNaturalCyclesVerified,0);
 assert.equal(v.planes[1].status,"UNKNOWN");
});
test("stale, future and invalid source time never become green",()=>{
 const old=projectSignedFreshness(receipt("hel1-root","2026-10-28T04:59:00Z","STALE"),NOW);
 assert.equal(old.planes[1].status,"STALE_SERVER_SIGNED");
 assert.equal(old.planes[1].reason,"SERVER_SIGNED_SOURCE_EXPIRED");
 const future=projectSignedFreshness(receipt("mac","2026-10-29T21:01:02Z"),NOW);
 assert.equal(future.planes[0].status,"UNKNOWN");
 assert.equal(future.planes[0].observedAt,null);
 const invalid=projectSignedFreshness(receipt("mac","not-a-date"),NOW);
 assert.equal(invalid.planes[0].status,"UNKNOWN");
});
test("tampered, unsigned and fake ACK replay cannot promote a plane",()=>{
 const v=projectSignedFreshness({source:"NONE",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[]} as StorageVisualView,NOW);
 assert.equal(v.planes[0].status,"UNKNOWN");
 const f=receipt("mac","2026-10-29T20:59:30Z") as StorageVisualView&{ack?:unknown;naturalCycles?:number};
 f.ack={status:"STORED_VERIFIED_READBACK",signature_hmac_sha256:"f".repeat(64),replay:"NEW"};
 f.naturalCycles=2;
 const out=projectSignedFreshness(f,NOW);
 assert.equal(out.bridgeAck,"UNKNOWN_NOT_IN_SIGNED_VISUAL_CONTRACT");
 assert.equal(out.planes[0].durableBridgeAckVerified,false);
 assert.equal(out.macNaturalCyclesVerified,0);
 f.ack={replay:"IDEMPOTENT",signature_hmac_sha256:"a".repeat(64)};
 assert.equal(projectSignedFreshness(f,NOW).macNaturalCyclesVerified,0);
});
test("malformed plane replay/duplicate role does not create second cycle",()=>{
 const f=receipt("mac","2026-10-29T20:59:00Z");f.planes.push({...f.planes[0]});
 const v=projectSignedFreshness(f,NOW);
 assert.equal(v.planes.length,3);
 assert.equal(v.planes.filter(p=>p.status==="CURRENT_SERVER_SIGNED").length,1);
 assert.equal(v.macNaturalCyclesVerified,0);
});
test("source current only when authenticated server viewer; missing auth is UNKNOWN",()=>{
 const unsigned=receipt("mac","2026-10-29T20:59:00Z");
 unsigned.source="NONE";
 assert.equal(projectSignedFreshness(unsigned,NOW).planes[0].status,"UNKNOWN");
});
test("admin route is no-store and only read-only signed server visual",()=>{
 assert.match(api,/requireAdmin\(request\)/);
 assert.match(api,/readPrivateStorageVisual\(now\)/);
 assert.match(api,/projectSignedFreshness\(signed,now\)/);
 assert.match(api,/private, no-store, max-age=0/);
 assert.doesNotMatch(api,/export async function (?:POST|PUT|PATCH|DELETE)/);
 assert.doesNotMatch(api,/child_process|execFile|spawn\(|fs\.write|createHmac|process\.env\.AOE2WAR_STORAGE_VISUAL/);
 assert.match(api,/status:503/);
});
test("visible source-only panel with 375 responsive cards, hold and bounded foreground polling",()=>{
 assert.match(page,/SignedFreshnessPanel\s*\/>/);
 assert.match(panel,/data-testid="c-signed-freshness"/);
 assert.match(panel,/grid gap-3 md:grid-cols-3/);
 assert.match(panel,/Mac scheduled signed:/);
 assert.match(panel,/HEL1 scheduled signed:/);
 assert.match(panel,/0\/2 VERIFIED/);
 assert.match(panel,/UNPROVEN/);
 assert.match(panel,/15_000/);
 assert.match(panel,/document.visibilityState==="visible"/);
 assert.match(panel,/controller\.abort\(\)/);
 assert.match(panel,/cache:"no-store"/);
 assert.doesNotMatch(panel,/method:"POST"|--apply|removeItem|localStorage/);
});
