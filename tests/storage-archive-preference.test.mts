import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {readFileSync} from "node:fs";
import {EMPTY_EXACT,EXACT_SCHEMA,EXACT_SIGNED_SCHEMA,exactObjectId,
  readExactItems,signExactForTests,verifyExactItems,type ExactItem}
  from "../lib/storageExactItemSource.ts";
import {appendArchiveChoice,latestArchiveChoice,readArchiveEvents}
  from "../lib/storageArchivePreferenceLedger.ts";
const KEY="31".repeat(32),ARCHIVE_KEY="42".repeat(32);
const NOW=new Date("2026-11-20T23:00:00Z");
const observed="2026-11-20T22:59:00Z";
const fsid="e33f21ad-71b5-31a5-99c2-bd30ec2a90df";
function source(){
  const item={
    alias:"SOURCE_OBJECT_0001",plane:"mac",machine:"m1-development",
    filesystem_uuid:fsid,device_id:"16777234",inode:"123456",
    source_digest:"a".repeat(64),fingerprint:"c".repeat(64),
    allocated_bytes:4294967296,logical_bytes:5368709120,level:5,
    overlap:"UNKNOWN",dependencies:"ACTIVE",restore:"UNKNOWN",observed_at:observed,
  };
  return {schema:EXACT_SCHEMA,observed_at:observed,items:[{
    ...item,object_id:exactObjectId({machine:item.machine,
      filesystemUuid:item.filesystem_uuid,deviceId:item.device_id,
      inode:item.inode,sourceDigest:item.source_digest}),
  }]};
}
function signed(payload=source(),key=KEY){
  return {schema:EXACT_SIGNED_SCHEMA,payload,hmac_sha256:signExactForTests(payload,key)};
}
test("signed exact item binds machine filesystem device inode revision and allocated/logical measurement",()=>{
  const read=verifyExactItems(signed(),KEY,NOW);
  assert.equal(read.source,"SIGNED_PRIVATE_RECEIPT");
  assert.equal(read.items.length,1);
  assert.equal(read.items[0].allocatedBytes,4294967296);
  assert.equal(read.items[0].logicalBytes,5368709120);
  assert.equal(read.items[0].level,5);
  assert.equal(read.items[0].restore,"UNKNOWN");
  assert.equal(read.authority,"READ_ONLY_NO_DELETE_OR_TRANSFER");
});
test("unsigned wrong signer stale replay or forged inode/objectId are rejected",()=>{
  const wrong=signed(source(),"19".repeat(32));
  assert.throws(()=>verifyExactItems(wrong,KEY,NOW),/EXACT_INVALID_SIGNATURE/);
  const ancient=source();ancient.observed_at="2026-11-19T15:00:00Z";
  ancient.items[0].observed_at=ancient.observed_at;
  assert.throws(()=>verifyExactItems(signed(ancient),KEY,NOW),/EXACT_SOURCE_EXPIRED/);
  const forged=source();forged.items[0].inode="9999";
  assert.throws(()=>verifyExactItems(signed(forged),KEY,NOW),/EXACT_FILE_IDENTITY_FINGERPRINT_HOLD/);
  const duplicate=source();duplicate.items.push({...duplicate.items[0]});
  assert.throws(()=>verifyExactItems(signed(duplicate),KEY,NOW),/EXACT_ITEM_IDENTITY_OR_PROVENANCE_HOLD/);
  assert.equal(EMPTY_EXACT.source,"NONE");
  assert.equal(EMPTY_EXACT.items.length,0);
});
test("explicit independent signer admission required even if an obsolete file exists",async()=>{
  const before=process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED;
  delete process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED;
  try{assert.equal((await readExactItems()).source,"NONE");}
  finally{if(before===undefined)delete process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED;
    else process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED=before;}
});
test("YES then NO are two durable owner events; stale replay, duplicate and tamper denied",async()=>{
  const tmp=await mkdtemp(path.join(tmpdir(),"we3-archive-choice-"));
  const oldDir=process.env.AOE2WAR_OS_STORE_DIR;
  const oldKey=process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY;
  process.env.AOE2WAR_OS_STORE_DIR=tmp;
  process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY=ARCHIVE_KEY;
  try{
    await mkdir(path.join(tmp,"state"),{mode:0o700});
    const object=verifyExactItems(signed(),KEY,NOW).items[0];
    assert.deepEqual(await readArchiveEvents(),[]);
    const ownerBinding="11".repeat(32);
    const a=await appendArchiveChoice({object,choice:"YES",previousChoiceId:null,ownerBinding});
    assert.equal(a.choice,"YES");
    assert.equal(a.effect,"OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE");
    let history=await readArchiveEvents();
    assert.equal(history.length,1);
    assert.equal(history[0].id,a.id);
    await assert.rejects(()=>appendArchiveChoice({object,choice:"YES",
      previousChoiceId:null,ownerBinding}),/ARCHIVE_STALE_CHOICE/);
    await assert.rejects(()=>appendArchiveChoice({object,choice:"YES",
      previousChoiceId:a.id,ownerBinding}),/ARCHIVE_DUPLICATE_CHOICE/);
    const b=await appendArchiveChoice({object,choice:"NO",
      previousChoiceId:a.id,ownerBinding});
    history=await readArchiveEvents();
    assert.equal(history.length,2);
    assert.equal(b.previousChoiceId,a.id);
    assert.equal(b.previousDigest,a.digestSha256);
    assert.equal(latestArchiveChoice(history,object.objectId)?.choice,"NO");
    assert.equal(history[0].choice,"YES");
    await assert.rejects(()=>appendArchiveChoice({object,choice:"YES",
      previousChoiceId:a.id,ownerBinding}),/ARCHIVE_STALE_CHOICE/);
    const dir=path.join(tmp,"state","storage-archive-preferences.v1");
    const names=await readdir(dir);
    const first=names.find(n=>n.startsWith("archive-choice-"))!;
    const f=path.join(dir,first);
    const raw=await readFile(f,"utf8");
    await writeFile(f,raw.replace('"choice":"YES"','"choice":"NO"'),{mode:0o600});
    await assert.rejects(()=>readArchiveEvents(),/ARCHIVE_EVENT_TAMPER/);
  }finally{
    if(oldDir===undefined)delete process.env.AOE2WAR_OS_STORE_DIR;
    else process.env.AOE2WAR_OS_STORE_DIR=oldDir;
    if(oldKey===undefined)delete process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY;
    else process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY=oldKey;
    await rm(tmp,{recursive:true,force:true});
  }
});
test("web archive route is enrolled-owner only, exact item signed, same origin and never an executor",()=>{
  const root=process.cwd();
  const src=readFileSync(path.join(root,"app/api/admin/storage-os/archive-preference/route.ts"),"utf8");
  const ui=readFileSync(path.join(root,"components/storage-os/StorageArchivePreference.tsx"),"utf8");
  assert.match(src,/teachingOwnerAccess\(session\.user\.uid\)/);
  assert.match(src,/if\(!owner\.mayRecord\)/);
  assert.match(src,/readExactItems\(\)/);
  assert.match(src,/item\.fingerprint!==req\.fingerprint/);
  assert.match(src,/request\.headers\.get\("origin"\)/);
  assert.match(src,/transferAuthorized:false,deleteAuthorized:false/);
  assert.doesNotMatch(src,/child_process|ssh\s|unlink\(|rmSync\(|deleteExecutor|transferExecutor/);
  assert.match(ui,/YES · record preference/);
  assert.match(ui,/NO · do not queue/);
  assert.match(ui,/UNANSWERED · NOT QUEUED/);
  assert.match(ui,/Intel recoverability/);
});
