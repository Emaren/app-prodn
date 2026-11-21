/**
 * Intel Cold Storage OS — signed, bounded, read-only telemetry admission.
 * No SSH client, root authority, keys, mount scans, cleanup or fake reachability
 * in the Next.js runtime. Unknown/unsigned/stale snapshots never read ONLINE.
 */
import {createHmac,timingSafeEqual} from "node:crypto";
import {readIntelEdDerived} from "./intelColdEd25519Bridge.ts";

export const COLD_SCHEMA="aoe2war.intel-cold.status.v1";
export const COLD_SIGNED_SCHEMA="aoe2war.intel-cold.signed.v1";
const DOMAIN="AOE2WAR:INTEL-COLD-STATUS:V1\0";
const MAX_FILE=64*1024;
const FRESH_MS=15*60*1000;
const MAX_AGE_MS=36*3600*1000;
const RESERVE=60*1024**3;
const INTEL_FP="SHA256:bU10Y1SlXTa8YCm5lphUYsMrxMSdP8D0VIQJ0C2zeEg";
const TENANTS=["WE2","WE3","WE4"] as const;
export type ColdTenantId=typeof TENANTS[number];
export type ColdHealth="ONLINE"|"DEGRADED"|"STALE"|"HOLD";
type BackupProof={campaign:string;ciphertextSha256:string;observedAt:string};
type RestoreProof={campaign:string;sourceSha256:string;restoredSha256:string;observedAt:string};
export type ColdTenant={
  id:ColdTenantId;namespace:string;
  identity:"ISOLATED"|"NOT_ENROLLED";quotaBytes:number|null;
  committedObjects:number|null;invalidObjects:number|null;
  lastTransfer:BackupProof|null;lastRestore:RestoreProof|null;
  failureDomainEscrow:"PASS"|"HOLD";
  cleanup:"LOCKED";reclaimableBytes:null;
};
export type ColdArchiveObject={
  alias:string;namespace:"M1-ARCHIVE"|"HEL1-RECOVERY";
  allocatedBytes:number;logicalBytes:number;
  restore:"HISTORICAL_RESTORE_PROOF_PRESENT"|"RECOVERY_UNVERIFIED"|"KNOWN_FAILED_DECRYPTION";
  restoreReceiptSha256:string|null;contentSha256VerifiedNow:boolean;
  protectionLevel:null;sharedBlockUncertainty:true;
  deletionAuthorized:false;uniqueReclaimBytes:null;
};
export type IntelColdView={
  schema:typeof COLD_SCHEMA;source:"SIGNED_PRIVATE_RECEIPT"|"NONE";
  health:ColdHealth;observedAt:string|null;
  hardware:{model:string|null;volumeUuid:string|null;fileVault:boolean|null};
  ssh:{hostFingerprint:string|null;port22:boolean|null;port2222:boolean|null};
  receiverVersion:"v1"|"v2"|null;
  capacity:{availableBytes:number|null;reserveBytes:number;headroomAboveReserve:number|null};
  incident:{knownV1Incomplete:boolean;status:"NOT_RECOVERABLE_NO_RECLAIM"};
  tenants:ColdTenant[];
  objects:ColdArchiveObject[]|null;
  authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL";
  reason:string;
};
function unknown(reason:string):IntelColdView{
  return {schema:COLD_SCHEMA,source:"NONE",health:"HOLD",observedAt:null,
    hardware:{model:null,volumeUuid:null,fileVault:null},
    ssh:{hostFingerprint:null,port22:null,port2222:null},
    receiverVersion:null,
    capacity:{availableBytes:null,reserveBytes:RESERVE,headroomAboveReserve:null},
    incident:{knownV1Incomplete:true,status:"NOT_RECOVERABLE_NO_RECLAIM"},
    tenants:TENANTS.map((id):ColdTenant=>({
      id,namespace:id==="WE2"?"M1-ARCHIVE":"NOT_ENROLLED",
      identity:"NOT_ENROLLED",quotaBytes:null,committedObjects:null,
      invalidObjects:null,lastTransfer:null,lastRestore:null,
      failureDomainEscrow:"HOLD",cleanup:"LOCKED",reclaimableBytes:null})),
    objects:null,authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL",reason};
}
export const EMPTY_INTEL_COLD=unknown("NO_SIGNED_INTEL_VAULT_STATUS");
const object=(v:unknown):Record<string,unknown>=>{
  if(v===null||typeof v!=="object"||Array.isArray(v))throw Error("INTEL_OBJECT_INVALID");
  return v as Record<string,unknown>;
};
const nonnegative=(v:unknown):v is number=>
  typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const sha=(v:unknown):v is string=>
  typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);
const timestamp=(v:unknown):v is string=>
  typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const campaign=(v:unknown):v is string=>
  typeof v==="string"&&/^[A-Za-z0-9_-]{4,48}$/.test(v);
const stable=(value:unknown):string=>{
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  if(value&&typeof value==="object"){
    const v=value as Record<string,unknown>;
    return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
  }
  return JSON.stringify(value);
};
export function signColdForTests(payload:unknown,keyHex:string):string {
  if(!/^[0-9a-f]{64}$/.test(keyHex))throw Error("INTEL_HMAC_TEST_KEY_INVALID");
  return createHmac("sha256",Buffer.from(keyHex,"hex"))
    .update(DOMAIN,"utf8").update(stable(payload)).digest("hex");
}
function backup(v:unknown,at:number):BackupProof|null{
  if(v===null)return null;
  const x=object(v);
  if(!campaign(x.campaign)||!sha(x.ciphertext_sha256)||!timestamp(x.observed_at)
    ||Date.parse(x.observed_at)>at+60_000)throw Error("INTEL_BACKUP_PROOF_INVALID");
  return {campaign:x.campaign,ciphertextSha256:x.ciphertext_sha256,observedAt:x.observed_at};
}
function restore(v:unknown,at:number):RestoreProof|null{
  if(v===null)return null;
  const x=object(v);
  if(!campaign(x.campaign)||!sha(x.source_sha256)||!sha(x.restored_sha256)
    ||x.source_sha256!==x.restored_sha256||!timestamp(x.observed_at)
    ||Date.parse(x.observed_at)>at+60_000)
    throw Error("INTEL_RESTORE_PROOF_INVALID");
  return {campaign:x.campaign,sourceSha256:x.source_sha256,
    restoredSha256:x.restored_sha256,observedAt:x.observed_at};
}
export function verifyLegacyIntelHmacFixture(
  envelope:unknown,keyHex:string,clock:Date=new Date()
):IntelColdView{
  if(!/^[0-9a-f]{64}$/.test(keyHex))throw Error("INTEL_HMAC_NOT_ENROLLED");
  const signed=object(envelope),payload=object(signed.payload);
  if(signed.schema!==COLD_SIGNED_SCHEMA||payload.schema!==COLD_SCHEMA)
    throw Error("INTEL_COLD_SCHEMA_HOLD");
  if(!sha(signed.hmac_sha256))throw Error("INTEL_UNSIGNED_HOLD");
  const expected=Buffer.from(signColdForTests(payload,keyHex),"hex");
  if(!timingSafeEqual(expected,Buffer.from(signed.hmac_sha256,"hex")))
    throw Error("INTEL_EVIDENCE_SIGNATURE_INVALID");
  return verifyIntelColdProjection(payload,clock);
}
/** The optional source-item extension is admitted ONLY inside WE2's separate
 * Ed25519-signed derived receipt with explicit original-envelope provenance.
 * A missing extension is UNKNOWN inventory, never zero items or zero bytes.
 */
export function parseIntelArchiveObjects(raw:unknown):ColdArchiveObject[]|null{
  if(raw===undefined||raw===null)return null;
  if(!Array.isArray(raw)||raw.length!==23)throw Error("INTEL_OBJECT_COUNT_HOLD");
  const seen=new Set<string>(),counts={PASS:0,UNKNOWN:0,FAILED:0};
  const out:ColdArchiveObject[]=[];
  for(const value of raw){
    const x=object(value);
    if(Object.keys(x).sort().join("|")!==
       ["alias","namespace","kind","logical_bytes","allocated_bytes",
       "restore_state","historical_independent_restore_receipt_sha256",
       "sha256_content_verified_now","source_sha256",
       "hardlink_or_shared_block_uncertainty","retirement_permitted",
       "proven_unique_reclaim_bytes"].sort().join("|"))
      throw Error("INTEL_OBJECT_FIELDS_OR_PATH_HOLD");
    if(typeof x.alias!=="string"||!/^INTEL_[A-F0-9]{24}$/.test(x.alias)||
       seen.has(x.alias)||(x.namespace!=="M1-ARCHIVE"&&x.namespace!=="HEL1-RECOVERY")||
       x.kind!=="AGE_CIPHERTEXT"||
       !nonnegative(x.logical_bytes)||!nonnegative(x.allocated_bytes)||
       x.retirement_permitted!==false||x.proven_unique_reclaim_bytes!==null||
       x.hardlink_or_shared_block_uncertainty!==true||
       typeof x.sha256_content_verified_now!=="boolean"||
       !(x.source_sha256===null||sha(x.source_sha256))||
       (x.sha256_content_verified_now===true&&!sha(x.source_sha256)))
      throw Error("INTEL_OBJECT_IDENTITY_OR_PROTECTION_HOLD");
    const restore=x.restore_state;
    if(restore!=="HISTORICAL_RESTORE_PROOF_PRESENT"&&restore!=="RECOVERY_UNVERIFIED"&&
       restore!=="KNOWN_FAILED_DECRYPTION")
      throw Error("INTEL_OBJECT_RESTORE_CLASS_HOLD");
    if(restore==="HISTORICAL_RESTORE_PROOF_PRESENT"){
      if(!sha(x.historical_independent_restore_receipt_sha256))
        throw Error("INTEL_OBJECT_INDEPENDENT_PROOF_MISSING");
      counts.PASS++;
    }else{
      if(x.historical_independent_restore_receipt_sha256!==null)
        throw Error("INTEL_OBJECT_UNVERIFIED_PROOF_FORGERY");
      if(restore==="KNOWN_FAILED_DECRYPTION")counts.FAILED++;else counts.UNKNOWN++;
    }
    seen.add(x.alias);
    out.push({alias:x.alias,namespace:x.namespace,
      allocatedBytes:x.allocated_bytes as number,logicalBytes:x.logical_bytes as number,
      restore:restore as ColdArchiveObject["restore"],
      restoreReceiptSha256:x.historical_independent_restore_receipt_sha256 as string|null,
      contentSha256VerifiedNow:x.sha256_content_verified_now,
      protectionLevel:null,sharedBlockUncertainty:true,
      deletionAuthorized:false,uniqueReclaimBytes:null});
  }
  if(counts.PASS!==6||counts.UNKNOWN!==16||counts.FAILED!==1||
    out.filter(x=>x.namespace==="M1-ARCHIVE").length!==21||
    out.filter(x=>x.namespace==="HEL1-RECOVERY").length!==2)
    throw Error("INTEL_OBJECT_PROOF_CLASSES_OR_NAMESPACE_HOLD");
  return out;
}
export function verifyIntelColdProjection(input:unknown,clock:Date=new Date()):IntelColdView{
  const x=object(input);
  if(x.schema!==COLD_SCHEMA)throw Error("INTEL_PROJECTION_SCHEMA_HOLD");
  if(!timestamp(x.observed_at))throw Error("INTEL_OBSERVED_TIME_INVALID");
  const age=clock.getTime()-Date.parse(x.observed_at);
  if(!Number.isFinite(age)||age < -60_000||age > MAX_AGE_MS)
    throw Error("INTEL_SOURCE_CLOCK_OR_RETENTION_HOLD");
  if(x.host_id!=="intel-receiver-01"||x.model!=="MacBookPro11,3"
    ||x.host_fingerprint!==INTEL_FP||typeof x.port22_listening!=="boolean"
    ||typeof x.port2222_listening!=="boolean"||typeof x.filevault_on!=="boolean"
    ||(x.receiver_version!=="v1"&&x.receiver_version!=="v2")
    ||typeof x.volume_uuid!=="string"
    ||!/^[A-F0-9-]{36}$/.test(x.volume_uuid)
    ||!nonnegative(x.available_bytes)
    ||x.reserve_bytes!==RESERVE
    ||x.v1_incomplete_incident_acknowledged!==true
    ||!Array.isArray(x.tenants)||x.tenants.length!==3)
    throw Error("INTEL_HOST_IDENTITY_OR_POLICY_HOLD");
  const tenants:ColdTenant[]=[];
  const seen=new Set<string>();
  for(const raw of x.tenants){
    const row=object(raw),id=row.id;
    if(!TENANTS.includes(id as ColdTenantId)||seen.has(id as string)
       ||typeof row.namespace!=="string"
       ||!/^[A-Z0-9_-]{4,40}$/.test(row.namespace)
       ||(id==="WE2"&&row.namespace!=="M1-ARCHIVE")
       ||(id!=="WE2"&&row.namespace==="M1-ARCHIVE")
       ||(row.identity!=="ISOLATED"&&row.identity!=="NOT_ENROLLED")
       ||!(row.quota_bytes===null||nonnegative(row.quota_bytes))
       ||!(row.committed_objects===null||nonnegative(row.committed_objects))
       ||!(row.invalid_objects===null||nonnegative(row.invalid_objects))
       ||(row.failure_domain_escrow!=="PASS"&&row.failure_domain_escrow!=="HOLD")
       ||(row.identity==="NOT_ENROLLED"&&(row.committed_objects!==null||row.quota_bytes!==null)))
      throw Error("INTEL_TENANT_NAMESPACE_OR_QUOTA_HOLD");
    const lastTransfer=backup(row.last_transfer,Date.parse(x.observed_at));
    const lastRestore=restore(row.last_restore,Date.parse(x.observed_at));
    if(row.identity==="NOT_ENROLLED"&&(lastTransfer||lastRestore))
      throw Error("INTEL_UNENROLLED_TENANT_PROOF_FORBIDDEN");
    seen.add(id as string);
    tenants.push({
      id:id as ColdTenantId,namespace:row.namespace,
      identity:row.identity as ColdTenant["identity"],
      quotaBytes:row.quota_bytes as number|null,
      committedObjects:row.committed_objects as number|null,
      invalidObjects:row.invalid_objects as number|null,
      lastTransfer,lastRestore,
      failureDomainEscrow:row.failure_domain_escrow as "PASS"|"HOLD",
      cleanup:"LOCKED",reclaimableBytes:null});
  }
  if(seen.size!==3)throw Error("INTEL_TENANT_INVENTORY_INCOMPLETE");
  // Signed source observations cannot bypass stale data or missing FileVault.
  const healthy=age<=FRESH_MS&&x.port22_listening&&x.port2222_listening
    &&x.filevault_on&&(x.available_bytes as number)>RESERVE;
  const health:ColdHealth=age>FRESH_MS?"STALE":healthy?"ONLINE":"DEGRADED";
  return {schema:COLD_SCHEMA,source:"SIGNED_PRIVATE_RECEIPT",health,
    observedAt:x.observed_at,
    hardware:{model:x.model as string,volumeUuid:x.volume_uuid as string,
      fileVault:x.filevault_on as boolean},
    ssh:{hostFingerprint:INTEL_FP,port22:x.port22_listening as boolean,
      port2222:x.port2222_listening as boolean},
    receiverVersion:x.receiver_version as "v1"|"v2",
    capacity:{availableBytes:x.available_bytes as number,reserveBytes:RESERVE,
      headroomAboveReserve:Math.max(0,(x.available_bytes as number)-RESERVE)},
    incident:{knownV1Incomplete:true,status:"NOT_RECOVERABLE_NO_RECLAIM"},
    tenants,objects:parseIntelArchiveObjects(x.objects),authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL",
    reason:health==="ONLINE"?"FRESH_SIGNED_SOURCE":health==="STALE"
      ?"SIGNED_SOURCE_STALE":"RECEIVER_HEALTH_OR_RESERVE_HOLD"};
}
/** Production accepts only WE2-root Ed25519-signed derived receipts from a
 * genuine source-key-verified Intel Ed25519 envelope and replay ledger.
 * Historical HMAC v1 is retained ONLY as a pure negative/source fixture;
 * it can never activate the fourth plane in the live web runtime. */
export async function readIntelColdEvidence(clock:Date=new Date()):Promise<IntelColdView>{
  const derived=await readIntelEdDerived(clock);
  if(!derived)return unknown("INTEL_ED25519_WE2_DERIVED_SOURCE_NOT_ADMITTED");
  return verifyIntelColdProjection(derived.projection,clock);
}
