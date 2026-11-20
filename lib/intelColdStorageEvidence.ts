/**
 * Intel Cold Storage OS — signed, bounded, read-only telemetry admission.
 * No SSH client, root authority, keys, mount scans, cleanup or fake reachability
 * in the Next.js runtime. Unknown/unsigned/stale snapshots never read ONLINE.
 */
import {createHmac,timingSafeEqual} from "node:crypto";
import {constants} from "node:fs";
import {promises as fs} from "node:fs";
import path from "node:path";

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
export type IntelColdView={
  schema:typeof COLD_SCHEMA;source:"SIGNED_PRIVATE_RECEIPT"|"NONE";
  health:ColdHealth;observedAt:string|null;
  hardware:{model:string|null;volumeUuid:string|null;fileVault:boolean|null};
  ssh:{hostFingerprint:string|null;port22:boolean|null;port2222:boolean|null};
  receiverVersion:"v1"|"v2"|null;
  capacity:{availableBytes:number|null;reserveBytes:number;headroomAboveReserve:number|null};
  incident:{knownV1Incomplete:boolean;status:"NOT_RECOVERABLE_NO_RECLAIM"};
  tenants:ColdTenant[];
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
    authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL",reason};
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
export function verifyIntelColdEvidence(
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
  const x=payload;
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
    tenants,authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL",
    reason:health==="ONLINE"?"FRESH_SIGNED_SOURCE":health==="STALE"
      ?"SIGNED_SOURCE_STALE":"RECEIVER_HEALTH_OR_RESERVE_HOLD"};
}
export async function readIntelColdEvidence(clock:Date=new Date()):Promise<IntelColdView>{
  const key=process.env.AOE2WAR_INTEL_COLD_HMAC_KEY?.trim();
  if(!key)return EMPTY_INTEL_COLD;
  if(!/^[0-9a-f]{64}$/.test(key)
    ||key.toLowerCase()===process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY?.toLowerCase()
    ||key.toLowerCase()===process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY?.toLowerCase())
    throw Error("INTEL_ISOLATED_SIGNER_KEY_REQUIRED");
  const root=process.env.AOE2WAR_OS_STORE_DIR?.trim()
    ||(process.env.NODE_ENV==="production"
      ?"/mnt/HC_Volume_105319120/aoe2war/os-control"
      :path.join(process.cwd(),"storage","aoe2war-os"));
  const dir=path.join(root,"state");
  const file=path.join(dir,"intel-cold-status.v1.json");
  let fh:Awaited<ReturnType<typeof fs.open>>|null=null;
  try{
    const d=await fs.lstat(dir);
    if(!d.isDirectory()||d.isSymbolicLink()||(d.mode&0o022))
      throw Error("INTEL_RECEIPT_DIRECTORY_UNSAFE");
    fh=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const before=await fh.stat();
    if(!before.isFile()||before.nlink!==1||before.size<=0||before.size>MAX_FILE
      ||(before.mode&0o022))throw Error("INTEL_RECEIPT_FILE_IDENTITY");
    const bytes=await fh.readFile({encoding:"utf8"});
    const after=await fh.stat();
    if(before.ino!==after.ino||before.size!==after.size
      ||before.mtimeMs!==after.mtimeMs)throw Error("INTEL_RECEIPT_RACE");
    return verifyIntelColdEvidence(JSON.parse(bytes),key,clock);
  }catch(e){
    if(["ENOENT","ENOTDIR","EACCES","EPERM"].includes(
      (e as NodeJS.ErrnoException).code??""))return unknown("NO_ADMITTED_SIGNED_INTEL_STATUS");
    throw e;
  }finally{await fh?.close();}
}
