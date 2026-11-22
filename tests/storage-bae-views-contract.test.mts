import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {baeNodes,baeRecentObservations,BAE_DEFAULT_MODE,BAE_STORAGE_KEY,validMode,ageLabel}
  from "../components/storage-os/storageBaeEvidence.ts";

const basic=readFileSync("components/storage-os/StorageHogWorkbench.tsx","utf8");
const views=readFileSync("components/storage-os/StorageBaeViews.tsx","utf8");
const helper=readFileSync("components/storage-os/storageBaeEvidence.ts","utf8");
const transport=readFileSync("components/storage-os/StorageTransportLaneStatus.tsx","utf8");
const now=Date.parse("2026-11-22T02:00:00Z");
const at="2026-11-22T01:40:00Z";

function model(plane?:Record<string,unknown>,visual?:Record<string,unknown>){
  return {
    bridgeOnline:true,bridgeLastSeen:at,
    planes:plane?[plane]:[],
    visual: visual??{source:"NONE",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[]},
  } as any;
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
    "Biggest storage hogs","Owner classification studio","Record classification",
    "Business domain","Lifecycle","StorageTeachingHistory","StoragePremiumInspector",
    "StorageReviewQueue","StorageReceiptTimeline"]){
    assert.ok(basic.includes(t),t);
  }
  assert.match(basic,/teachingSourceDeadline\(sourcePlane\.observedAt,chosen\)/);
});
test("four independent machines render unknown by default; no invented byte zero",()=>{
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
  const fourth=baeNodes(null,intel as any,now)[3];
  assert.equal(fourth.id,"intel");
  assert.equal(fourth.status,"PASS");
  assert.equal(fourth.availableBytes,900000000);
  assert.equal(fourth.reclaimableBytes,null);
  assert.match(fourth.durableAck,/UNKNOWN/);
  const hold=baeNodes(null,{...intel,health:"HOLD"} as any,now)[3];
  assert.equal(hold.status,"HOLD");
  assert.equal(hold.availableBytes,null);
});
test("stale or future-drift source never reads as current qualified observation",()=>{
  const past="2026-11-19T01:00:00Z";
  const stale={...reading("SIGNED_THREE_PLANE_RECEIPT",past),status:"STALE"};
  assert.equal(baeNodes(model(stale),null,now)[0].status,"STALE");
  assert.equal(ageLabel("2026-11-24T01:00:00Z",now),"CLOCK DRIFT");
});
test("Atlas and Extreme use exactly five source lanes and seven independent gates",()=>{
  assert.match(views,/role="group" aria-label="Storage Explorer BAE view mode"/);
  assert.match(views,/aria-pressed=\{mode===m\}/);
  assert.match(views,/mode==="E"/);
  assert.match(views,/max-w-none/);
  assert.match(views,/TRANSPORT_LANES\.map\(/);
  assert.match(views,/TRANSPORT_STEPS\.map\(/);
  assert.match(views,/Five source-owned transport relationships/);
  assert.match(transport,/export const TRANSPORT_LANES=LANES;/);
  assert.match(transport,/export const TRANSPORT_STEPS=STEPS;/);
  assert.match(views,/NOT ADMITTED/);
});
test("animation respects reduced motion and cannot infer operations",()=>{
  assert.match(views,/prefers-reduced-motion:reduce/);
  assert.match(views,/animation:none!important/);
  assert.match(views,/Animation is decorative/);
  assert.match(views,/Last transport ACK/);
  assert.match(views,/UNKNOWN · NOT VERIFIED/);
  assert.match(views,/Use Basic/);
  assert.doesNotMatch(views,/fetch\(|XMLHttpRequest|WebSocket|EventSource|method:"POST"|navigator\./);
  assert.doesNotMatch(views,/<form\b|type="submit"|href="\/api/);
  assert.doesNotMatch(helper,/reclaimableBytes:[^\n]*[1-9]/);
});
