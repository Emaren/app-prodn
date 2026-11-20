import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  COLD_SCHEMA,COLD_SIGNED_SCHEMA,EMPTY_INTEL_COLD,
  signColdForTests,verifyIntelColdEvidence,
} from "../lib/intelColdStorageEvidence.ts";

const NOW=new Date("2026-11-17T19:00:00Z");
const KEY="ac".repeat(32);
const FP="SHA256:bU10Y1SlXTa8YCm5lphUYsMrxMSdP8D0VIQJ0C2zeEg";
const DIGEST="b".repeat(64);
function source(at="2026-11-17T18:59:00Z"){
  return {
    schema:COLD_SCHEMA,observed_at:at,host_id:"intel-receiver-01",
    model:"MacBookPro11,3",volume_uuid:"33F21AD8-71B5-31A5-99C2-BD30EC2A90DF",
    host_fingerprint:FP,port22_listening:true,port2222_listening:true,
    filevault_on:true,receiver_version:"v1",
    available_bytes:258_815_991_808,reserve_bytes:60*1024**3,
    v1_incomplete_incident_acknowledged:true,
    tenants:[
      {id:"WE2",namespace:"M1-ARCHIVE",identity:"ISOLATED",
        quota_bytes:100*1024**3,committed_objects:2,invalid_objects:1,
        last_transfer:{campaign:"WE2REAL261117DDB2C021E6",ciphertext_sha256:DIGEST,observed_at:at},
        last_restore:{campaign:"WE2REAL261117DDB2C021E6",source_sha256:DIGEST,
          restored_sha256:DIGEST,observed_at:at},
        failure_domain_escrow:"HOLD"},
      {id:"WE3",namespace:"WE3-VAULT",identity:"NOT_ENROLLED",quota_bytes:null,
        committed_objects:null,invalid_objects:null,
        last_transfer:null,last_restore:null,failure_domain_escrow:"HOLD"},
      {id:"WE4",namespace:"WE4-VAULT",identity:"NOT_ENROLLED",quota_bytes:null,
        committed_objects:null,invalid_objects:null,
        last_transfer:null,last_restore:null,failure_domain_escrow:"HOLD"},
    ]
  };
}
function signed(payload:ReturnType<typeof source>,key=KEY){
  return {schema:COLD_SIGNED_SCHEMA,payload,hmac_sha256:signColdForTests(payload,key)};
}
test("owner signed Intel identity, capacity and WE2 restore are admitted but cleanup stays locked",()=>{
  const out=verifyIntelColdEvidence(signed(source()),KEY,NOW);
  assert.equal(out.source,"SIGNED_PRIVATE_RECEIPT");
  assert.equal(out.health,"ONLINE");
  assert.equal(out.hardware.fileVault,true);
  assert.equal(out.receiverVersion,"v1");
  assert.equal(out.ssh.port22,true);
  assert.equal(out.ssh.port2222,true);
  assert.equal(out.capacity.reserveBytes,60*1024**3);
  assert.equal(out.tenants[0].lastRestore?.sourceSha256,DIGEST);
  assert.equal(out.tenants[0].cleanup,"LOCKED");
  assert.equal(out.tenants[0].reclaimableBytes,null);
  assert.equal(out.tenants[1].identity,"NOT_ENROLLED");
  assert.equal(out.tenants[2].identity,"NOT_ENROLLED");
  assert.equal(out.incident.status,"NOT_RECOVERABLE_NO_RECLAIM");
});
test("signed but stale Intel is NEVER presented online",()=>{
  const out=verifyIntelColdEvidence(signed(source("2026-11-17T18:40:00Z")),KEY,NOW);
  assert.equal(out.health,"STALE");
  assert.equal(out.tenants[0].cleanup,"LOCKED");
});
test("missing signed evidence is HOLD with unknown measurements, not zero",()=>{
  assert.equal(EMPTY_INTEL_COLD.health,"HOLD");
  assert.equal(EMPTY_INTEL_COLD.capacity.availableBytes,null);
  assert.equal(EMPTY_INTEL_COLD.tenants[0].committedObjects,null);
  assert.equal(EMPTY_INTEL_COLD.authority,"READ_ONLY_NO_CLEANUP_OR_REINSTALL");
});
test("public fingerprint drift, wrong hardware or wrong host never passes",()=>{
  for(const change of [
    {host_fingerprint:"SHA256:"+"0".repeat(43)},
    {model:"MacBookPro11,2"},
    {host_id:"meditations-receiver-01"},
    {reserve_bytes:1024},
    {v1_incomplete_incident_acknowledged:false},
  ]){
    assert.throws(()=>verifyIntelColdEvidence(signed({...source(),...change}),KEY,NOW),
      /INTEL_HOST_IDENTITY_OR_POLICY_HOLD/);
  }
});
test("FileVault off, missing port22, missing dedicated 2222 or low reserve degrades",()=>{
  for(const change of [
    {filevault_on:false},{port22_listening:false},{port2222_listening:false},
    {available_bytes:60*1024**3-1},
  ]){
    assert.equal(verifyIntelColdEvidence(signed({...source(),...change}),KEY,NOW).health,"DEGRADED");
  }
});
test("invalid signature, wrong signing key or unsigned payload fail closed",()=>{
  assert.throws(()=>verifyIntelColdEvidence(signed(source()),"de".repeat(32),NOW),/INTEL_EVIDENCE_SIGNATURE_INVALID/);
  assert.throws(()=>verifyIntelColdEvidence({...signed(source()),hmac_sha256:"f".repeat(64)},KEY,NOW),/INTEL_EVIDENCE_SIGNATURE_INVALID/);
  assert.throws(()=>verifyIntelColdEvidence({schema:COLD_SIGNED_SCHEMA,payload:source()},KEY,NOW),/INTEL_UNSIGNED_HOLD/);
});
test("cross-tenant WE2 namespace or unverified WE4 enrollment are rejected",()=>{
  for(const tamper of [
    {id:"WE4",namespace:"M1-ARCHIVE",identity:"NOT_ENROLLED"},
    {id:"WE3",namespace:"WE3-VAULT",identity:"NOT_ENROLLED",quota_bytes:100},
    {id:"WE3",namespace:"WE3-VAULT",identity:"NOT_ENROLLED",committed_objects:1},
  ]){
    const payload=source();
    payload.tenants[1]={...payload.tenants[1],...tamper} as typeof payload.tenants[1];
    assert.throws(()=>verifyIntelColdEvidence(signed(payload),KEY,NOW),
      /INTEL_TENANT_NAMESPACE_OR_QUOTA_HOLD|INTEL_TENANT_INVENTORY_INCOMPLETE/);
  }
});
test("an invalid independent restore hash is rejected even if the HMAC is valid",()=>{
  const payload=source();
  payload.tenants[0].last_restore!.restored_sha256="f".repeat(64);
  assert.throws(()=>verifyIntelColdEvidence(signed(payload),KEY,NOW),
    /INTEL_RESTORE_PROOF_INVALID/);
});
test("future observations and invalid freshness never claim alive",()=>{
  assert.throws(()=>verifyIntelColdEvidence(signed(source("2026-11-17T19:05:00Z")),KEY,NOW),
    /INTEL_SOURCE_CLOCK_OR_RETENTION_HOLD/);
  assert.throws(()=>verifyIntelColdEvidence(signed(source("2026-11-15T10:00:00Z")),KEY,NOW),
    /INTEL_SOURCE_CLOCK_OR_RETENTION_HOLD/);
});
test("website source requires admin; has no live SSH, key, cleanup or filesystem executor",()=>{
  const root=process.cwd();
  const api=readFileSync(path.join(root,"app/api/admin/storage-os/intel/route.ts"),"utf8");
  const ui=readFileSync(path.join(root,"components/storage-os/IntelColdStoragePanel.tsx"),"utf8");
  const wrapper=readFileSync(path.join(root,"components/storage-os/StorageHogWorkbench.tsx"),"utf8");
  assert.match(api,/requireAdmin\(request\)/);
  assert.match(api,/readIntelColdEvidence\(\)/);
  assert.match(api,/private, no-store/);
  assert.doesNotMatch(api,/child_process|ssh\s|spawn\(|exec\(|delete|cleanupExecutor/i);
  assert.match(ui,/No delete authority/);
  assert.match(ui,/independent source contract/);
  assert.match(ui,/individual inode, logical\/allocated size/);
  assert.match(wrapper,/Four independently verified storage planes/);
  assert.match(wrapper,/<IntelColdStoragePanel snapshot=/);
  assert.match(wrapper,/active===\"intel\"/);
});
