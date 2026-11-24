import assert from "node:assert/strict";
import test from "node:test";
import {DIRECTED_ROUTES,LANE_ID_MAP,projectTransferEvidence,type Identity,type Sample,type CopyReceipt,type RestoreReceipt} from "../lib/storageTransferReadModel.ts";
const now=Date.parse("2026-11-24T15:00:00Z"),at="2026-11-24T14:59:00Z";
const id:Identity={campaign:"fixture",objectSha256:"a".repeat(64),ciphertextSha256:"b".repeat(64),
 source:"hel1-volume-105319120",destination:"intel",via:"mac",sourceClass:"historical-runtime"};
const copy:CopyReceipt={...id,receiptSha256:"c".repeat(64),observedAt:at,ciphertextBytes:1000,ackElapsedMs:2000};
const restore:RestoreReceipt={...id,receiptSha256:"d".repeat(64),observedAt:at,restoredSha256:id.objectSha256,restoreElapsedMs:100};
const sample:Sample={...id,observedAt:at,sequence:1,ciphertextBytes:1000,checkpointBytes:400,phaseMs:{source_read:0,encode:20},diagnostic:null};
test("twelve directed routes and explicit five legacy aliases",()=>{
 assert.equal(DIRECTED_ROUTES.length,12);assert.equal(new Set(DIRECTED_ROUTES.map(r=>r.id)).size,12);
 assert.equal(Object.keys(LANE_ID_MAP).length,5);
});
test("exact copy and restoration correlate; no authorization from receipt",()=>{
 const r=projectTransferEvidence(id,[sample],copy,restore,now);
 assert.equal(r.copyVerified,true);assert.equal(r.restoreVerified,true);assert.equal(r.ackBytesPerSecond,500);
 assert.equal(r.copyAuthorized,false);assert.equal(r.retirementAuthorized,false);
 assert.equal(r.phaseMs.source_read,0);assert.equal(r.phaseMs.fsync,null);
});
test("cross-object, campaign, route and ciphertext mismatch cannot join",()=>{
 for(const delta of [{campaign:"other"},{objectSha256:"e".repeat(64)},{source:"hel1-root" as const},{ciphertextSha256:"e".repeat(64)}]){
  assert.equal(projectTransferEvidence(id,[],copy,{...restore,...delta},now).restoreVerified,false);
 }
 assert.equal(projectTransferEvidence(id,[],null,restore,now).restoreVerified,false);
});
test("reject regression, duplicate sequence, oversized checkpoint and future time",()=>{
 for(const next of [{...sample,sequence:2,checkpointBytes:399},{...sample},{...sample,sequence:2,checkpointBytes:1001},
  {...sample,sequence:2,observedAt:"2026-11-25T00:00:00Z"}])
  assert.throws(()=>projectTransferEvidence(id,[sample,next],null,null,now));
});
test("stale observations stay stale; missing counters unknown, measured zero retained",()=>{
 const stale=projectTransferEvidence(id,[sample],null,null,now+3600000);
 assert.equal(stale.freshness,"STALE");assert.equal(stale.diagnostic,"SOURCE_STALE");
 assert.equal(stale.ackBytesPerSecond,null);assert.equal(stale.phaseMs.source_read,0);
 assert.equal(projectTransferEvidence(id,[],null,null,now).freshness,"UNKNOWN");
});
