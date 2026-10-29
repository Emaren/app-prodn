import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,statSync,rmSync,readdirSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import {acceptStorageVisualSubmission} from "../lib/storageVisualBridgeReceiver.ts";
import {readPrivateStorageVisual} from "../lib/storageVisualPrivate.ts";
const canonical=(v:unknown):string=>Array.isArray(v)?"["+v.map(canonical).join(",")+"]":
 v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical((v as Record<string,unknown>)[k])).join(",")+"}":JSON.stringify(v);
const sig=(key:string,domain:string,data:unknown)=>createHmac("sha256",Buffer.from(key,"hex")).update(domain+canonical(data)).digest("hex");
const key=(c:string)=>c.repeat(64);
test("native isolated source HMAC, durable signed ACK, idempotency and no fake HEL1 hogs",async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),"storage-visual-w1-"));
 const state=path.join(dir,"state"),acks=path.join(state,"storage-visual-bridge-acks.v1");
 mkdirSync(state,{mode:0o700});mkdirSync(acks,{mode:0o700});
 const prev=Object.fromEntries(["AOE2WAR_OS_STORE_DIR","AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY",
  "AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY","AOE2WAR_STORAGE_VISUAL_HMAC_KEY",
  "AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY"].map(k=>[k,process.env[k]]));
 Object.assign(process.env,{AOE2WAR_OS_STORE_DIR:dir,AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY:key("a"),
  AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY:key("b"),AOE2WAR_STORAGE_VISUAL_HMAC_KEY:key("c"),
  AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY:key("d")});
 const now=new Date("2026-10-29T00:50:00Z");
 const samples=["mac","hel1-root","hel1-volume-105319120"].map((id,index)=>{
  const p={schema:"aoe2war.storage-visual.source-plane.v1",id,
   observed_at:"2026-10-29T00:49:00Z",source_evidence_sha256:"e".repeat(64),
   collector:id==="mac"?"MAC_PULSE":"HEL1_ESTATE_OBSERVER",
   mount_identity:id==="mac"?"UNVERIFIED_APFS_VOLUME_UUID":"SOURCE_MOUNT_CHECK_NO_UUID",
   coverage:"PARTIAL",hogs:index===0?[{key:"DOWNLOADS",gross_allocated_bytes:512000000,overlaps:true}]:[],
   events:[],read_only:true,auto_delete_permitted:false,financial_authority:false};
  const sourceKey=id==="mac"?key("a"):key("b");
  return {schema:"aoe2war.storage-visual.source-signed.v1",payload:p,
   signature_hmac_sha256:sig(sourceKey,"AOE2WAR_SOURCE_PLANE_V1\0",p)};
 });
 const domain="AOE2WAR_STORAGE_BRIDGE_SUBMISSION_V1\0";
 const submission={schema:"aoe2war.storage-visual.bridge-submission.v1",
  submission_id:createHash("sha256").update(domain+canonical(samples)).digest("hex"),
  source_receipts:samples};
 try{
  const ack=await acceptStorageVisualSubmission(submission,now);
  assert.equal(ack.payload.status,"STORED_VERIFIED_READBACK");
  assert.equal(ack.payload.replay,"NEW");
  assert.deepEqual(ack.payload.accepted_planes,["mac","hel1-root","hel1-volume-105319120"]);
  assert.equal(ack.payload.stored_sha256,ack.payload.readback_sha256);
  assert.equal(sig(key("d"),"AOE2WAR_STORAGE_BRIDGE_ACK_V1\0",ack.payload),ack.signature_hmac_sha256);
  const saved=await readPrivateStorageVisual(now);
  assert.equal(saved.source,"SIGNED_PRIVATE_RECEIPT");
  assert.equal(saved.planes.length,3);
  assert.equal(saved.planes[0].hogs[0].key,"DOWNLOADS");
  assert.equal(saved.planes[1].hogs.length,0);
  assert.equal(saved.planes[1].coverage,"PARTIAL");
  const file=path.join(state,"storage-visual.v1.json");
  assert.equal(statSync(file).mode&0o077,0);
  assert.equal(readdirSync(acks).length,1);
  assert.ok(readFileSync(file,"utf8").includes('"signature_hmac_sha256"'));
  const duplicate=await acceptStorageVisualSubmission(submission,now);
  assert.equal(duplicate.payload.replay,"IDEMPOTENT");
  // C canonical v1 exact 12-field source contract is never widened by G.
  // Even a recomputed envelope/submission signature cannot add item or
  // capacity fields: no authenticated source-owned individual producer exists.
  for(const field of ["review_items","capacity_samples"] as const){
    const injected=structuredClone(submission);
    (injected.source_receipts[0].payload as Record<string,unknown>)[field]=[];
    injected.source_receipts[0].signature_hmac_sha256=sig(key("a"),"AOE2WAR_SOURCE_PLANE_V1\\0",injected.source_receipts[0].payload);
    injected.submission_id=createHash("sha256").update(domain+canonical(injected.source_receipts)).digest("hex");
    await assert.rejects(()=>acceptStorageVisualSubmission(injected,now),/VISUAL_FIELDS_UNRECOGNIZED/);
  }
  const fake=structuredClone(submission);
  fake.source_receipts[0].payload.read_only=false;
  await assert.rejects(()=>acceptStorageVisualSubmission(fake,now),/VISUAL_/);
  const tampered=structuredClone(submission);
  tampered.source_receipts[0].payload.hogs[0].gross_allocated_bytes=42;
  tampered.submission_id=createHash("sha256").update(domain+canonical(tampered.source_receipts)).digest("hex");
  await assert.rejects(()=>acceptStorageVisualSubmission(tampered,now),/VISUAL_SOURCE_AUTH_HOLD/);
  await assert.rejects(()=>acceptStorageVisualSubmission(submission,new Date("2026-11-01T00:00:00Z")) ,/VISUAL_/);
 }finally{
  for(const [k,v] of Object.entries(prev)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  rmSync(dir,{recursive:true,force:true});
 }
});
