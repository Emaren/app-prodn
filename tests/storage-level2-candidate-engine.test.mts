import test from "node:test";
import assert from "node:assert/strict";
import {recommendLevel2Category,evaluateLevel2DryRun,STORAGE_L2_POLICY_VERSION} from "../lib/storageLevel2CandidateEngine.ts";
import type {TeachingEvent} from "../lib/storageHogTeachingLedger.ts";

// Synthetic isolated source-bound policy fixtures; NEVER public storage evidence.
const NOW=Date.parse("2026-11-20T20:00:00.000Z");
const at=(n:number)=>new Date(NOW+n*60_000).toISOString();
const OWNER="a".repeat(64);
const other="b".repeat(64);
const scope=(overlaps=false)=>({plane:"mac" as const,category:"DOWNLOADS",sourceFloor:2 as const,
  overlaps,observedAt:at(-5),sourceSigned:true});
function ownerEvent(n:number,override:Record<string,unknown>={}):TeachingEvent{
  return {plane:"mac",category:"DOWNLOADS",sourceFloor:2,overlaps:false,
    ownerBinding:OWNER,reviewVersion:"category-review-v1",
    sourceObservedAt:at(n),requestedLevel:2,effectiveLevel:2,
    note:"Owner recorded a reason for manual Level 2 review",
    ...override} as TeachingEvent;
}
test("without verified signed source or enrolled owner, no candidate is recommended",()=>{
  for(const o of [null,other]){
    const r=recommendLevel2Category([ownerEvent(-120),ownerEvent(-90)],
      {...scope(),sourceSigned:false},o,NOW);
    assert.equal(r.finding,"UNVERIFIED");assert.equal(r.deletionAuthorized,false);
    assert.equal(r.uniqueReclaimableBytes,null);
  }
});
test("new source older than one hour expires precisely at the inclusive boundary",()=>{
  const fresh=recommendLevel2Category([ownerEvent(-120),ownerEvent(-90)],
    {...scope(),observedAt:at(-60)},OWNER,NOW);
  assert.equal(fresh.finding,"REVIEW_SUGGESTED");
  const expired=recommendLevel2Category([ownerEvent(-120),ownerEvent(-90)],
    {...scope(),observedAt:new Date(NOW-3600001).toISOString()},OWNER,NOW);
  assert.equal(expired.finding,"EXPIRED");assert.equal(expired.validUntilUtc,null);
});
test("a single example, cross-owner history, and version mismatch never recommend",()=>{
  const one=recommendLevel2Category([ownerEvent(-120)],scope(),OWNER,NOW);
  assert.equal(one.finding,"NEEDS_EXAMPLES");
  const cross=recommendLevel2Category([ownerEvent(-120),ownerEvent(-90,{ownerBinding:other})],
    scope(),OWNER,NOW);
  assert.notEqual(cross.finding,"REVIEW_SUGGESTED");
  const version=recommendLevel2Category([ownerEvent(-120),ownerEvent(-90,{reviewVersion:"different"})],
    scope(),OWNER,NOW);
  assert.notEqual(version.finding,"REVIEW_SUGGESTED");
});
test("two distinct owner L2 observations give moderate review suggestion, never delete",()=>{
  const r=recommendLevel2Category([ownerEvent(-120),ownerEvent(-90)],scope(),OWNER,NOW);
  assert.equal(r.policyVersion,STORAGE_L2_POLICY_VERSION);
  assert.equal(r.finding,"REVIEW_SUGGESTED");assert.equal(r.confidence,"MODERATE");
  assert.equal(r.exampleCount,2);assert.equal(r.scope,"CATEGORY_ONLY_NOT_A_FILE");
  assert.equal(r.deletionAuthorized,false);assert.equal(r.uniqueReclaimableBytes,null);
  assert.ok(r.explanation.includes("manual inspection only"));
});
test("three distinct observations raise confidence, overlap caps confidence at LOW",()=>{
  const history=[ownerEvent(-180),ownerEvent(-120),ownerEvent(-90)];
  assert.equal(recommendLevel2Category(history,scope(),OWNER,NOW).confidence,"HIGH");
  const overlap=history.map(e=>({...e,overlaps:true}));
  const r=recommendLevel2Category(overlap,scope(true),OWNER,NOW);
  assert.equal(r.confidence,"LOW");assert.ok(r.exceptions.some(x=>x.includes("APFS")));
});
test("signed source floor, prior permanent L5, and already reviewed current data block recommendations",()=>{
  assert.equal(recommendLevel2Category([ownerEvent(-120),ownerEvent(-90)],
    {...scope(),sourceFloor:5},OWNER,NOW).finding,"PROTECTED");
  assert.equal(recommendLevel2Category([ownerEvent(-120),ownerEvent(-90),
    ownerEvent(-70,{requestedLevel:5,effectiveLevel:5})],scope(),OWNER,NOW).finding,"PROTECTED");
  assert.equal(recommendLevel2Category([ownerEvent(-120),ownerEvent(-5)],
    scope(),OWNER,NOW).finding,"ALREADY_REVIEWED");
});
const exact = {
  sourceSigned:true,sourceObservedAt:at(-5),ownerBoundDecision:true,
  sourceFloor:2 as const,effectiveLevel:2 as const,
  itemAlias:"bounded_alias_321",itemFingerprint:"a".repeat(64),sourceDigest:"b".repeat(64),
  allocatedBytes:4096,logicalBytes:8000,overlapResolved:true,dependencyAssessmentPassed:true,
  protectedPathExcluded:true,independentRestoreProven:true,
  ownerPolicyApproved:true,reversiblePlanReviewed:true,
};
test("no proof means no pretend dry run or physical-reclaim estimate",()=>{
  const r=evaluateLevel2DryRun({...exact,sourceSigned:false,independentRestoreProven:false,
    overlapResolved:false,allocatedBytes:null},NOW);
  assert.equal(r.status,"HOLD");assert.ok(r.missing.length>=4);
  assert.equal(r.estimatedPhysicalReclaimBytes,null);
  assert.equal(r.deletionAuthorized,false);assert.equal(r.executorAvailable,false);
});
test("even every hypothetical proof cannot authorize execution",()=>{
  const r=evaluateLevel2DryRun(exact,NOW);
  assert.equal(r.status,"MANUAL_REVIEW_POSSIBLE");
  assert.deepEqual(r.missing,[]);
  assert.equal(r.deletionAuthorized,false);
  assert.equal(r.executorAvailable,false);
  assert.equal(r.estimatedPhysicalReclaimBytes,null);
  assert.ok(r.proposedSteps.some(s=>s.includes("separately approved future executor")));
});
test("protected level, unresolved paths, unsigned identity or stale source are always HOLD",()=>{
  for(const input of [
    {...exact,sourceFloor:5 as const,effectiveLevel:5 as const},
    {...exact,protectedPathExcluded:false},
    {...exact,itemFingerprint:"unsigned"},
    {...exact,sourceObservedAt:at(-61)},
    {...exact,ownerPolicyApproved:false},
  ]){
    const r=evaluateLevel2DryRun(input,NOW);
    assert.equal(r.status,"HOLD");assert.equal(r.deletionAuthorized,false);
  }
});
