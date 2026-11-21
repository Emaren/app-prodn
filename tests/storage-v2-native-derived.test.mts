import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import {
  V2_UI_SCHEMA,V2_UI_SIGNED_SCHEMA,V2_UI_PURPOSE,
  signedV2UiPreimage,verifyWE2NativeV2Derived,readWE2NativeV2,
} from "../lib/storageV2We2Derived.ts";
import {projectPrivateStorage} from "../lib/storageCommandCenterProjection.ts";
const revision="40ed19fc51da75baae595a1e65762f9c96d6e307";
const now=new Date("2026-11-21T07:00:00.000Z");
const keypair=generateKeyPairSync("ed25519");
const publicPem=keypair.publicKey.export({format:"pem",type:"spki"}).toString();
const pin=createHash("sha256").update(publicPem).digest("hex");
const hex=(x:string)=>x.repeat(64);
const policyPins={
 mac:hex("a"),"hel1-root":hex("b"),"hel1-volume-105319120":hex("c"),
};
const uuids={
 mac:"2B7670BF-6C76-4EC1-B874-31E1CE660EB4",
 "hel1-root":"64F6FB02-4FED-4836-A33B-86E8993AFDFA",
 "hel1-volume-105319120":"A9A085D9-6C53-4D9F-8BB8-5AEB90BF0B42",
};
const rootIds={
 mac:[["M1_RELEASE_CACHE",4],["M1_HOMEBREW_DOWNLOAD_CACHE",2],["M1_SIMULATOR_GENERATED_CACHE",2]],
 "hel1-root":[["HEL1_HISTORICAL_RUNTIME_4C14",4],["HEL1_HISTORICAL_RUNTIME_C089",4]],
 "hel1-volume-105319120":[["HEL1_PRODUCT_ARTIFACT_RETENTION",4]],
} as const;
type Plane=keyof typeof policyPins;
type MutableV2Fixture=Record<string,unknown> & {
 projection:Record<string,unknown> & {
  roots:Record<string,unknown>[];
  items:Record<string,unknown>[];
 };
};
const verifiedOptions={rootPublicPem:publicPem,rootPin:pin,policyPins,sourceRevision:revision,now};
function payload(id:Plane="mac"){
 const roots=rootIds[id].map(([root_id,source_floor],i)=>({
  root_id,source_floor,coverage:"PARTIAL",
  sampled_allocated_bytes:i===1?8192:4096,
  sampled_file_count:1,
 }));
 const items=roots.map((r,i)=>{
  const digest=createHash("sha256").update(id+r.root_id+i).digest("hex");
  return {
   alias:"ITEM_"+digest.slice(0,20).toUpperCase(),root_id:r.root_id,
   source_path_digest_sha256:digest,source_floor:r.source_floor,
   allocated_bytes:r.sampled_allocated_bytes,logical_bytes:r.sampled_allocated_bytes*2,
   hardlink_or_clone_overlap_unknown:true,proof_state:"INCOMPLETE",
   proven_unique_reclaim_bytes:null,retirement_authority:"DENIED",
  };
 });
 return {
  schema:V2_UI_SCHEMA,purpose:V2_UI_PURPOSE,
  source_envelope_schema:"aoe2war.storage-item-census.signed.v2",
  source_signature_domain:"AOE2WAR:STORAGE-ITEM-CENSUS:V2\0",
  source_revision_sha:revision,
  source_hmac_independently_verified:true,source_envelope_sha256:hex("d"),
  source_policy_sha256:policyPins[id],source_nonce_sha256:hex("e"),
  source_replay_sequence:11,source_replay_tip_sha256:hex("f"),
  we2_root_admission_ack_sha256:hex("1"),source_plane:id,
  source_host_identity:id==="mac"?"M1_ARM64":"HEL1",
  source_mount_uuid:uuids[id],source_observed_at_utc:now.toISOString(),
  admitted_at_utc:new Date(now.getTime()+10_000).toISOString(),
  we2_nonce_replay_fenced:true,source_read_only:true,
  source_retirement_authorized:false,
  projection:{
   schema:"aoe2war.storage-v2.we2-bounded-projection.v1",
   observed_at_utc:now.toISOString(),ordinary_available_bytes:7_900_000_000,
   source_envelope_sha256:hex("d"),roots,items,
   coverage:"PARTIAL",proven_unique_reclaim_bytes:null,
  },
 };
}
function seal(p=payload()){
 return {schema:V2_UI_SIGNED_SCHEMA,payload:p,signature_domain:V2_UI_PURPOSE,
  root_public_pem_sha256:pin,
  signature_base64:sign(null,signedV2UiPreimage(p),keypair.privateKey).toString("base64")};
}
test("source-qualified V2 native WE2 Ed25519 -> real bounded M1 L2 categories",()=>{
 const p=verifyWE2NativeV2Derived(seal(),verifiedOptions);
 assert.equal(p.nativeV2Source,true);
 assert.equal(p.filesystemUuid,uuids.mac);
 assert.equal(p.reviewItems?.length,3);
 assert.equal(p.reviewItems?.[1].level,2);
 assert.equal(p.reviewItems?.[1].proofState,"INCOMPLETE");
 assert.equal(p.reviewItems?.[1].sourceRevision,revision);
 assert.equal(p.reviewItems?.[1].overlaps,true);
 assert.equal(p.hogs.find(h=>h.key==="M1_HOMEBREW_DOWNLOAD_CACHE")?.grossBytes,8192);
 assert.equal(p.hogs.find(h=>h.key==="M1_HOMEBREW_DOWNLOAD_CACHE")?.level,2);
 assert.deepEqual(p.capacitySamples,[{at:now.toISOString(),ordinaryFreeBytes:7_900_000_000}]);
 assert.equal(p.coverage,"PARTIAL");
 assert.equal(p.events.length,0);
});
test("HEL1 root/data retain signed level-four floors and separate volume identity",()=>{
 for(const id of ["hel1-root","hel1-volume-105319120"] as const){
  const v=verifyWE2NativeV2Derived(seal(payload(id)),verifiedOptions);
  assert.equal(v.id,id);assert.equal(v.filesystemUuid,uuids[id]);
  assert.equal(v.hogs.length,rootIds[id].length);
  assert.ok(v.hogs.every(x=>x.level===4&&x.overlaps));
  assert.ok(v.reviewItems?.every(x=>x.level===4&&x.proofState==="INCOMPLETE"));
 }
});
test("source HMAC/source revision/policy/host/UUID/nonce/root-ACK provenance cannot self-promote",()=>{
 for(const [name,mutate] of Object.entries({
  sourcePurpose:(p:MutableV2Fixture)=>p.source_signature_domain="WRONG",
  sourceVerified:(p:MutableV2Fixture)=>p.source_hmac_independently_verified=false,
  staleRevision:(p:MutableV2Fixture)=>p.source_revision_sha="0".repeat(40),
  wrongPolicy:(p:MutableV2Fixture)=>p.source_policy_sha256=hex("9"),
  wrongMacUuid:(p:MutableV2Fixture)=>p.source_mount_uuid=uuids["hel1-root"],
  wrongHost:(p:MutableV2Fixture)=>p.source_host_identity="HEL1",
  nonceNotFenced:(p:MutableV2Fixture)=>p.we2_nonce_replay_fenced=false,
  missingAck:(p:MutableV2Fixture)=>p.we2_root_admission_ack_sha256=null,
  sourceRetirement:(p:MutableV2Fixture)=>p.source_retirement_authorized=true,
  sourceDoesNotBind:(p:MutableV2Fixture)=>p.projection.source_envelope_sha256=hex("4"),
  forgedTimestamp:(p:MutableV2Fixture)=>p.admitted_at_utc="2026-11-21T02:00:00.000Z",
 })){
  const p=structuredClone(payload());mutate(p as unknown as MutableV2Fixture);
  assert.throws(()=>verifyWE2NativeV2Derived(seal(p),verifiedOptions),/STORAGE_V2_/,name);
 }
});
test("source-derived exact items cannot add private path, forged floor, unsafe bytes or permission",()=>{
 for(const [name,mutate] of Object.entries({
  privatePath:(x:Record<string,unknown>)=>x.original_path="/Users/owner/secret",
  directoryName:(x:Record<string,unknown>)=>x.path="/var/lib",
  floorDowngrade:(x:Record<string,unknown>)=>x.source_floor=1,
  fakeAlias:(x:Record<string,unknown>)=>x.alias="ITEM_"+ "0".repeat(20),
  unsafeNum:(x:Record<string,unknown>)=>x.allocated_bytes=Number.MAX_SAFE_INTEGER+1,
  deletion:(x:Record<string,unknown>)=>x.retirement_authority="ALLOWED",
  fakeReclaim:(x:Record<string,unknown>)=>x.proven_unique_reclaim_bytes=4096,
  missingDigest:(x:Record<string,unknown>)=>x.source_path_digest_sha256=null,
 })){
  const p=structuredClone(payload());mutate(p.projection.items[0]);
  assert.throws(()=>verifyWE2NativeV2Derived(seal(p),verifiedOptions),/STORAGE_V2_/,name);
 }
});
test("sampled category bytes must exactly match the source-bound items, never imply whole-volume reclaim",()=>{
 for(const change of [
  (p:MutableV2Fixture)=>p.projection.roots[0].sampled_allocated_bytes=Number(p.projection.roots[0].sampled_allocated_bytes)+1024,
  (p:MutableV2Fixture)=>p.projection.roots[0].sampled_file_count=8,
  (p:MutableV2Fixture)=>p.projection.proven_unique_reclaim_bytes=4096,
  (p:MutableV2Fixture)=>p.projection.items[0].allocated_bytes=Number(p.projection.items[0].allocated_bytes)+5,
  (p:MutableV2Fixture)=>p.projection.roots[0].root_id="FINANCIAL_ORIGINALS",
 ]){const p=structuredClone(payload());change(p as unknown as MutableV2Fixture);
  assert.throws(()=>verifyWE2NativeV2Derived(seal(p),verifiedOptions),/STORAGE_V2_/);
 }
});
test("tampered Ed25519 signatures, stale observations, oversized errors and wrong private key HOLD",()=>{
 const p=payload();p.projection.items[0].logical_bytes=1;
 const forged=seal();
 forged.payload=p;
 assert.throws(()=>verifyWE2NativeV2Derived(forged,verifiedOptions),/STORAGE_V2_WE2_ROOT_SIGNATURE_INVALID/);
 assert.throws(()=>verifyWE2NativeV2Derived(seal(),{...verifiedOptions,rootPin:hex("7")}),/STORAGE_V2_WE2_ROOT_SIGNATURE_INVALID/);
 assert.throws(()=>verifyWE2NativeV2Derived(seal(),{...verifiedOptions,
  now:new Date(now.getTime()+37*3600_000)}),/STORAGE_V2_STALE_OR_FUTURE_SOURCE/);
});
test("a gate OFF / absent signed file means UNKNOWN; correctly signed source may surface native ordinary-free only",async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),"we3-native-v2-"));
 const state=path.join(dir,"state");mkdirSync(state,{mode:0o700});
 const names=["AOE2WAR_OS_STORE_DIR","AOE2WAR_STORAGE_V2_CONTRACT_ADMITTED",
  "AOE2WAR_STORAGE_V2_WE2_PUBLIC_PEM","AOE2WAR_STORAGE_V2_WE2_PUBLIC_PEM_SHA256",
  "AOE2WAR_STORAGE_V2_POLICY_MAC_SHA256",
  "AOE2WAR_STORAGE_V2_POLICY_HEL1_ROOT_SHA256",
  "AOE2WAR_STORAGE_V2_POLICY_HEL1_VOLUME_SHA256",
  "AOE2WAR_STORAGE_V2_SOURCE_REVISION_SHA"];
 const prev=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{
  process.env.AOE2WAR_OS_STORE_DIR=dir;
  assert.equal(await readWE2NativeV2(now),null);
  Object.assign(process.env,{
   AOE2WAR_STORAGE_V2_CONTRACT_ADMITTED:"WE2_NATIVE_V2_ED25519_V1",
   AOE2WAR_STORAGE_V2_WE2_PUBLIC_PEM:publicPem,
   AOE2WAR_STORAGE_V2_WE2_PUBLIC_PEM_SHA256:pin,
   AOE2WAR_STORAGE_V2_POLICY_MAC_SHA256:policyPins.mac,
   AOE2WAR_STORAGE_V2_POLICY_HEL1_ROOT_SHA256:policyPins["hel1-root"],
   AOE2WAR_STORAGE_V2_POLICY_HEL1_VOLUME_SHA256:policyPins["hel1-volume-105319120"],
   AOE2WAR_STORAGE_V2_SOURCE_REVISION_SHA:revision,
  });
  assert.equal(await readWE2NativeV2(now),null);
  const file=path.join(state,"storage-v2-we2-admitted-mac.json");
  writeFileSync(file,JSON.stringify(seal()),{mode:0o600});
  const view=await readWE2NativeV2(now);
  assert.equal(view?.contract,"WE2_NATIVE_V2_ED25519");
  assert.equal(view?.planes.length,1);
  const projected=projectPrivateStorage({}, {},now,view!);
  assert.equal(projected.planes[0].freeBytes,7_900_000_000);
  assert.equal(projected.planes[0].source,"WE2_NATIVE_V2_SIGNED_PLANE");
  assert.equal(projected.planes[0].reclaimedBytes,null);
  assert.equal(projected.planes[0].usedPercent,null);
  assert.equal(projected.planes[1].freeBytes,null);
  assert.equal(projected.planes[2].freeBytes,null);
  writeFileSync(file,JSON.stringify({...seal(),signature_base64:"A".repeat(86)+"=="}));
  await assert.rejects(readWE2NativeV2(now),/STORAGE_V2_WE2_ROOT_SIGNATURE_INVALID/);
 }finally{
  for(const [k,v] of Object.entries(prev)){if(v===undefined)delete process.env[k];
    else process.env[k]=v;}
  rmSync(dir,{recursive:true,force:true});
 }
});
