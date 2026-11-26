/**
 * WE2-native verified V2 Storage census -> root Ed25519 signed bounded UI.
 *
 * Original VPSSentry #99 signs JSON containing nanosecond timestamps (>2^53).
 * Never roundtrip its original JSON through JavaScript and claim native HMAC
 * verification. WE2 must verify ORIGINAL exact bytes/host/source purpose in its
 * native signer, mount UUID, nonce ledger and source ACK before it signs this
 * separately domain-bound, safe-integer-only display projection.
 *
 * No direct V2 bridge parser, automatic filesystem scanner, copy or deletion.
 */
import {createHash,createPublicKey,verify} from "node:crypto";
import {constants,promises as fs} from "node:fs";
import path from "node:path";
import type {PlaneId,StorageVisualView,VisualPlane,VisualReviewItem,VisualHog} from "./storageVisualPrivate.ts";
import {HOG_CATALOG} from "./storageVisualPrivate.ts";

export const V2_UI_SCHEMA="aoe2war.storage-v2.we2-admitted-ui.v1";
export const V2_UI_SIGNED_SCHEMA="aoe2war.storage-v2.we2-admitted-ui.signed.v1";
export const V2_UI_PURPOSE="AOE2WAR_STORAGE_V2_WE2_ADMITTED_UI_V1";
export const V2_UI_DOMAIN="AOE2WAR:STORAGE-V2:WE2-ADMITTED-UI:V1\0";
const ORIGINAL_SCHEMA="aoe2war.storage-item-census.signed.v2";
const ORIGINAL_DOMAIN="AOE2WAR:STORAGE-ITEM-CENSUS:V2\0";
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[A-F0-9-]{36}$/;
const ALIAS=/^ITEM_[A-F0-9]{20}$/;
const MAX_AGE_MS=36*60*60_000;
const PLANES=["mac","hel1-root","hel1-volume-105319120"] as const;
const MOUNT_UUID:Record<PlaneId,string>={
 mac:"2B7670BF-6C76-4EC1-B874-31E1CE660EB4",
 "hel1-root":"64F6FB02-4FED-4836-A33B-86E8993AFDFA",
 "hel1-volume-105319120":"A9A085D9-6C53-4D9F-8BB8-5AEB90BF0B42",
};
const SOURCE_ROOTS:Record<PlaneId,readonly [string,number][]>={
 mac:[["M1_RELEASE_CACHE",4],["M1_HOMEBREW_DOWNLOAD_CACHE",2],["M1_SIMULATOR_GENERATED_CACHE",2]],
 "hel1-root":[["HEL1_HISTORICAL_RUNTIME_4C14",4],["HEL1_HISTORICAL_RUNTIME_C089",4]],
 "hel1-volume-105319120":[["HEL1_PRODUCT_ARTIFACT_RETENTION",4]],
};
type AnyObj=Record<string,unknown>;
function obj(x:unknown):AnyObj{
 if(!x||typeof x!=="object"||Array.isArray(x))throw Error("STORAGE_V2_OBJECT_HOLD");
 return x as AnyObj;
}
function exact(x:AnyObj,expected:string[]){
 const have=Object.keys(x).sort(),want=[...expected].sort();
 if(have.length!==want.length||have.some((k,i)=>k!==want[i]))
  throw Error("STORAGE_V2_UNEXPECTED_FIELDS_OR_PRIVATE_PATH_HOLD");
}
function serial(x:unknown):string{
 if(Array.isArray(x))return "["+x.map(serial).join(",")+"]";
 if(x!==null&&typeof x==="object"){
  const v=x as AnyObj;
  return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+serial(v[k])).join(",")+"}";
 }
 if(typeof x==="number"&&!Number.isSafeInteger(x))throw Error("STORAGE_V2_UNSAFE_NUMBER");
 const text=JSON.stringify(x);
 if(text===undefined)throw Error("STORAGE_V2_UNSERIALIZABLE");
 return text;
}
export const signedV2UiPreimage=(payload:unknown)=>
 Buffer.concat([Buffer.from(V2_UI_DOMAIN),Buffer.from(serial(payload))]);
const uint=(x:unknown):x is number=>
 typeof x==="number"&&Number.isSafeInteger(x)&&x>=0;
const hex=(x:unknown):x is string=>typeof x==="string"&&SHA.test(x);
const time=(x:unknown):x is string=>
 typeof x==="string"&&/^20\d{2}-\d\d-\d\dT/.test(x)&&Number.isFinite(Date.parse(x));
type V2Plane=VisualPlane & {nativeV2Source:true;sourceEnvelopeSha256:string;filesystemUuid:string;
  sourcePolicySha256:string;we2RootPublicPemSha256:string;sourceAckSha256:string;
  sourceReplaySequence:number};
function failExpired(at:string,clock:Date,age:number){
 const delay=clock.getTime()-Date.parse(at);
 if(delay< -60_000||delay>age)throw Error("STORAGE_V2_STALE_OR_FUTURE_SOURCE");
}
export function verifyWE2NativeV2Derived(envelope:unknown,{
 rootPublicPem,rootPin,policyPins,sourceRevision,now=new Date(),
}:{
 rootPublicPem:string;rootPin:string;policyPins:Record<PlaneId,string>;sourceRevision:string;now?:Date;
}):V2Plane {
 const x=obj(envelope);
 exact(x,["schema","payload","signature_domain","root_public_pem_sha256","signature_base64"]);
 const p=obj(x.payload);
 exact(p,["schema","purpose","source_envelope_schema","source_signature_domain","source_revision_sha",
  "source_hmac_independently_verified","source_envelope_sha256","source_policy_sha256",
  "source_nonce_sha256","source_replay_sequence","source_replay_tip_sha256",
  "we2_root_admission_ack_sha256","source_plane","source_host_identity",
  "source_mount_uuid","source_observed_at_utc","admitted_at_utc",
  "we2_nonce_replay_fenced","source_read_only","source_retirement_authorized","projection"]);
 if(x.schema!==V2_UI_SIGNED_SCHEMA||x.signature_domain!==V2_UI_PURPOSE||
    p.schema!==V2_UI_SCHEMA||p.purpose!==V2_UI_PURPOSE||
    p.source_envelope_schema!==ORIGINAL_SCHEMA||p.source_signature_domain!==ORIGINAL_DOMAIN||
    p.source_revision_sha!==sourceRevision||!/^[a-f0-9]{40}$/.test(sourceRevision)||
    p.source_hmac_independently_verified!==true||
    p.we2_nonce_replay_fenced!==true||
    p.source_read_only!==true||p.source_retirement_authorized!==false||
    !hex(p.source_envelope_sha256)||!hex(p.source_policy_sha256)||
    !hex(p.source_nonce_sha256)||!hex(p.source_replay_tip_sha256)||
    !hex(p.we2_root_admission_ack_sha256)||
    !Number.isSafeInteger(p.source_replay_sequence)||Number(p.source_replay_sequence)<1)
  throw Error("STORAGE_V2_SOURCE_OR_REPLAY_NOT_ADMITTED");
 const id=p.source_plane as PlaneId;
 if(!PLANES.includes(id)||p.source_mount_uuid!==MOUNT_UUID[id]||
    !UUID.test(p.source_mount_uuid as string)||
    p.source_host_identity!==(id==="mac"?"M1_ARM64":"HEL1")||
    p.source_policy_sha256!==policyPins[id]||!hex(policyPins[id]))
  throw Error("STORAGE_V2_HOST_UUID_OR_POLICY_HOLD");
 if(!time(p.source_observed_at_utc)||!time(p.admitted_at_utc))
  throw Error("STORAGE_V2_DATE_HOLD");
 failExpired(p.source_observed_at_utc as string,now,MAX_AGE_MS);
 failExpired(p.admitted_at_utc as string,now,60*60_000);
 if(Date.parse(p.admitted_at_utc as string)<Date.parse(p.source_observed_at_utc as string))
  throw Error("STORAGE_V2_ADMISSION_PRECEDES_SOURCE");
 if(!hex(rootPin)||!rootPublicPem.startsWith("-----BEGIN PUBLIC KEY-----")||
    createHash("sha256").update(rootPublicPem).digest("hex")!==rootPin||
    x.root_public_pem_sha256!==rootPin||
    typeof x.signature_base64!=="string"||
    !/^[A-Za-z0-9+/]{86}==$/.test(x.signature_base64)||
    !verify(null,signedV2UiPreimage(p),createPublicKey(rootPublicPem),
      Buffer.from(x.signature_base64,"base64")))
  throw Error("STORAGE_V2_WE2_ROOT_SIGNATURE_INVALID");

 const projection=obj(p.projection);
 exact(projection,["schema","observed_at_utc","ordinary_available_bytes",
  "roots","items","coverage","proven_unique_reclaim_bytes","source_envelope_sha256"]);
 if(projection.schema!=="aoe2war.storage-v2.we2-bounded-projection.v1"||
    projection.observed_at_utc!==p.source_observed_at_utc||
    projection.source_envelope_sha256!==p.source_envelope_sha256||
    projection.coverage!=="PARTIAL"||projection.proven_unique_reclaim_bytes!==null||
    !(projection.ordinary_available_bytes===null||uint(projection.ordinary_available_bytes))||
    !Array.isArray(projection.roots)||!Array.isArray(projection.items)||
    projection.roots.length> SOURCE_ROOTS[id].length||projection.items.length>48)
  throw Error("STORAGE_V2_PROJECTION_POLICY_HOLD");
 const rootRows=new Map<string,{level:number;sampled:number;count:number;complete:boolean}>();
 for(const [i,raw] of projection.roots.entries()){
  const r=obj(raw);
  exact(r,["root_id","source_floor","coverage","sampled_allocated_bytes","sampled_file_count"]);
  const expected=SOURCE_ROOTS[id][i];
  if(r.root_id!==expected[0]||r.source_floor!==expected[1]||
     !["PARTIAL","BOUNDED_DEPTH_COMPLETE","MISSING_UNREADABLE_OR_SYMLINK_HOLD",
       "BUDGET_NOT_VISITED"].includes(r.coverage as string)||
     !uint(r.sampled_allocated_bytes)||!uint(r.sampled_file_count)||
     (r.coverage==="BUDGET_NOT_VISITED"&&(r.sampled_file_count!==0||r.sampled_allocated_bytes!==0)))
   throw Error("STORAGE_V2_ROOT_ID_OR_PROTECTION_FLOOR_HOLD");
  rootRows.set(r.root_id as string,{level:expected[1],sampled:r.sampled_allocated_bytes as number,
    count:r.sampled_file_count as number,
    complete:r.coverage==="PARTIAL"||r.coverage==="BOUNDED_DEPTH_COMPLETE"});
 }
 const items:VisualReviewItem[]=[];
 const counts=new Map<string,{sum:number;count:number}>();
 const ids=new Set<string>();
 for(const raw of projection.items){
  const x=obj(raw);
  exact(x,["alias","root_id","source_path_digest_sha256","source_floor","allocated_bytes",
   "logical_bytes","hardlink_or_clone_overlap_unknown","proof_state",
   "proven_unique_reclaim_bytes","retirement_authority"]);
  const r=rootRows.get(x.root_id as string);
  if(!r||!r.complete||!ALIAS.test(x.alias as string)||ids.has(x.alias as string)||
     !hex(x.source_path_digest_sha256)||
     x.alias!=="ITEM_"+(x.source_path_digest_sha256 as string).slice(0,20).toUpperCase()||
     x.source_floor!==r.level||!uint(x.allocated_bytes)||!uint(x.logical_bytes)||
     typeof x.hardlink_or_clone_overlap_unknown!=="boolean"||
     x.proof_state!=="INCOMPLETE"||x.proven_unique_reclaim_bytes!==null||
     x.retirement_authority!=="DENIED")
   throw Error("STORAGE_V2_ITEM_SOURCE_OR_NO_DELETE_HOLD");
  ids.add(x.alias as string);
  const have=counts.get(x.root_id as string)??{sum:0,count:0};
  have.sum+=x.allocated_bytes as number;have.count++;
  if(!Number.isSafeInteger(have.sum))throw Error("STORAGE_V2_SUM_UNSAFE");
  counts.set(x.root_id as string,have);
  const digest=x.source_path_digest_sha256 as string;
  items.push({alias:x.alias as string,category:x.root_id as VisualReviewItem["category"],
    level:r.level as VisualReviewItem["level"],grossBytes:x.allocated_bytes as number,
    logicalBytes:x.logical_bytes as number,
    fingerprint:createHash("sha256").update("AOE2WAR:STORAGE-V2:ITEM-UI:V1\0")
      .update(p.source_envelope_sha256 as string).update(x.alias as string).digest("hex"),
    sourceDigest:digest,sourceRevision,
    sourceStatus:r.level===5?"PROTECTED":r.level===2?"REVIEW_ONLY":"MIGRATION_REVIEW",
    proofState:"INCOMPLETE",overlaps:true});
 }
 const hogs:VisualHog[]=[];
 for(const [rootId,r] of rootRows){
  const n=counts.get(rootId)??{sum:0,count:0};
  if(r.sampled!==n.sum||r.count!==n.count)
    throw Error("STORAGE_V2_CATEGORY_SAMPLE_IDENTITY_MISMATCH");
  if(!r.complete||r.count===0)continue;
  const rule=HOG_CATALOG[rootId as keyof typeof HOG_CATALOG];
  if(!rule||rule.level!==r.level||!rule.planes.includes(id))
    throw Error("STORAGE_V2_CATEGORY_CATALOG_MISMATCH");
  hogs.push({key:rootId as VisualHog["key"],label:rule.label,level:rule.level,
    grossBytes:r.sampled,overlaps:true});
 }
 const at=p.source_observed_at_utc as string;
 return {id,observedAt:at,coverage:"PARTIAL",events:[],
  hogs:hogs.sort((a,b)=>b.grossBytes-a.grossBytes),
  status:now.getTime()-Date.parse(at)<=MAX_AGE_MS?"RECEIPT":"STALE",
  reviewItems:items,capacitySamples:projection.ordinary_available_bytes===null?[]:
   [{at,ordinaryFreeBytes:projection.ordinary_available_bytes as number}],
  nativeV2Source:true,sourceEnvelopeSha256:p.source_envelope_sha256 as string,
  filesystemUuid:MOUNT_UUID[id],sourcePolicySha256:p.source_policy_sha256 as string,
  we2RootPublicPemSha256:rootPin,sourceAckSha256:p.we2_root_admission_ack_sha256 as string,
  sourceReplaySequence:p.source_replay_sequence as number};
}
export async function readWE2NativeV2(clock=new Date()):Promise<StorageVisualView|null>{
 if(process.env.AOE2WAR_STORAGE_V2_CONTRACT_ADMITTED!=="WE2_NATIVE_V2_ED25519_V1")
  return null;
 const rootPublicPem=process.env.AOE2WAR_STORAGE_V2_WE2_PUBLIC_PEM;
 const rootPin=process.env.AOE2WAR_STORAGE_V2_WE2_PUBLIC_PEM_SHA256;
 const sourceRevision=process.env.AOE2WAR_STORAGE_V2_SOURCE_REVISION_SHA;
 const policyPins:Record<PlaneId,string>={
  mac:process.env.AOE2WAR_STORAGE_V2_POLICY_MAC_SHA256??"",
  "hel1-root":process.env.AOE2WAR_STORAGE_V2_POLICY_HEL1_ROOT_SHA256??"",
  "hel1-volume-105319120":process.env.AOE2WAR_STORAGE_V2_POLICY_HEL1_VOLUME_SHA256??"",
 };
 if(!rootPublicPem||!rootPin||!sourceRevision||!Object.values(policyPins).every(hex)||
    rootPin===process.env.AOE2WAR_INTEL_WE2_DERIVED_PUBLIC_PEM_SHA256)
  throw Error("STORAGE_V2_INDEPENDENT_ROOT_OR_POLICY_PINS_MISSING");
 const root=process.env.AOE2WAR_OS_STORE_DIR?.trim()||
  (process.env.NODE_ENV==="production"?"/var/lib/aoe2war-storage-visual-web-v1":
   path.join(process.cwd(),"storage","aoe2war-os"));
 const dir=path.join(root,"state");
 let st:Awaited<ReturnType<typeof fs.lstat>>;
 try{st=await fs.lstat(dir);}catch(e){
  if((e as NodeJS.ErrnoException).code==="ENOENT")return null;throw e;
 }
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022))
  throw Error("STORAGE_V2_STATE_DIR_UNSAFE");
 const out:VisualPlane[]=[];
 for(const id of PLANES){
  const file=path.join(dir,"storage-v2-we2-admitted-"+id+".json");
  let fh:Awaited<ReturnType<typeof fs.open>>|null=null;
  try{
   fh=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   const a=await fh.stat();
   if(!a.isFile()||a.nlink!==1||a.size<400||a.size>128*1024||(a.mode&0o022))
    throw Error("STORAGE_V2_RECEIPT_FILE_UNSAFE");
   const raw=await fh.readFile("utf8"),b=await fh.stat();
   if(a.ino!==b.ino||a.size!==b.size||a.mtimeMs!==b.mtimeMs)
    throw Error("STORAGE_V2_RECEIPT_RACE");
   const plane=verifyWE2NativeV2Derived(JSON.parse(raw),{
    rootPublicPem,rootPin,policyPins,sourceRevision,now:clock});
   if(plane.id!==id)throw Error("STORAGE_V2_CROSS_PLANE_SWAP");
   out.push(plane);
  }catch(e){
   if(["ENOENT","ENOTDIR","EACCES","EPERM"].includes(
     (e as NodeJS.ErrnoException).code??""))continue;
   throw e;
  }finally{await fh?.close();}
 }
 if(out.length===0)return null;
 return {authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",
  source:"SIGNED_PRIVATE_RECEIPT",contract:"WE2_NATIVE_V2_ED25519",planes:out};
}
