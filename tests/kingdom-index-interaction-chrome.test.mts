import test from "node:test";
import assert from "node:assert/strict";
import {inspectInteractionReceipt,chromeEnterKeyEvents} from "../scripts/kingdom_index_interaction_chrome.mjs";
const sourceSha="a".repeat(40),buildId="next-exact-build-123";
const expected={sourceSha,buildId};
function fixture(){
 const row=(viewport:string)=>{
  const samples=Array.from({length:10},(_,i)=>100+i*10);
  return {viewport,url:"http://127.0.0.1:3030/kingdom-index",
    viewportWidth:viewport==="desktop"?1440:390,scrollWidth:viewport==="desktop"?1440:390,
    documentStatus:200,reducedMotionEmulated:true,
    accessibility:{axNodeCount:300,namedButtons:25,unnamedButtons:0},
    keyboard:{ledgerActivated:true,mapRestored:true,detailOpened:true,detailClosed:true,focusRestored:true},
    criterionCoverage:{
      apiRoutes:88,sourceCensusRows:88,completePendingRoutes:88,
      profiledRoutes:88,sourceFingerprintedRoutes:88,
      canonicalCriteria:20,canonicalMaximum:100,
      indexSpecializedGates:3,approvedRoutes:0,nullScoreRoutes:88,
      indexOfficialScoreNull:true,indexAuthenticatedEarnedNull:true,
      routeFingerprint:"src-3bcfa463b322f42f",
      detailRows:20,pendingDetailRows:20,approvedDetailRows:0,
      expandedByKeyboard:true
    },
    diagnostics:{snapshots:["initial","after-ledger-enter","after-map-enter","after-inspect-enter","after-close-enter"].map(phase=>({
      phase,href:"http://127.0.0.1:3030/kingdom-index",
      focus:{tag:"BUTTON",name:phase==="after-map-enter"?"Kingdom map":"Inspect Kingdom Index",role:null},
      map:{exists:true},ledger:{exists:true},inspect:{exists:true},close:{exists:true},
      realmVisible:true,ledgerVisible:false,detailVisible:false
    })),screenshots:[],chromeExceptions:[]},
    warm:{samplesMs:samples,p75Ms:167.5,p95Ms:185.5}
  };
 };
 return {schema:1,kind:"aoe2war.kingdom-index.real-interaction.v1",
  sourceSha,buildId,origin:"LOOPBACK_ONLY",route:"/kingdom-index",
  viewports:[row("desktop"),row("phone")],
  certified:false,criterionPointsAwarded:null,limitations:"fixture-not-production"};
}
test("real-shaped warm, AX, keyboard report may be inspected without grading",()=>{
 const inspected=inspectInteractionReceipt(fixture(),expected);
 assert.equal(inspected.valid,true);assert.equal(inspected.keyboardInteractionsObserved,true);
 assert.equal(inspected.horizontalOverflowObserved,false);
 assert.equal(inspected.certified,false);assert.equal(inspected.score,null);
});
test("wrong source, BUILD_ID, route, duplicated viewport and false 100 refuse",()=>{
 for(const change of [
  {sourceSha:"b".repeat(40)},{buildId:"old-build"},{route:"/kingdom-tests"},
  {certified:true}
 ]){
  assert.throws(()=>inspectInteractionReceipt({...fixture(),...change},expected));
 }
 const dup=fixture();dup.viewports[1].viewport="desktop";
 assert.throws(()=>inspectInteractionReceipt(dup,expected));
});
test("measured warm P95, empty AX tree and reduced motion mismatch refuse",()=>{
 const d=fixture();d.viewports[0].warm.p95Ms=1;
 assert.throws(()=>inspectInteractionReceipt(d,expected),/warm cohort/);
 const noAx=fixture();noAx.viewports[1].accessibility.axNodeCount=0;
 assert.throws(()=>inspectInteractionReceipt(noAx,expected));
 const wrongMotion=fixture();wrongMotion.viewports[0].reducedMotionEmulated=false;
 assert.throws(()=>inspectInteractionReceipt(wrongMotion,expected));
});
test("keyboard failure or narrow viewport overflow remains a transparent observation, never credit",()=>{
 const d=fixture();
 d.viewports[0].keyboard.ledgerActivated=false;
 d.viewports[1].scrollWidth=600;
 const v=inspectInteractionReceipt(d,expected);
 assert.equal(v.keyboardInteractionsObserved,false);
 assert.equal(v.horizontalOverflowObserved,true);
 assert.equal(v.certified,false);
});

test("an unopened detail remains a failed close transition, not successful accessible keyboard proof",()=>{
 const doc=fixture();
 doc.viewports[0].keyboard.detailOpened=false;
 doc.viewports[0].keyboard.detailClosed=false;
 doc.viewports[0].keyboard.focusRestored=false;
 const result=inspectInteractionReceipt(doc,expected);
 assert.equal(result.keyboardInteractionsObserved,false);
 assert.equal(result.certified,false);
});

test("CDP Enter sequence synthesizes a native button click, never a rawKeyDown no-op",()=>{
 const events=chromeEnterKeyEvents();
 assert.equal(events.length,2);
 assert.equal(events[0].type,"keyDown");
 assert.equal(events[0].key,"Enter");
 assert.equal(events[0].code,"Enter");
 assert.equal(events[0].text,"\r");
 assert.equal(events[0].windowsVirtualKeyCode,13);
 assert.equal(events[0].nativeVirtualKeyCode,13);
 assert.equal(events[1].type,"keyUp");
 assert.equal(events[1].text,undefined);
 assert.ok(!events.some(event=>event.type==="rawKeyDown"));
});

test("detail focus loss remains a failed keyboard verdict even when close removes panel",()=>{
 const d=fixture();
 d.viewports[0].keyboard.focusRestored=false;
 const report=inspectInteractionReceipt(d,expected);
 assert.equal(report.keyboardInteractionsObserved,false);
 assert.equal(report.certified,false);
});

test("exact emitted Chrome criterion coverage demands 88 distinct pages, 20 obligations and keyboard-visible pending evidence",()=>{
 const doc=fixture();
 assert.equal(inspectInteractionReceipt(doc,expected).valid,true);
 const cases=[
  {apiRoutes:87},{sourceCensusRows:87},{completePendingRoutes:87},
  {profiledRoutes:87},{sourceFingerprintedRoutes:87},{canonicalCriteria:19},
  {canonicalMaximum:99},{indexSpecializedGates:2},
  {approvedRoutes:1},{nullScoreRoutes:87},{indexOfficialScoreNull:false},
  {indexAuthenticatedEarnedNull:false},{routeFingerprint:"src-wrong"},
  {detailRows:19},{pendingDetailRows:19},{approvedDetailRows:1},
  {expandedByKeyboard:false}
 ];
 for(const delta of cases){
   const corrupted=fixture();
   Object.assign(corrupted.viewports[1].criterionCoverage,delta);
   assert.throws(()=>inspectInteractionReceipt(corrupted,expected),
     /Invalid keyboard, AX, viewport or Chrome warm cohort/,
     "Refused false Chrome proof: "+JSON.stringify(delta));
 }
});
