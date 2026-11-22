import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {BAE_SCHEMA,LANE_GATES,projectStorageBaeTopology} from "../lib/storageBaeReadContract.ts";

type StorageArg=Parameters<typeof projectStorageBaeTopology>[0];
type IntelArg=Parameters<typeof projectStorageBaeTopology>[1];
type AckArg=Parameters<typeof projectStorageBaeTopology>[2];
const HERE=dirname(fileURLToPath(import.meta.url));
const now=new Date("2026-11-22T02:20:00Z");
function storage(){
 const visual={
  source:"SIGNED_PRIVATE_RECEIPT",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",
  planes:[
   {id:"mac",observedAt:"2026-11-22T02:10:00Z",status:"RECEIPT",coverage:"PARTIAL",
    hogs:[{key:"RECOVERY_VAULT",label:"Protected vault",level:5,grossBytes:100,overlaps:true}],
    events:[]},
   {id:"hel1-root",observedAt:"2026-11-22T02:10:00Z",status:"RECEIPT",coverage:"PARTIAL",hogs:[],events:[]},
   {id:"hel1-volume-105319120",observedAt:"2026-11-22T02:10:00Z",status:"RECEIPT",coverage:"PARTIAL",hogs:[],events:[]},
  ],
 };
 return {visual,planes:["mac","hel1-root","hel1-volume-105319120"].map(id=>({
  id,source:"NONE",status:"UNKNOWN",freeBytes:null,usedPercent:null
 }))};
}
const intelUnknown={
 source:"NONE",health:"HOLD",observedAt:null,
 reason:"INTEL_WE2_ROOT_NOT_ADMITTED",
 capacity:{availableBytes:null},tenants:[],objects:null,
};
const ack={
 submissionId:"a".repeat(64),receivedAt:"2026-11-22T02:18:20Z",
 storedSha256:"b".repeat(64),
 acceptedSourceIds:["mac","hel1-root","hel1-volume-105319120"],
 evidence:"ROOT_RECEIVER_LEDGER_AND_HMAC_STATE_HASH_MATCH",
 replayProtection:"DURABLE_UNIQUE_SUBMISSION_LEDGER_PRESENT_REPLAY_DENIAL_NOT_CHALLENGED",
};
test("fixed four surfaces and exactly five prescribed lanes across three physical hosts",()=>{
 const x=projectStorageBaeTopology(storage() as unknown as StorageArg,intelUnknown as unknown as IntelArg,null,now);
 assert.equal(x.schema,BAE_SCHEMA);
 assert.equal(x.authority,"ADMIN_READ_ONLY_NO_TRANSFER_OR_RETIREMENT");
 assert.deepEqual(x.machines.map(m=>m.id),["mac","hel1-root","hel1-volume-105319120","intel"]);
 assert.deepEqual(x.lanes.map(l=>l.id),[
  "m1_hel1_operator","m1_intel_archive","hel1_recovery_intel","hel1_root_volume","hel1_intel_direct"]);
 assert.equal(x.physicalHostCount,3);
 assert.equal(x.machineCount,4);
 assert.equal(x.laneCount,5);
 assert.deepEqual(Object.keys(x.lanes[0].gates),[...LANE_GATES]);
});
test("gross overlapping HMAC receipts never create certified capacity or reclaim",()=>{
 const x=projectStorageBaeTopology(storage() as unknown as StorageArg,intelUnknown as unknown as IntelArg,ack as unknown as AckArg,now);
 const mac=x.machines[0];
 assert.equal(mac.trust,"SERVER_HMAC_VERIFIED_NOT_SOURCE_RECHECK");
 assert.equal(mac.grossInventory.present,true);
 assert.equal(mac.grossInventory.categoryCount,1);
 assert.equal(mac.grossInventory.grossReportedBytes,100);
 assert.equal(mac.certifiedCapacity.present,false);
 assert.equal(mac.certifiedCapacity.availableBytes,null);
 assert.equal(x.receipts.certifiedReclaimedBytes,null);
 assert.equal(x.receipts.activeReplayDenialTest,"NOT_PERFORMED");
 assert.equal(x.receipts.lastDurableAck?.submissionId,ack.submissionId);
 assert.ok(x.lanes.every(l=>l.gates["RETIREMENT ELIGIBLE"]==="NOT_PROVEN"));
});
test("zero signed hog buckets means signed partial observation, not empty disk capacity",()=>{
 const x=projectStorageBaeTopology(storage() as unknown as StorageArg,intelUnknown as unknown as IntelArg,null,now);
 assert.equal(x.machines[1].grossInventory.present,true);
 assert.equal(x.machines[1].grossInventory.categoryCount,0);
 assert.equal(x.machines[1].certifiedCapacity.present,false);
});
test("estate snapshot free bytes alone are not certified",()=>{
 const d=storage() as unknown as StorageArg;
 Object.assign(d.planes[0],{id:"mac",status:"RECEIPT",source:"OPERATOR_ESTATE_SNAPSHOT",
  freeBytes:1234,usedPercent:null});
 const m=projectStorageBaeTopology(d,intelUnknown as unknown as IntelArg,null,now).machines[0];
 assert.equal(m.certifiedCapacity.present,false);
 assert.equal(m.certifiedCapacity.availableBytes,null);
});
test("only separately admitted signed current capacity is surfaced",()=>{
 const d=storage() as unknown as StorageArg;
 Object.assign(d.planes[0],{id:"mac",status:"RECEIPT",source:"WE2_NATIVE_V2_SIGNED_PLANE",
  freeBytes:1234,usedPercent:null});
 const m=projectStorageBaeTopology(d,intelUnknown as unknown as IntelArg,null,now).machines[0];
 assert.equal(m.certifiedCapacity.present,true);
 assert.equal(m.certifiedCapacity.availableBytes,1234);
 assert.equal(m.certifiedCapacity.usedPercent,null);
});
test("signed Intel remains independent and unavailable until source admission",()=>{
 const x=projectStorageBaeTopology(storage() as unknown as StorageArg,intelUnknown as unknown as IntelArg,null,now);
 assert.equal(x.machines[3].trust,"NOT_ADMITTED");
 assert.equal(x.machines[3].certifiedCapacity.present,false);
 assert.ok(x.lanes.every(l=>l.gates["COPY AUTHORIZED"]==="NOT_PROVEN"));
});
test("signed tenant historical transfer/restore do not authorize future copy, hashes, retirement",()=>{
 const intel={...intelUnknown,source:"SIGNED_PRIVATE_RECEIPT",health:"ONLINE",
  observedAt:"2026-11-22T02:15:00Z",capacity:{availableBytes:45000},
  tenants:[{id:"WE2",identity:"ISOLATED",namespace:"M1-ARCHIVE",
   lastTransfer:{campaign:"M1X",ciphertextSha256:"c".repeat(64),observedAt:"2026-11-21T23:00:00Z"},
   lastRestore:{campaign:"M1R",sourceSha256:"d".repeat(64),restoredSha256:"d".repeat(64),observedAt:"2026-11-21T23:10:00Z"}}]};
 const x=projectStorageBaeTopology(storage() as unknown as StorageArg,intel as unknown as IntelArg,null,now);
 const lane=x.lanes[1];
 assert.equal(x.machines[3].trust,"INTEL_WE2_DERIVED_ED25519");
 assert.equal(lane.gates["TRANSFERRED"],"VERIFIED");
 assert.equal(lane.gates["RESTORE VERIFIED"],"VERIFIED");
 for(const gate of ["COPY AUTHORIZED","HASH VERIFIED","RETIREMENT ELIGIBLE"] as const)
  assert.equal(lane.gates[gate],"NOT_PROVEN");
 assert.equal(x.lanes[2].gates["TRANSFERRED"],"NOT_PROVEN");
});
test("stale observation cannot count as a current inventory",()=>{
 const d=storage() as unknown as StorageArg;
 d.visual.planes[0].status="STALE";
 const m=projectStorageBaeTopology(d,intelUnknown as unknown as IntelArg,null,now).machines[0];
 assert.equal(m.grossInventory.present,false);
 assert.equal(m.grossInventory.categoryCount,null);
 assert.equal(m.freshness,"STALE");
});
test("route stays existing-admin authenticated and avoids privileged actions",async()=>{
 const s=await readFile(resolve(HERE,"../app/api/admin/storage-os/bae/route.ts"),"utf8");
 assert.match(s,/requireAdmin\(request\)/);
 assert.match(s,/private, no-store/);
 assert.match(s,/readPrivateStorageVisual\(now\)/);
 assert.match(s,/readIntelColdEvidence\(now\)/);
 assert.match(s,/storage-visual-bridge-acks\.v1/);
 assert.doesNotMatch(s,/child_process|execSync\(|spawnSync\(|fetch\(|POST\(/);
});

test("verified historical HEL1-recovery object never grants a fresh direct transfer or retirement",()=>{
 const intel={...intelUnknown,source:"SIGNED_PRIVATE_RECEIPT",health:"DEGRADED",
  observedAt:"2026-11-22T02:15:00Z",
  objects:[{namespace:"HEL1-RECOVERY",contentSha256VerifiedNow:true,
    restore:"HISTORICAL_RESTORE_PROOF_PRESENT"}],
  tenants:[]};
 const x=projectStorageBaeTopology(storage() as unknown as StorageArg,intel as unknown as IntelArg,null,now);
 const lane=x.lanes[2];
 assert.equal(lane.gates["TRANSFERRED"],"VERIFIED");
 assert.equal(lane.gates["HASH VERIFIED"],"VERIFIED");
 assert.equal(lane.gates["RESTORE VERIFIED"],"VERIFIED");
 assert.equal(lane.gates["COPY AUTHORIZED"],"NOT_PROVEN");
 assert.equal(lane.gates["RETIREMENT ELIGIBLE"],"NOT_PROVEN");
 assert.equal(x.lanes[4].gates["TRANSFERRED"],"NOT_PROVEN");
 assert.equal(x.machines[3].certifiedCapacity.present,false);
});
test("protected ACK reader must reauthenticate exact hashed visual bytes",async()=>{
 const source=await readFile(resolve(HERE,"../app/api/admin/storage-os/bae/route.ts"),"utf8");
 assert.match(source,/verifyVisualReceipt\(envelope,hmacKey,now\)/);
 assert.match(source,/createHash\("sha256"\)\.update\(bytes\)/);
 assert.match(source,/record\.stored_sha256!==hash/);
 assert.match(source,/O_NOFOLLOW/);
 assert.match(source,/DURABLE_UNIQUE_SUBMISSION_LEDGER_PRESENT_REPLAY_DENIAL_NOT_CHALLENGED/);
});
