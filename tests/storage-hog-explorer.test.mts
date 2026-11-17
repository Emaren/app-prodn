import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {readFileSync} from "node:fs";
import {
  isTeachingLevel,teachingDisposition,sourceMatchesRequest,
} from "../lib/storageHogTeachingPolicy.ts";
import {
  appendTeachingEvent,readTeachingEvents,observedHogFingerprint,
} from "../lib/storageHogTeachingLedger.ts";

test("L2 to L5 choices never override immutable source protection",()=>{
  assert.equal(isTeachingLevel(1),false);
  assert.equal(isTeachingLevel(2),true);
  assert.equal(isTeachingLevel(5),true);
  assert.equal(isTeachingLevel(6),false);
  assert.equal(teachingDisposition(5,2).status,"HOLD");
  assert.equal(teachingDisposition(3,2).effectiveLevel,3);
  assert.equal(teachingDisposition(3,2).effect,"OWNER_FEEDBACK_ONLY_NO_DELETE");
  assert.equal(teachingDisposition(2,5).effect,"PERMANENT_PROTECTION_NO_DELETE");
  assert.equal(teachingDisposition(2,4,true).status,"HOLD");
  assert.equal(teachingDisposition("2",2).status,"HOLD");
});
test("source proof cannot be substituted by same category name and different bytes",()=>{
  const exact={key:"DOWNLOADS",grossBytes:2048,level:2 as const,overlaps:false};
  assert.equal(sourceMatchesRequest(exact,{
    key:"DOWNLOADS",grossBytes:2048,sourceFloor:2,overlaps:false,
  }),true);
  for(const wrong of [
    {key:"DOWNLOADS",grossBytes:2049,sourceFloor:2,overlaps:false},
    {key:"DOWNLOADS",grossBytes:2048,sourceFloor:3,overlaps:false},
    {key:"DOWNLOADS",grossBytes:2048,sourceFloor:2,overlaps:true},
  ])assert.equal(sourceMatchesRequest(exact,wrong),false);
  const a=observedHogFingerprint({plane:"mac",at:"2026-11-17T01:00:00Z",
    key:"DOWNLOADS",bytes:2048,level:2,overlaps:false});
  const b=observedHogFingerprint({plane:"hel1-root",at:"2026-11-17T01:00:00Z",
    key:"DOWNLOADS",bytes:2048,level:2,overlaps:false});
  assert.notEqual(a,b);
});
test("append-only owner categories bind HMAC, chronology, exact source, and L5 forever",async()=>{
  const oldKey=process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY;
  const oldVisual=process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;
  const oldRoot=process.env.AOE2WAR_OS_STORE_DIR;
  const dir=await mkdtemp(path.join(tmpdir(),"aoe-storage-teach-"));
  try{
    await mkdir(path.join(dir,"state"),{mode:0o700});
    process.env.AOE2WAR_OS_STORE_DIR=dir;
    process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY="a".repeat(64);
    process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY="b".repeat(64);
    assert.deepEqual(await readTeachingEvents(),[]);
    const at="2026-11-17T01:00:00Z";
    const base={plane:"mac" as const,category:"DOWNLOADS",sourceObservedAt:at,
      sourceFingerprint:"f".repeat(64),grossBytes:2048,sourceFloor:2 as const,
      overlaps:false,note:"Inspect downloaded assets"};
    const first=await appendTeachingEvent({
      ...base,requestedLevel:2,previousId:null,
    });
    assert.equal(first.effect,"OWNER_FEEDBACK_ONLY_NO_DELETE");
    assert.equal(first.effectiveLevel,2);
    assert.equal((await readTeachingEvents()).length,1);
    await assert.rejects(appendTeachingEvent({...base,requestedLevel:3,previousId:null}),
      /TEACHING_STALE_EXPECTATION/);
    const second=await appendTeachingEvent({
      ...base,requestedLevel:5,previousId:first.id,note:"Never delete this class",
    });
    assert.equal(second.effect,"PERMANENT_PROTECTION_NO_DELETE");
    assert.equal(second.previousDigest,first.digestSha256);
    await assert.rejects(appendTeachingEvent({...base,requestedLevel:2,previousId:second.id}),
      /TEACHING_PROTECTED_LEVEL_HOLD/);
    await assert.rejects(appendTeachingEvent({...base,requestedLevel:5,previousId:second.id}),
      /TEACHING_L5_ALREADY_PERMANENT/);
    const other=await appendTeachingEvent({
      ...base,category:"BROWSER_CACHES",requestedLevel:3,previousId:null,
      note:"Different category",
    });
    assert.equal(other.previousDigest,second.digestSha256);
    assert.equal((await readTeachingEvents()).length,3);

    // A malicious editor cannot change the owner decision or narrative.
    const p=path.join(dir,"state","storage-owner-teaching.v1");
    const names=(await readdir(p)).filter(n=>n.endsWith(".json")).sort();
    const original=await readFile(path.join(p,names[1]),"utf8");
    await writeFile(path.join(p,names[1]),original.replace("Never delete this class","Delete all now"));
    await assert.rejects(readTeachingEvents(),/TEACHING_EVENT_FORGED_OR_INVALID/);
  }finally{
    if(oldKey===undefined)delete process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY;
    else process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY=oldKey;
    if(oldVisual===undefined)delete process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;
    else process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY=oldVisual;
    if(oldRoot===undefined)delete process.env.AOE2WAR_OS_STORE_DIR;
    else process.env.AOE2WAR_OS_STORE_DIR=oldRoot;
    await rm(dir,{recursive:true,force:true});
  }
});
test("new route is admin-only, same-origin, source-verified and has no cleanup controller",()=>{
  const base=process.cwd();
  const route=readFileSync(path.join(base,"app/api/admin/storage-os/teaching/route.ts"),"utf8");
  const page=readFileSync(path.join(base,"app/admin/storage-os/explorer/page.tsx"),"utf8");
  const client=readFileSync(path.join(base,"components/storage-os/StorageHogWorkbench.tsx"),"utf8");
  const current=readFileSync(path.join(base,"app/admin/storage-os/page.tsx"),"utf8");
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/TEACHING_CROSS_ORIGIN_HOLD/);
  assert.match(route,/SIGNED_HOG_FEED_UNAVAILABLE/);
  assert.match(route,/TEACHING_SOURCE_FINGERPRINT_CHANGED/);
  assert.match(route,/deleteExecuted:false/);
  assert.match(page,/await requireServerAdmin\(\)/);
  assert.match(client,/>Storage <span/);
  assert.match(client,/>Explorer<\/span>/);
  assert.match(client,/NO AUTO-DELETE/);
  assert.match(client,/No current signed hog inventory/);
  assert.match(current,/href="\/admin\/storage-os\/explorer"/);
  assert.doesNotMatch(route,/\brm\s+-rf\b|unlink\(|execSync\(|spawn\(/);
});
