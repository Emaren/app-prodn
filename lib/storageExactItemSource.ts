/**
 * Additive exact-object source. Category buckets do NOT inhabit this schema.
 * WE1/WE2 must expressly admit the native signer + file identity contract.
 * Never infer allocated bytes or inode from a gross category.
 */
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {constants,promises as fs} from "node:fs";
import path from "node:path";
import type {TeachingPlane,ProtectionLevel} from "./storageHogTeachingPolicy.ts";
export const EXACT_SCHEMA="aoe2war.storage-exact-items.v1" as const;
export const EXACT_SIGNED_SCHEMA="aoe2war.storage-exact-items.signed.v1" as const;
const DOMAIN="AOE2WAR:STORAGE-EXACT-ITEMS:V1\0";
const UUID=/^[A-Fa-f0-9-]{36}$/;
const SHA=/^[a-f0-9]{64}$/;
const ALIAS=/^[A-Z][A-Z0-9_-]{5,39}$/;
const PLANES=["mac","hel1-root","hel1-volume-105319120"] as const;
export type ExactItem={
  objectId:string;alias:string;plane:TeachingPlane;machine:string;
  filesystemUuid:string;deviceId:string;inode:string;
  sourceDigest:string;fingerprint:string;
  allocatedBytes:number;logicalBytes:number;level:ProtectionLevel;
  overlap:"UNKNOWN"|"NONE_VERIFIED"|"POSSIBLE";
  dependencies:"UNKNOWN"|"REVIEWED"|"ACTIVE";
  restore:"UNKNOWN"|"INDEPENDENT_PASS"|"FAILED";
  observedAt:string;
};
export type ExactItemView={
  schema:typeof EXACT_SCHEMA;source:"SIGNED_PRIVATE_RECEIPT"|"NONE";
  observedAt:string|null;items:ExactItem[];
  reason:string;authority:"READ_ONLY_NO_DELETE_OR_TRANSFER";
};
export const EMPTY_EXACT:ExactItemView={
  schema:EXACT_SCHEMA,source:"NONE",observedAt:null,items:[],
  reason:"SIGNED_INDIVIDUAL_OBJECT_SOURCE_NOT_ADMITTED",
  authority:"READ_ONLY_NO_DELETE_OR_TRANSFER",
};
const o=(x:unknown):Record<string,unknown>=>{
  if(!x||typeof x!=="object"||Array.isArray(x))throw Error("EXACT_OBJECT_INVALID");
  return x as Record<string,unknown>;
};
const safe=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const string=(v:unknown,pattern:RegExp)=>typeof v==="string"&&pattern.test(v);
const stamp=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
function stable(v:unknown):string{
  if(Array.isArray(v))return "["+v.map(stable).join(",")+"]";
  if(v&&typeof v==="object"){const x=v as Record<string,unknown>;
    return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";}
  return JSON.stringify(v);
}
export function exactObjectId(x:{machine:string;filesystemUuid:string;deviceId:string;inode:string;sourceDigest:string}){
  return createHash("sha256").update("AOE2WAR:STORAGE-FS-OBJECT-ID:V1\\0")
    .update(stable({machine:x.machine,filesystemUuid:x.filesystemUuid,
      deviceId:x.deviceId,inode:x.inode,sourceDigest:x.sourceDigest})).digest("hex");
}
export function signExactForTests(payload:unknown,keyHex:string){
  if(!string(keyHex,SHA))throw Error("EXACT_SIGNER_KEY_INVALID");
  return createHmac("sha256",Buffer.from(keyHex,"hex")).update(DOMAIN)
    .update(stable(payload)).digest("hex");
}
export function verifyExactItems(envelope:unknown,keyHex:string,now=new Date()):ExactItemView{
  const x=o(envelope),p=o(x.payload);
  if(x.schema!==EXACT_SIGNED_SCHEMA||p.schema!==EXACT_SCHEMA||
     !string(x.hmac_sha256,SHA)||!string(keyHex,SHA))
    throw Error("EXACT_SIGNATURE_OR_SCHEMA_HOLD");
  const expect=Buffer.from(signExactForTests(p,keyHex),"hex");
  if(!timingSafeEqual(expect,Buffer.from(x.hmac_sha256 as string,"hex")))
    throw Error("EXACT_INVALID_SIGNATURE");
  if(!stamp(p.observed_at)||!Array.isArray(p.items)||p.items.length>64)
    throw Error("EXACT_SOURCE_INVALID");
  const age=now.getTime()-Date.parse(p.observed_at as string);
  if(age< -60_000||age>3_600_000)throw Error("EXACT_SOURCE_EXPIRED");
  const ids=new Set<string>(),out:ExactItem[]=[];
  for(const raw of p.items){
    const i=o(raw);
    if(!string(i.object_id,SHA)||ids.has(i.object_id as string)||
       !string(i.alias,ALIAS)||!PLANES.includes(i.plane as TeachingPlane)||
       !string(i.machine,/^[a-zA-Z0-9._-]{3,64}$/)||
       !string(i.filesystem_uuid,UUID)||
       !string(i.device_id,/^[0-9]{1,20}$/)||
       !string(i.inode,/^[0-9]{1,20}$/)||
       !string(i.source_digest,SHA)||!string(i.fingerprint,SHA)||
       !safe(i.allocated_bytes)||!safe(i.logical_bytes)||
       ![1,2,3,4,5].includes(i.level as number)||
       !["UNKNOWN","NONE_VERIFIED","POSSIBLE"].includes(i.overlap as string)||
       !["UNKNOWN","REVIEWED","ACTIVE"].includes(i.dependencies as string)||
       !["UNKNOWN","INDEPENDENT_PASS","FAILED"].includes(i.restore as string)||
       !stamp(i.observed_at)||i.observed_at!==p.observed_at)
      throw Error("EXACT_ITEM_IDENTITY_OR_PROVENANCE_HOLD");
    if(i.object_id!==exactObjectId({machine:i.machine as string,
       filesystemUuid:i.filesystem_uuid as string,deviceId:i.device_id as string,
       inode:i.inode as string,sourceDigest:i.source_digest as string}))
      throw Error("EXACT_FILE_IDENTITY_FINGERPRINT_HOLD");
    ids.add(i.object_id as string);
    out.push({objectId:i.object_id as string,alias:i.alias as string,
      plane:i.plane as TeachingPlane,machine:i.machine as string,
      filesystemUuid:i.filesystem_uuid as string,deviceId:i.device_id as string,
      inode:i.inode as string,sourceDigest:i.source_digest as string,
      fingerprint:i.fingerprint as string,allocatedBytes:i.allocated_bytes as number,
      logicalBytes:i.logical_bytes as number,level:i.level as ProtectionLevel,
      overlap:i.overlap as ExactItem["overlap"],
      dependencies:i.dependencies as ExactItem["dependencies"],
      restore:i.restore as ExactItem["restore"],observedAt:i.observed_at as string});
  }
  return {schema:EXACT_SCHEMA,source:"SIGNED_PRIVATE_RECEIPT",
    observedAt:p.observed_at as string,items:out,
    reason:"CURRENT_VERIFIED_EXACT_OBJECTS",authority:"READ_ONLY_NO_DELETE_OR_TRANSFER"};
}
export function exactSourceAdmitted(){
  return process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED==="WE1_WE2_SIGNED_V1";
}
export async function readExactItems(now=new Date()):Promise<ExactItemView>{
  if(!exactSourceAdmitted())return EMPTY_EXACT;
  const key=process.env.AOE2WAR_STORAGE_EXACT_OBJECT_HMAC_KEY?.trim();
  if(!key||!string(key,SHA)||
     key.toLowerCase()===process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY?.toLowerCase()||
     key.toLowerCase()===process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY?.toLowerCase()||
     key.toLowerCase()===process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY?.toLowerCase())
    throw Error("EXACT_SOURCE_ISOLATED_KEY_REQUIRED");
  const dir=path.join(process.env.AOE2WAR_OS_STORE_DIR?.trim()||
    (process.env.NODE_ENV==="production"?"/mnt/HC_Volume_105319120/aoe2war/os-control":
      path.join(process.cwd(),"storage","aoe2war-os")),"state");
  let fh:Awaited<ReturnType<typeof fs.open>>|null=null;
  try{
    const ds=await fs.lstat(dir);
    if(!ds.isDirectory()||ds.isSymbolicLink()||(ds.mode&0o022))throw Error("EXACT_DIR_UNSAFE");
    fh=await fs.open(path.join(dir,"storage-exact-items.v1.json"),
      constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const a=await fh.stat();
    if(!a.isFile()||a.nlink!==1||a.size<=0||a.size>256*1024||(a.mode&0o022))
      throw Error("EXACT_FILE_UNSAFE");
    const raw=await fh.readFile("utf8");const b=await fh.stat();
    if(a.ino!==b.ino||a.size!==b.size||a.mtimeMs!==b.mtimeMs)
      throw Error("EXACT_FILE_RACE");
    return verifyExactItems(JSON.parse(raw),key,now);
  }catch(e){
    if(["ENOENT","ENOTDIR","EACCES","EPERM"].includes(
      (e as NodeJS.ErrnoException).code??""))return EMPTY_EXACT;
    throw e;
  }finally{await fh?.close();}
}
