import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {StorageCommandCenter} from "../lib/storageCommandCenterProjection.ts";
import type {IntelColdView} from "../lib/intelColdStorageEvidence.ts";
import {baeNodes,baeRecentObservations,verifiedFrames,BAE_DEFAULT_MODE,BAE_STORAGE_KEY,validMode,ageLabel}
  from "../components/storage-os/storageBaeEvidence.ts";

const basic=readFileSync("components/storage-os/StorageHogWorkbench.tsx","utf8");
const views=readFileSync("components/storage-os/StorageBaeViews.tsx","utf8");
const topologies=readFileSync("components/storage-os/StorageBaeTopologies.tsx","utf8");
const helper=readFileSync("components/storage-os/storageBaeEvidence.ts","utf8");
const transport=readFileSync("components/storage-os/StorageTransportLaneStatus.tsx","utf8");
const now=Date.parse("2026-11-22T02:00:00Z");
const at="2026-11-22T01:40:00Z";

function model(plane?:Record<string,unknown>,visual?:Record<string,unknown>){
  return {
    bridgeOnline:true,bridgeLastSeen:at,
    planes:plane?[plane]:[],
    visual: visual??{source:"NONE",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[]},
  } as unknown as StorageCommandCenter;
}
function reading(source:string,age=at){
  return {id:"mac",status:"RECEIPT",source,asOf:age,freeBytes:123456789,
    reclaimedBytes:999999999,usedPercent:88};
}
test("Basic is the persisted-mode fallback and impossible values never select a view",()=>{
  assert.equal(BAE_DEFAULT_MODE,"B");
  assert.equal(BAE_STORAGE_KEY,"aoe2war.storage-os.bae-mode.v1");
  assert.equal(validMode("B"),true);assert.equal(validMode("A"),true);
  assert.equal(validMode("E"),true);assert.equal(validMode("X"),false);
  assert.equal(validMode(null),false);
  assert.match(basic,/useState<BaeMode>\(BAE_DEFAULT_MODE\)/);
  assert.match(basic,/window\.localStorage\.getItem\(BAE_STORAGE_KEY\)/);
  assert.match(basic,/window\.localStorage\.setItem\(BAE_STORAGE_KEY,next\)/);
  assert.match(basic,/if\(mode!=="B"\)return <StorageBaeViews/);
  assert.match(basic,/<BaeModeSwitch mode=\{mode\} onChange=\{changeMode\}/);
});
test("original Basic capacity, hierarchy and classification controls remain",()=>{
  for(const t of ["Four independently verified storage planes","Interactive capacity anatomy",
    "Biggest storage hogs","Record classification",
    "StorageTeachingHistory","StoragePremiumInspector","StorageReviewQueue"]){
    assert.ok(basic.includes(t),t);
  }
  assert.match(basic,/teachingSourceDeadline\(sourcePlane\.observedAt,chosen\)/);
});
test("three computers with four surfaces render UNKNOWN by default; no invented byte zero",()=>{
  const nodes=baeNodes(null,null,now);
  assert.deepEqual(nodes.map(n=>n.id),[
    "mac","hel1-root","hel1-volume-105319120","intel"
  ]);
  for(const n of nodes){
    assert.equal(n.status,"UNKNOWN");
    assert.equal(n.availableBytes,null);
    assert.equal(n.grossReportedBytes,null);
    assert.equal(n.reclaimableBytes,null);
    assert.match(n.durableAck,/UNKNOWN/);
    assert.equal(n.ageLabel,"UNKNOWN");
  }
  assert.equal(baeRecentObservations(nodes).length,0);
});
test("unsigned estate capacity cannot become a signed-source PASS or unique reclaim",()=>{
  const nodes=baeNodes(model(reading("OPERATOR_ESTATE_SNAPSHOT")),null,now);
  const mac=nodes[0];
  assert.equal(mac.status,"HOLD");
  assert.equal(mac.availableBytes,123456789);
  assert.equal(mac.capacityEvidence,"UNSIGNED ESTATE SNAPSHOT");
  assert.match(mac.sourceTrust,/unsigned estate snapshot/);
  assert.equal(mac.reclaimableBytes,null);
  assert.equal(baeRecentObservations(nodes).length,0);
});
test("server HMAC gross categories do not imply a source signer or durable receiver ACK",()=>{
  const visual={source:"SIGNED_PRIVATE_RECEIPT",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[
    {id:"mac",observedAt:at,status:"RECEIPT",hogs:[
      {key:"M1_RELEASE_CACHE",label:"cache",grossBytes:900,level:4,overlaps:true},
      {key:"DOWNLOADS",label:"downloads",grossBytes:100,level:2,overlaps:true},
    ]}
  ]};
  const mac=baeNodes(model(undefined,visual),null,now)[0];
  assert.equal(mac.status,"HOLD");
  assert.equal(mac.grossReportedBytes,1000);
  assert.equal(mac.grossCategoryCount,2);
  assert.equal(mac.reclaimableBytes,null);
  assert.match(mac.sourceTrust,/server HMAC only/);
  assert.match(mac.sourceHmacAtRead,/not checked/);
  assert.match(mac.durableAck,/UNKNOWN/);
});
test("qualified current source can PASS source trust only, never transport permission",()=>{
  const mac=baeNodes(model(reading("WE2_NATIVE_V2_SIGNED_PLANE")),null,now)[0];
  assert.equal(mac.status,"PASS");
  assert.equal(mac.ageLabel,"20 MIN");
  assert.equal(mac.capacityEvidence,"SIGNED CAPACITY");
  assert.match(mac.durableAck,/UNKNOWN/);
  assert.equal(mac.reclaimableBytes,null);
  assert.equal(baeRecentObservations([mac]).length,1);
});
test("independently signed Intel source displays fourth node, but archival copy never implied",()=>{
  const intel={source:"SIGNED_PRIVATE_RECEIPT",health:"ONLINE",observedAt:at,
    capacity:{availableBytes:900000000},objects:[{restore:"HISTORICAL_RESTORE_PROOF_PRESENT"}]};
  const fourth=baeNodes(null,intel as unknown as IntelColdView,now)[3];
  assert.equal(fourth.id,"intel");
  assert.equal(fourth.status,"PASS");
  assert.equal(fourth.availableBytes,900000000);
  assert.equal(fourth.reclaimableBytes,null);
  assert.match(fourth.durableAck,/UNKNOWN/);
  const hold=baeNodes(null,{...intel,health:"HOLD"} as unknown as IntelColdView,now)[3];
  assert.equal(hold.status,"HOLD");
  assert.equal(hold.availableBytes,null);
});
test("stale or future-drift source never reads as current qualified observation",()=>{
  const past="2026-11-19T01:00:00Z";
  const stale={...reading("SIGNED_THREE_PLANE_RECEIPT",past),status:"STALE"};
  assert.equal(baeNodes(model(stale),null,now)[0].status,"STALE");
  assert.equal(ageLabel("2026-11-24T01:00:00Z",now),"CLOCK DRIFT");
});
test("HEL1 signed zero-category v1 means NOT SCANNED and gross bytes UNKNOWN",()=>{
  const visual={source:"SIGNED_PRIVATE_RECEIPT",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[
    {id:"hel1-root",observedAt:at,status:"RECEIPT",coverage:"PARTIAL",hogs:[],events:[]},
    {id:"hel1-volume-105319120",observedAt:at,status:"RECEIPT",coverage:"PARTIAL",hogs:[],events:[]},
  ]};
  const planes=baeNodes(model(undefined,visual),null,now);
  for(const id of ["hel1-root","hel1-volume-105319120"]){
    const node=planes.find(n=>n.id===id);
    assert.ok(node);
    assert.equal(node.inventoryStatus,"NOT SCANNED");
    assert.equal(node.grossCategoryCount,0);
    assert.equal(node.grossReportedBytes,null);
    assert.equal(node.availableBytes,null);
    assert.equal(node.status,"HOLD");
    assert.equal(node.reclaimableBytes,null);
  }
  assert.match(basic,/Signed gross categories: 0 · NOT SCANNED FOR HOGS/);
  assert.match(basic,/This is not an empty filesystem/);
  assert.match(basic,/notScanned=\{hel1HogsNotScanned\}/);
});
test("real measured HEL1 categories can appear without claiming unique reclaim",()=>{
  const visual={source:"SIGNED_PRIVATE_RECEIPT",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[
    {id:"hel1-root",observedAt:at,status:"RECEIPT",coverage:"PARTIAL",hogs:[
      {key:"HEL1_ROOT_SYSTEM",grossBytes:321,level:5,overlaps:true},
    ],events:[]},
  ]};
  const root=baeNodes(model(undefined,visual),null,now)[1];
  assert.equal(root.inventoryStatus,"PARTIAL / GROSS");
  assert.equal(root.grossCategoryCount,1);
  assert.equal(root.grossReportedBytes,321);
  assert.equal(root.reclaimableBytes,null);
  assert.match(root.durableAck,/UNKNOWN/);
});
test("BAE means Basic / Advanced / Extreme only; three hosts, four storage surfaces",()=>{
  assert.match(views,/Advanced relationships view/);
  assert.match(views,/m==="A"\?"Advanced":"Extreme"/);
  assert.match(views,/BAE \/ \{extreme\?"EXTREME":"ADVANCED"\}/);
  assert.match(views,/Three physical computers, four distinct storage surfaces/);
  assert.match(topologies,/Three computers · four measured surfaces/);
  assert.match(topologies,/ONE computer, TWO independently signed filesystem surfaces/);
  assert.match(topologies,/HOST 02 \/ HEL1 \/ TWO FILESYSTEMS/);
  assert.match(topologies,/HOST 03 \/ ENCRYPTED DESTINATION/);
  assert.doesNotMatch(views,/(?:ATLAS|Atlas)/);
  assert.doesNotMatch(topologies,/(?:ATLAS|Atlas)/);
  assert.match(views,/role="group" aria-label="Storage Explorer BAE view mode"/);
  assert.match(views,/aria-pressed=\{mode===m\}/);
  assert.equal((basic.match(/<IntelDrive/g)||[]).length,1,"only original Basic Intel tile");
});
test("Advanced and Extreme are distinct, wide, accessible and inspectable",()=>{
  assert.match(views,/AdvancedTopology nodes=\{nodes\} onInspect=\{onInspect\}/);
  assert.match(views,/ExtremeTopology nodes=\{nodes\}/);
  assert.match(views,/ExtremeEvidenceTimeline nodes=\{nodes\} intel=\{intel\}/);
  assert.match(topologies,/Selected relationship evidence/);
  assert.match(topologies,/Select one of five transport lanes/);
  assert.match(topologies,/aria-pressed=\{laneId===l.id\}/);
  assert.match(topologies,/Selected lane seven-stage evidence chain/);
  assert.match(topologies,/Inspect actual storage categories in Basic/);
  assert.match(topologies,/Extreme three-computer spatial command deck/);
  assert.match(views,/max-w-\[1840px\]/);
  assert.match(views,/max-w-none/);
  assert.match(topologies,/aria-label="Authenticated evidence history time scrubber"/);
  assert.match(topologies,/type="range"/);
  assert.match(topologies,/disabled=\{frames.length===0\}/);
  assert.match(views,/prefers-reduced-motion:reduce/);
  assert.match(topologies,/No SVG animation when there is no authenticated live transport event/);
  assert.doesNotMatch(topologies,/keyframes|animation:bae/);
  assert.doesNotMatch(topologies,/fetch\(|XMLHttpRequest|WebSocket|EventSource|method:"POST"|navigator\./);
  assert.doesNotMatch(topologies,/<form\b|type="submit"|href="\/api/);
});
test("five original lanes and seven gates remain independently unadmitted",()=>{
  assert.match(views,/TRANSPORT_LANES\.map\(/);
  assert.match(views,/TRANSPORT_STEPS\.map\(/);
  assert.match(views,/Five source-owned transport relationships/);
  assert.match(topologies,/TRANSPORT_LANES\.map\(/);
  assert.match(topologies,/TRANSPORT_STEPS\.map\(/);
  assert.match(transport,/export const TRANSPORT_LANES=LANES;/);
  assert.match(transport,/export const TRANSPORT_STEPS=STEPS;/);
  assert.match(views,/NOT ADMITTED/);
  assert.match(topologies,/STATIC ROUTE TRACE · BLOCKED/);
  assert.doesNotMatch(helper,/reclaimableBytes:[^\n]*[1-9]/);
});
test("time scrubber only shows authenticated, dated frames; never invent movement",()=>{
  assert.deepEqual(verifiedFrames(baeNodes(null,null,now),null),[]);
  const mac=baeNodes(model(reading("WE2_NATIVE_V2_SIGNED_PLANE")),null,now);
  assert.equal(verifiedFrames(mac,null).length,1);
  const intel={
    source:"SIGNED_PRIVATE_RECEIPT",health:"ONLINE",tenants:[
      {id:"WE2",lastTransfer:{campaign:"ArchiveTest2026",ciphertextSha256:"a".repeat(64),observedAt:at},
        lastRestore:{campaign:"RestoreTest2026",sourceSha256:"b".repeat(64),restoredSha256:"b".repeat(64),observedAt:at}},
    ],
  } as unknown as IntelColdView;
  const frames=verifiedFrames(mac,intel);
  assert.equal(frames.length,3);
  assert.ok(frames.some(f=>f.kind==="INDEPENDENT HISTORICAL RESTORE"));
  assert.ok(frames.some(f=>f.kind==="HISTORICAL INTEL ARCHIVE RECEIPT"));
  assert.ok(frames.every(f=>f.detail.includes("NOT")||f.detail.includes("UNKNOWN")));
  const stale={...intel,health:"STALE"} as unknown as IntelColdView;
  assert.equal(verifiedFrames(mac,stale).length,1);
});
test("small dark-background text uses legible contrast and avoids clipped UNKNOWN labels",()=>{
  assert.doesNotMatch(basic,/text-slate-500/);
  assert.doesNotMatch(views,/text-slate-500/);
  assert.doesNotMatch(topologies,/text-slate-500/);
  assert.match(basic,/break-words text-xl font-black/);
  assert.match(basic,/Not certified/);
});

test("optional authenticated ACK cannot break the original Basic Explorer on read failure",()=>{
  assert.match(basic,/fetch\("\/api\/admin\/storage-os\/bae"/);
  assert.match(basic,/\.catch\(\(\)=>null\)/);
  assert.match(basic,/if\(c\?\.ok\)/);
  assert.match(basic,/catch\{setBaeTopology\(null\);\}/);
  assert.match(basic,/setData\(storage\);setError\(null\)/);
  assert.match(basic,/Last authenticated Bridge ingress ACK/);
  assert.match(views,/BRIDGE INGRESS ACK VERIFIED · HISTORICAL/);
  assert.match(views,/No file-copy ACK, live transfer or retirement permission/);
});
