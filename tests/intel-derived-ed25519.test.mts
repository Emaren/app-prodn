import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {
  INTEL_ED_UI_SCHEMA,INTEL_ED_UI_SIGNED_SCHEMA,INTEL_ED_UI_PURPOSE,
  SOURCE_SIGNATURE_DOMAIN,SOURCE_SIGNED_SCHEMA,intelEdUiPreimage,
  verifyIntelEdDerived,readIntelEdDerived,
} from "../lib/intelColdEd25519Bridge.ts";
import {readIntelColdEvidence,verifyIntelColdProjection}
  from "../lib/intelColdStorageEvidence.ts";

const AT="2026-11-20T23:50:00Z",NOW=new Date("2026-11-20T23:51:00Z");
const FINGERPRINT="SHA256:bU10Y1SlXTa8YCm5lphUYsMrxMSdP8D0VIQJ0C2zeEg";
const VOLUME="33F21AD8-71B5-31A5-99C2-BD30EC2A90DF";
const sha="a".repeat(64);
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const rootPem=publicKey.export({format:"pem",type:"spki"}).toString();
const rootPin=createHash("sha256").update(rootPem).digest("hex");
const sourcePin="9".repeat(64);
function projected(){
 return {schema:"aoe2war.intel-cold.status.v1",observed_at:AT,
  host_id:"intel-receiver-01",model:"MacBookPro11,3",
  volume_uuid:VOLUME,host_fingerprint:FINGERPRINT,
  port22_listening:true,port2222_listening:true,filevault_on:true,
  receiver_version:"v2",available_bytes:250*1024**3,
  reserve_bytes:60*1024**3,v1_incomplete_incident_acknowledged:true,
  source_retirement_authorized:false,
  tenants:[
   {id:"WE2",namespace:"M1-ARCHIVE",identity:"ISOLATED",
    quota_bytes:null,committed_objects:23,invalid_objects:1,
    last_transfer:null,last_restore:null,failure_domain_escrow:"HOLD"},
   {id:"WE3",namespace:"WE3-VAULT",identity:"NOT_ENROLLED",
    quota_bytes:null,committed_objects:null,invalid_objects:null,
    last_transfer:null,last_restore:null,failure_domain_escrow:"HOLD"},
   {id:"WE4",namespace:"WE4-VAULT",identity:"NOT_ENROLLED",
    quota_bytes:null,committed_objects:null,invalid_objects:null,
    last_transfer:null,last_restore:null,failure_domain_escrow:"HOLD"},
  ]};
}
function payload(){
 return {schema:INTEL_ED_UI_SCHEMA,purpose:INTEL_ED_UI_PURPOSE,
  source_envelope_schema:SOURCE_SIGNED_SCHEMA,
  source_signature_domain:SOURCE_SIGNATURE_DOMAIN,
  source_public_pem_sha256:sourcePin,
  source_envelope_sha256:sha,source_nonce_sha256:"b".repeat(64),
  source_replay_ledger_tip_sha256:"c".repeat(64),
  we2_root_admission_ack_sha256:"d".repeat(64),
  we2_verifier_source_sha256:"e".repeat(64),
  source_replay_sequence:7,
  we2_independent_source_verified:true,
  we2_nonce_replay_fenced:true,
  source_volume_uuid:VOLUME,source_receiver_hostkey_fingerprint:FINGERPRINT,
  source_observed_at_utc:AT,admitted_at_utc:AT,projection:projected()};
}
function seal(p=payload()){
 return {schema:INTEL_ED_UI_SIGNED_SCHEMA,payload:p,
  root_public_pem_sha256:rootPin,signature_domain:INTEL_ED_UI_PURPOSE,
  signature_base64:sign(null,intelEdUiPreimage(p),privateKey).toString("base64")};
}
test("admitted Ed25519 WE2-derived receipt maps to safe bounded Intel fourth-plane projection",()=>{
 const derived=verifyIntelEdDerived(seal(),rootPem,rootPin,sourcePin,NOW);
 assert.equal(derived.sourceSequence,7);
 assert.equal(derived.sourceEnvelopeSha256,sha);
 const view=verifyIntelColdProjection(derived.projection,NOW);
 assert.equal(view.source,"SIGNED_PRIVATE_RECEIPT");
 assert.equal(view.health,"ONLINE");
 assert.equal(view.hardware.volumeUuid,VOLUME);
 assert.equal(view.hardware.fileVault,true);
 assert.equal(view.tenants[0].lastRestore,null); // No independent per-item restore is invented.
 assert.equal(view.tenants[0].reclaimableBytes,null);
 assert.equal(view.authority,"READ_ONLY_NO_CLEANUP_OR_REINSTALL");
});
test("misconfigured root or source public key, wrong signing purpose and unsigned HMAC are HOLD",()=>{
 assert.throws(()=>verifyIntelEdDerived(seal(),rootPem,rootPin,"f".repeat(64),NOW),
   /INTEL_WE2_SOURCE_ADMISSION_OR_REPLAY_HOLD/);
 assert.throws(()=>verifyIntelEdDerived(seal(),rootPem,"f".repeat(64),sourcePin,NOW),
   /INTEL_WE2_DERIVED_SIGNER_OR_SCHEMA_HOLD/);
 const forged={...seal(),signature_domain:"AOE2WAR_TRAFFIC_SIGNING_V1"};
 assert.throws(()=>verifyIntelEdDerived(forged,rootPem,rootPin,sourcePin,NOW),
   /INTEL_WE2_DERIVED_SIGNER_OR_SCHEMA_HOLD/);
 const fake={...seal(),payload:{...payload(),source_envelope_schema:"aoe2war.intel-cold.signed.v1"}};
 assert.throws(()=>verifyIntelEdDerived(fake,rootPem,rootPin,sourcePin,NOW),
   /INTEL_WE2_SOURCE_ADMISSION_OR_REPLAY_HOLD/);
});
test("tampered projected bytes, replay sequence, source nonce, host or archive delete authority rejected",()=>{
 for(const altered of [
  {...payload(),source_replay_sequence:0},
  {...payload(),source_nonce_sha256:"unknown"},
  {...payload(),source_volume_uuid:"00000000-0000-0000-0000-000000000000"},
  {...payload(),projection:{...projected(),source_retirement_authorized:true}},
 ]){
  const attempt=seal(altered);
  assert.throws(()=>verifyIntelEdDerived(attempt,rootPem,rootPin,sourcePin,NOW),
    /INTEL_WE2_SOURCE_ADMISSION_OR_REPLAY_HOLD|INTEL_WE2_PROJECTION_SOURCE_MISMATCH/);
 }
 const bad=seal();bad.payload.projection.available_bytes=1;
 assert.throws(()=>verifyIntelEdDerived(bad,rootPem,rootPin,sourcePin,NOW),
   /INTEL_WE2_DERIVED_SIGNATURE_INVALID/);
});
test("expired signed derived UI cannot make an old Intel plane appear online",()=>{
 assert.throws(()=>verifyIntelEdDerived(seal(),rootPem,rootPin,sourcePin,
  new Date("2026-11-21T01:00:00Z")),/INTEL_WE2_DERIVED_SOURCE_STALE/);
});
test("production Intel reader never treats legacy HMAC as a signed Ed25519 source",async()=>{
 const previous=process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED;
 delete process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED;
 try{
  assert.equal(await readIntelEdDerived(),null);
  assert.equal((await readIntelColdEvidence()).source,"NONE");
 }finally{
  if(previous===undefined)delete process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED;
  else process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED=previous;
 }
});
