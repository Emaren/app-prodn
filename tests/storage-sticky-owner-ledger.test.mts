import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {appendTeachingEvent,readTeachingEvents} from "../lib/storageHogTeachingLedger.ts";
import {strongestRecordedProtection,categoryReviewEvidence} from "../lib/storageHogTeachingPolicy.ts";
const OWNER="a".repeat(64);
const BASE={plane:"mac" as const,category:"DOWNLOADS",
  sourceObservedAt:"2026-11-20T12:00:00.000Z",
  sourceFingerprint:"f".repeat(64),grossBytes:4096,sourceFloor:2 as const,
  overlaps:false,note:"Owner explicit protection",ownerBinding:OWNER};
const oldKeys=["AOE2WAR_OS_STORE_DIR","AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY",
  "AOE2WAR_STORAGE_VISUAL_HMAC_KEY"];
test("real signed append-only writer rejects stronger L4 → later L2 and immutable L5 downgrade",async()=>{
 const state=await mkdtemp(path.join(tmpdir(),"teaching-sticky-"));
 await mkdir(path.join(state,"state"),{mode:0o700});
 const env=Object.fromEntries(oldKeys.map(k=>[k,process.env[k]]));
 try {
  Object.assign(process.env,{
   AOE2WAR_OS_STORE_DIR:state,
   AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY:"c".repeat(64),
   AOE2WAR_STORAGE_VISUAL_HMAC_KEY:"d".repeat(64),
  });
  const l4=await appendTeachingEvent({...BASE,requestedLevel:4,previousId:null});
  assert.equal(l4.effectiveLevel,4);
  const replayed=await readTeachingEvents();
  assert.equal(replayed.length,1);
  assert.equal(strongestRecordedProtection(replayed,"mac","DOWNLOADS"),4);
  await assert.rejects(
    appendTeachingEvent({...BASE,requestedLevel:2,previousId:l4.id,
      sourceObservedAt:"2026-11-20T13:00:00.000Z"}),
    /TEACHING_OWNER_STRONGER_PROTECTION_HOLD/,
  );
  await assert.rejects(
    appendTeachingEvent({...BASE,requestedLevel:3,previousId:l4.id}),
    /TEACHING_OWNER_STRONGER_PROTECTION_HOLD/,
  );
  assert.equal((await readTeachingEvents()).length,1,"reject never writes partial event");
  const l5=await appendTeachingEvent({...BASE,requestedLevel:5,previousId:l4.id,
    note:"Never delete this category"});
  assert.equal(l5.effectiveLevel,5);
  await assert.rejects(
    appendTeachingEvent({...BASE,requestedLevel:4,previousId:l5.id}),
    /TEACHING_PROTECTED_LEVEL_HOLD/,
  );
  assert.equal((await readTeachingEvents()).length,2);
 } finally {
  for(const k of oldKeys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
  await rm(state,{recursive:true,force:true});
 }
});
test("historical stronger inherited floor and L4 deny survive later L2 feedback",()=>{
 const h=(n:number,level:2|3|4|5=2,sourceFloor:2|3|4|5=2)=>({
   ...BASE,sourceObservedAt:new Date(Date.parse("2026-11-20T12:00:00Z")+n*60_000).toISOString(),
   requestedLevel:level,effectiveLevel:Math.max(sourceFloor,level) as 2|3|4|5,
   sourceFloor,reviewVersion:"category-review-v1",
 }) as never;
 const latest="2026-11-20T15:00:00.000Z";
 const scope={plane:"mac" as const,category:"DOWNLOADS",
   observedAt:latest,sourceFloor:2 as const,overlaps:false};
 const history=[h(-180,4),h(-120),h(-90)];
 assert.equal(categoryReviewEvidence(history,scope,OWNER,Date.parse(latest)).finding,"PROTECTED");
 assert.equal(categoryReviewEvidence([h(-180,2,3),h(-120),h(-90)],
   scope,OWNER,Date.parse(latest)).finding,"PROTECTED");
 assert.equal(categoryReviewEvidence([h(-180,5),h(-120),h(-90)],
   scope,OWNER,Date.parse(latest)).finding,"PROTECTED");
});
