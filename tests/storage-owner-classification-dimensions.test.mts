import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,readdir,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {
  appendTeachingEvent,readTeachingEvents,latestTeachingEvent,
} from "../lib/storageHogTeachingLedger.ts";
import {
  isBusinessDomain,isStorageLifecycle,categoryReviewEvidence,
  CLASSIFICATION_REVIEW_VERSION,
} from "../lib/storageHogTeachingPolicy.ts";

const OWNER="a".repeat(64);
const originalKeys=["AOE2WAR_OS_STORE_DIR","AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY",
 "AOE2WAR_STORAGE_VISUAL_HMAC_KEY","NODE_ENV"] as const;
const source={
  plane:"mac" as const,category:"DEVELOPER_TOOLS",
  sourceObservedAt:"2026-11-21T20:00:00.000Z",
  sourceFingerprint:"f".repeat(64),grossBytes:245760,sourceFloor:2 as const,
  overlaps:true,note:"Owner reviewed this bounded source category",
  ownerBinding:OWNER,
};
async function isolated(work:(root:string)=>Promise<void>){
  const root=await mkdtemp(path.join(tmpdir(),"storage-owner-dimensions-"));
  await mkdir(path.join(root,"state"),{mode:0o700});
  const prior=Object.fromEntries(originalKeys.map(k=>[k,process.env[k]]));
  try{
    process.env.NODE_ENV="test";
    Object.assign(process.env,{
      AOE2WAR_OS_STORE_DIR:root,
      AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY:"c".repeat(64),
      AOE2WAR_STORAGE_VISUAL_HMAC_KEY:"d".repeat(64),
    });
    await work(root);
  }finally{
    for(const k of originalKeys){
      if(prior[k]===undefined)delete process.env[k];
      else process.env[k]=prior[k] as string;
    }
    await rm(root,{recursive:true,force:true});
  }
}

test("three owner labels persist on the existing HMAC ledger and corrections retain history",async()=>{
  await isolated(async()=>{
    const first=await appendTeachingEvent({...source,
      requestedLevel:2,domain:"DEVELOPER_TOOLS",lifecycle:"REGENERABLE",previousId:null});
    assert.equal(first.reviewVersion,CLASSIFICATION_REVIEW_VERSION);
    assert.equal(first.domain,"DEVELOPER_TOOLS");
    assert.equal(first.lifecycle,"REGENERABLE");
    const corrected=await appendTeachingEvent({...source,
      requestedLevel:2,domain:"FACTORY",lifecycle:"WARM",
      note:"Owner corrected the purpose after inspection",
      previousId:first.id});
    assert.notEqual(corrected.id,first.id);
    assert.equal(corrected.previousDigest,first.digestSha256);
    const history=await readTeachingEvents();
    assert.equal(history.length,2);
    assert.equal(history[0].domain,"DEVELOPER_TOOLS");
    assert.equal(history[0].lifecycle,"REGENERABLE");
    assert.equal(history[1].domain,"FACTORY");
    assert.equal(history[1].lifecycle,"WARM");
    assert.equal(latestTeachingEvent(history,"mac","DEVELOPER_TOOLS")?.id,corrected.id);
    const review=categoryReviewEvidence(history,{
      plane:"mac",category:"DEVELOPER_TOOLS",observedAt:source.sourceObservedAt,
      sourceFloor:2,overlaps:true,
    },OWNER,Date.parse(source.sourceObservedAt));
    assert.equal(review.finding,"ALREADY_REVIEWED");
    await assert.rejects(
      appendTeachingEvent({...source,requestedLevel:2,domain:"OTHER",lifecycle:"UNKNOWN",
        previousId:first.id}),/TEACHING_STALE_EXPECTATION/);
    assert.equal((await readTeachingEvents()).length,2);
  });
});

test("legacy V1 history remains readable and new V2 decisions append in the same chain",async()=>{
  await isolated(async()=>{
    const original=await appendTeachingEvent({...source,requestedLevel:2,previousId:null});
    assert.equal(original.domain,undefined);
    assert.equal(original.reviewVersion,"category-review-v1");
    const later=await appendTeachingEvent({...source,requestedLevel:2,previousId:original.id,
      domain:"OTHER",lifecycle:"UNKNOWN"});
    const read=await readTeachingEvents();
    assert.equal(read[0].id,original.id);
    assert.equal(read[1].id,later.id);
    assert.equal(read[1].previousDigest,read[0].digestSha256);
  });
});

test("tampering with independently durable domain/lifecycle fails HMAC verification",async()=>{
  await isolated(async(root)=>{
    await appendTeachingEvent({...source,requestedLevel:2,previousId:null,
      domain:"DEVELOPER_TOOLS",lifecycle:"REGENERABLE"});
    const dir=path.join(root,"state","storage-owner-teaching.v1");
    const names=await readdir(dir);
    const target=path.join(dir,names.find(n=>n.startsWith("teaching-"))!);
    const event=JSON.parse(await readFile(target,"utf8")) as Record<string,unknown>;
    event.domain="RECOVERY";
    await writeFile(target,JSON.stringify(event)+"\n");
    await assert.rejects(readTeachingEvents(),/TEACHING_EVENT_FORGED_OR_INVALID/);
  });
});

test("bad labels and weak protection correction fail closed without writing events",async()=>{
  await isolated(async()=>{
    assert.equal(isBusinessDomain("CUSTOM_UNREVIEWED"),false);
    assert.equal(isStorageLifecycle("AUTO_DELETE"),false);
    await assert.rejects(
      appendTeachingEvent({...source,requestedLevel:2,previousId:null,
        domain:"AUTO_DELETE" as never,lifecycle:"REGENERABLE"}),
      /TEACHING_FIELDS_INVALID/);
    await assert.rejects(
      appendTeachingEvent({...source,requestedLevel:2,previousId:null,
        domain:"DEVELOPER_TOOLS"}),
      /TEACHING_FIELDS_INVALID/);
    const protectedEvent=await appendTeachingEvent({...source,requestedLevel:4,
      previousId:null,domain:"RECOVERY",lifecycle:"ACTIVE"});
    await assert.rejects(
      appendTeachingEvent({...source,requestedLevel:2,previousId:protectedEvent.id,
        domain:"DEVELOPER_TOOLS",lifecycle:"REGENERABLE"}),
      /TEACHING_OWNER_STRONGER_PROTECTION_HOLD/);
    assert.equal((await readTeachingEvents()).length,1);
  });
});
