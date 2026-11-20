import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {readFileSync} from "node:fs";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {createServer} from "node:http";
import {EMPTY_EXACT,EXACT_SCHEMA,EXACT_SIGNED_SCHEMA,exactObjectId,
  readExactItems,signExactForTests,verifyExactItems}
  from "../lib/storageExactItemSource.ts";
import {appendArchiveChoice,latestArchiveChoice,readArchiveEvents}
  from "../lib/storageArchivePreferenceLedger.ts";
import {TIP_SCHEMA,enrolledOwnerBinding,tipPreimage,verifyIndependentTip,
  type IndependentTip} from "../lib/storageIndependentLedgerTip.ts";
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
test("signed exact item pins machine filesystem device inode revision and measured bytes",()=>{
  const read=verifyExactItems(signed(),KEY,NOW);
  assert.equal(read.source,"SIGNED_PRIVATE_RECEIPT");
  assert.equal(read.items.length,1);
  assert.equal(read.items[0].objectId,
    "cc9d220f9014d351d97fa002a19edea25189610975f1c6bf9ff8ab99fee6aa1e");
  assert.equal(read.items[0].allocatedBytes,4294967296);
  assert.equal(read.items[0].logicalBytes,5368709120);
  assert.equal(read.items[0].level,5);
  assert.equal(read.items[0].restore,"UNKNOWN");
  assert.equal(read.authority,"READ_ONLY_NO_DELETE_OR_TRANSFER");
});
test("wrong signer, stale preimage, forged inode and duplicate file are denied",()=>{
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
});
test("exact source producer must be separately enrolled",async()=>{
  const before=process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED;
  delete process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED;
  try{assert.equal((await readExactItems()).source,"NONE");}
  finally{if(before===undefined)delete process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED;
    else process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED=before;}
});
test("root Ed25519 independent tip rejects invalid signing key, purpose, forged count, tail truncation",()=>{
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const pem=publicKey.export({format:"pem",type:"spki"}).toString();
  const pin=createHash("sha256").update(pem).digest("hex");
  const owner="11".repeat(32);
  const event={id:"12345678-1234-1234-1234-123456789abc",
    digestSha256:"ab".repeat(32),ownerBinding:owner};
  const payload:IndependentTip={schema:TIP_SCHEMA,
    purpose:"AOE2WAR_STORAGE_ARCHIVE_INDEPENDENT_TIP_V1",sequence:1,
    headId:event.id,headDigestSha256:event.digestSha256,ownerBinding:owner,
    signedAtUtc:new Date().toISOString()};
  const seal=(body:IndependentTip)=>({
    schema:"aoe2war.storage-owner-independent-tip.ed25519.v1",payload:body,
    signature_base64:sign(null,tipPreimage("archive",body),privateKey).toString("base64"),
    public_pem_sha256:pin,
  });
  assert.equal(verifyIndependentTip(seal(payload),pem,pin,"archive",[event],owner).sequence,1);
  assert.throws(()=>verifyIndependentTip(seal(payload),pem,pin,"archive",[],owner),
    /STORAGE_TIP_TRUNCATED_OR_ROLLED_BACK/);
  assert.throws(()=>verifyIndependentTip(seal(payload),pem,pin,"teaching",[event],owner),
    /STORAGE_TIP_FIELDS_OR_OWNER_HOLD/);
  assert.throws(()=>verifyIndependentTip(seal(payload),pem,"f".repeat(64),"archive",[event],owner),
    /STORAGE_TIP_PUBLIC_KEY_PIN_HOLD/);
  const forged={...seal(payload),payload:{...payload,sequence:2}};
  assert.throws(()=>verifyIndependentTip(forged,pem,pin,"archive",[event],owner),
    /STORAGE_TIP_ED25519_SIGNATURE_INVALID/);
  assert.throws(()=>verifyIndependentTip(seal(payload),pem,pin,"archive",[event],"22".repeat(32)),
    /STORAGE_TIP_FIELDS_OR_OWNER_HOLD/);
});
test("real archive append requires independent root witness; tail deletion, old snapshot, tamper, replay and owner denial HOLD",async()=>{
  const tmp=await mkdtemp(path.join(tmpdir(),"we3-archive-ledger-tip-"));
  const oldEnv={...process.env};
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const pem=publicKey.export({format:"pem",type:"spki"}).toString();
  const pin=createHash("sha256").update(pem).digest("hex");
  const tipDir=path.join(tmp,"independent-anchor"),tipFile=path.join(tipDir,"tip.json");
  const sock=path.join(tmp,"witness.sock");
  let server:ReturnType<typeof createServer>|null=null;
  try{
    await mkdir(path.join(tmp,"state"),{mode:0o700});
    await mkdir(tipDir,{mode:0o700});
    process.env.NODE_ENV="test";
    process.env.AOE2WAR_OS_STORE_DIR=tmp;
    process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY=ARCHIVE_KEY;
    process.env.AOE2WAR_STORAGE_TEACHING_OWNER_UID="we3-archive-owner-uid";
    process.env.AOE2WAR_STORAGE_ARCHIVE_TIP_PUBLIC_PEM=pem;
    process.env.AOE2WAR_STORAGE_ARCHIVE_TIP_PUBLIC_PEM_SHA256=pin;
    process.env.AOE2WAR_STORAGE_ARCHIVE_TIP_PATH=tipFile;
    process.env.AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET=sock;
    const ownerBinding=enrolledOwnerBinding();
    const seal=async(sequence:number,headId:string|null,headDigestSha256:string|null)=>{
      const payload:IndependentTip={schema:TIP_SCHEMA,
        purpose:"AOE2WAR_STORAGE_ARCHIVE_INDEPENDENT_TIP_V1",sequence,
        headId,headDigestSha256,ownerBinding,signedAtUtc:new Date().toISOString()};
      await writeFile(tipFile,JSON.stringify({
        schema:"aoe2war.storage-owner-independent-tip.ed25519.v1",payload,
        signature_base64:sign(null,tipPreimage("archive",payload),privateKey).toString("base64"),
        public_pem_sha256:pin})+"\n",{mode:0o640});
    };
    await seal(0,null,null);
    server=createServer(async(req,res)=>{
      try{
        const parts:Buffer[]=[];
        for await(const part of req)parts.push(Buffer.from(part));
        const x=JSON.parse(Buffer.concat(parts).toString("utf8"));
        assert.equal(req.url,"/v1/witness");
        assert.equal(x.ownerBinding,ownerBinding);
        // CI-only fixture: WE2 must implement independent root/source verification.
        await seal(x.sequence,x.headId,x.headDigestSha256);
        res.writeHead(201,{"Content-Type":"application/json"});
        res.end(JSON.stringify({schema:"aoe2war.storage-tip-witness-ack.v1",kind:"archive",
          sequence:x.sequence,headDigestSha256:x.headDigestSha256}));
      }catch{res.writeHead(403);res.end("{}");}
    });
    await new Promise<void>(resolve=>server!.listen(sock,resolve));
    const object=verifyExactItems(signed(),KEY,NOW).items[0];
    assert.deepEqual(await readArchiveEvents(),[]);
    const a=await appendArchiveChoice({object,choice:"YES",previousChoiceId:null,ownerBinding});
    assert.equal(a.effect,"OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE");
    let history=await readArchiveEvents();
    assert.equal(history.length,1);
    await assert.rejects(()=>appendArchiveChoice({object,choice:"YES",
      previousChoiceId:null,ownerBinding}),/ARCHIVE_STALE_CHOICE/);
    await assert.rejects(()=>appendArchiveChoice({object,choice:"YES",
      previousChoiceId:a.id,ownerBinding}),/ARCHIVE_DUPLICATE_CHOICE/);
    const b=await appendArchiveChoice({object,choice:"NO",
      previousChoiceId:a.id,ownerBinding});
    history=await readArchiveEvents();
    assert.equal(history.length,2);
    assert.equal(b.previousDigest,a.digestSha256);
    assert.equal(latestArchiveChoice(history,object.objectId)?.choice,"NO");
    const upper={...object,filesystemUuid:object.filesystemUuid.toUpperCase()};
    upper.objectId=exactObjectId({machine:upper.machine,
      filesystemUuid:upper.filesystemUuid,deviceId:upper.deviceId,
      inode:upper.inode,sourceDigest:upper.sourceDigest});
    const c=await appendArchiveChoice({object:upper,choice:"YES",
      previousChoiceId:null,ownerBinding});
    assert.equal(c.filesystemUuid,fsid.toUpperCase());
    await assert.rejects(()=>appendArchiveChoice({object:upper,choice:"NO",
      previousChoiceId:c.id,ownerBinding:"22".repeat(32)}),/ARCHIVE_OWNER_BINDING_HOLD/);
    const dir=path.join(tmp,"state","storage-archive-preferences.v1");
    const names=(await readdir(dir)).filter(n=>n.startsWith("archive-choice-")).sort();
    const final=path.join(dir,names.at(-1)!);
    const saved=await readFile(final,"utf8");
    await rm(final);
    await assert.rejects(()=>readArchiveEvents(),/STORAGE_TIP_TRUNCATED_OR_ROLLED_BACK/);
    await writeFile(final,saved,{mode:0o600});
    assert.equal((await readArchiveEvents()).length,3);
    // Restore an old internally valid two-event snapshot, external head stays at 3.
    await rm(final);
    await assert.rejects(()=>readArchiveEvents(),/STORAGE_TIP_TRUNCATED_OR_ROLLED_BACK/);
    await writeFile(final,saved,{mode:0o600});
    // Tampering with a historical event can no longer be mistaken for an intact history.
    const first=path.join(dir,names[0]),raw=await readFile(first,"utf8");
    await writeFile(first,raw.replace('"choice":"YES"','"choice":"NO"'),{mode:0o600});
    await assert.rejects(()=>readArchiveEvents(),/ARCHIVE_EVENT_TAMPER/);
    await writeFile(first,raw,{mode:0o600});
    assert.equal((await readArchiveEvents()).length,3);
    // Old signed external snapshot replay cannot match a newer intact local log.
    await seal(2,b.id,b.digestSha256);
    await assert.rejects(()=>readArchiveEvents(),/STORAGE_TIP_TRUNCATED_OR_ROLLED_BACK/);
    await seal(3,c.id,c.digestSha256);
  }finally{
    if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
    for(const key of Object.keys(process.env)){if(!(key in oldEnv))delete process.env[key];}
    for(const [key,val] of Object.entries(oldEnv))process.env[key]=val;
    await rm(tmp,{recursive:true,force:true});
  }
});
test("website archive route rejects other users, foreign origins, wrong objects; no transfer/delete executor",()=>{
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
