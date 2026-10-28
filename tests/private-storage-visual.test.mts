import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOG_CATALOG, EMPTY_VISUAL, signVisualPayloadForTests, verifyVisualReceipt } from "../lib/storageVisualPrivate.ts";
import { projectPrivateStorage } from "../lib/storageCommandCenterProjection.ts";

const key="ab".repeat(32),now=new Date("2026-10-28T22:00:00Z");
const payload={
 schema:"aoe2war.storage-visual.private.v1",
 generated_at:"2026-10-28T21:59:00Z",
 planes:[
  {id:"mac",observed_at:"2026-10-28T21:58:00Z",coverage:"PARTIAL",
   hogs:[
    {key:"CROSSOVER_STEAM_REPLAY",gross_allocated_bytes:80000000000,overlaps:false},
    {key:"DOWNLOADS",gross_allocated_bytes:12499197952,overlaps:true}],
   events:[{id:"run_20261028_test1",at:"2026-10-28T21:57:00Z",kind:"NEXT_REVIEW",
     category:"DOWNLOADS",bytes:100000000,transaction_digest:null}]}
 ]};
function signed(body:unknown=payload){return {schema:"aoe2war.storage-visual.signed.v1",payload:body,signature_hmac_sha256:signVisualPayloadForTests(body,key)};}
function changed(fn:(v:any)=>void){const v=JSON.parse(JSON.stringify(payload));fn(v);return signed(v)}
const route=readFileSync("app/api/admin/storage-os/route.ts","utf8");
const page=readFileSync("app/admin/storage-os/page.tsx","utf8");
const explorer=readFileSync("components/storage-os/StorageVisualExplorer.tsx","utf8");
const reader=readFileSync("lib/storageVisualPrivate.ts","utf8");

test("valid HMAC view renders gross categories only, policy-defined protection levels",()=>{
 const v=verifyVisualReceipt(signed(),key,now);
 assert.equal(v.source,"SIGNED_PRIVATE_RECEIPT");
 assert.equal(v.planes.length,1);
 assert.equal(v.planes[0].status,"RECEIPT");
 assert.equal(v.planes[0].coverage,"PARTIAL");
 assert.equal(v.planes[0].hogs[0].level,4);
 assert.equal(v.planes[0].hogs[1].level,2);
 assert.match(v.planes[0].hogs[0].label,/CrossOver/);
 assert.equal(v.planes[0].events[0].kind,"NEXT_REVIEW");
 assert.equal(projectPrivateStorage(null,null,now,v).visual.source,"SIGNED_PRIVATE_RECEIPT");
 assert.equal(projectPrivateStorage(null,null,now).visual.source,"NONE");
 assert.equal(EMPTY_VISUAL.planes.length,0);
});
test("tampered, unsigned, weak-key and counterfeit schemas fail closed",()=>{
 assert.throws(()=>verifyVisualReceipt({...signed(),signature_hmac_sha256:"0".repeat(64)},key,now),/SIGNATURE_INVALID/);
 assert.throws(()=>verifyVisualReceipt({schema:"aoe2war.storage-visual.signed.v1",payload},key,now),/UNSIGNED/);
 assert.throws(()=>verifyVisualReceipt(signed(),"bad",now),/KEY_NOT_CONFIGURED/);
 assert.throws(()=>verifyVisualReceipt({...signed(),schema:"old"},key,now),/SCHEMA_HOLD/);
});
test("names, bytes, mount/plane/category identity and overlaps have strict bounds",()=>{
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].hogs[0].key="/Users/private/secret"),key,now),/HOG_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].hogs[0].gross_allocated_bytes=-1),key,now),/HOG_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].hogs[0].gross_allocated_bytes=Number.MAX_VALUE),key,now),/HOG_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].hogs.push({...v.planes[0].hogs[0]})),key,now),/HOG_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].id="hel1-root"),key,now),/HOG_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].coverage="DISJOINT"),key,now),/DISJOINT_CONTRADICTION/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes.push(v.planes[0])),key,now),/PLANE_DUPLICATE/);
 assert.deepEqual(HOG_CATALOG.CROSSOVER_STEAM_REPLAY.planes,["mac"]);
});
test("forged delete/prune claims and raw filenames are rejected",()=>{
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].events[0].kind="PRUNE_RECEIPT"),key,now),/PRUNE_RECEIPT_MISSING/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].events[0].category="/private/financial.csv"),key,now),/EVENT_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].events[0].bytes=-1),key,now),/EVENT_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].events[0].id="../secret"),key,now),/EVENT_INVALID/);
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.planes[0].events.push(v.planes[0].events[0])),key,now),/EVENT_INVALID/);
});
test("stale and future timestamps are identified without changing evidence",()=>{
 const stale=verifyVisualReceipt(signed(),key,new Date("2026-11-03T22:00:00Z"));
 assert.equal(stale.planes[0].status,"STALE");
 assert.throws(()=>verifyVisualReceipt(changed(v=>v.generated_at="2026-11-30T20:00:00Z"),key,now),/DATE_INVALID/);
});
test("private source has no unsigned fallback, no mutation methods and no scanner",()=>{
 assert.match(route,/requireAdmin\(request\)/);
 assert.match(route,/readPrivateStorageVisual\(\)/);
 assert.match(route,/private, no-store/);
 assert.doesNotMatch(route,/export async function (POST|DELETE|PUT|PATCH)/);
 assert.match(reader,/O_NOFOLLOW/);
 assert.match(reader,/timingSafeEqual/);
 assert.doesNotMatch(reader,/child_process|execFile\(|spawn\(|rmSync\(|unlink\(/);
 assert.match(page,/<StorageVisualExplorer visual=\{data\?\.visual\}/);
 assert.match(explorer,/NO VERIFIED HOG FEED/);
 assert.match(explorer,/GROSS ALLOCATIONS · MAY OVERLAP/);
 assert.match(explorer,/PRUNE RECEIPT/);
 assert.doesNotMatch(explorer,/onClick=\{[^\n]*delete|method: "POST"/i);
});
