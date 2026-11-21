/** Independently WE2-verified Intel Ed25519 source, signed UI projection.
 * WE4 Intel's owner-local Ed25519 Keychain signer is NOT an HMAC signer.
 * A separately owned WE2 protected verifier must first validate the pinned
 * original Ed25519 preimage, host/volume, nonce and durable replay sequence,
 * then sign this bounded projection with a distinct root-only Ed25519 key.
 * No legacy Intel HMAC envelope is admitted to the production reader.
 */
import {createHash,createPublicKey,verify} from "node:crypto";
import {constants,promises as fs} from "node:fs";
import path from "node:path";

export const INTEL_ED_UI_SCHEMA="aoe2war.storage-intel.we2-admitted-ui.v1";
export const INTEL_ED_UI_SIGNED_SCHEMA="aoe2war.storage-intel.we2-admitted-ui.signed.v1";
export const INTEL_ED_UI_DOMAIN="AOE2WAR:INTEL:WE2-ADMITTED-UI:V1\0";
export const INTEL_ED_UI_PURPOSE="AOE2WAR_STORAGE_INTEL_WE2_ADMITTED_UI_V1";
export const SOURCE_SIGNATURE_DOMAIN="AOE2WAR_STORAGE_INTEL_OBSERVATION_V1";
export const SOURCE_SIGNED_SCHEMA="aoe2war.storage-intel.source-signed.v1";
const SHA=/^[a-f0-9]{64}$/;
const sha=(v:unknown):v is string=>typeof v==="string"&&SHA.test(v);
const FINGERPRINT="SHA256:bU10Y1SlXTa8YCm5lphUYsMrxMSdP8D0VIQJ0C2zeEg";
const VOLUME="33F21AD8-71B5-31A5-99C2-BD30EC2A90DF";
const UI_FRESH_MS=15*60_000;
const MAX_RECEIPT_BYTES=96*1024;
function obj(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=="object"||Array.isArray(x))throw Error("INTEL_ED_UI_OBJECT_INVALID");
 return x as Record<string,unknown>;
}
function stable(value:unknown):string{
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 if(value&&typeof value==="object"){
  const x=value as Record<string,unknown>;
  return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";
 }
 return JSON.stringify(value);
}
export function intelEdUiPreimage(payload:unknown){
 return Buffer.concat([Buffer.from(INTEL_ED_UI_DOMAIN,"utf8"),Buffer.from(stable(payload),"utf8")]);
}
export type DerivedIntelUi={
 projection:Record<string,unknown>;
 sourceEnvelopeSha256:string;
 sourceSequence:number;
 sourcePublicPemSha256:string;
 sourceNonceSha256:string;
 we2AckSha256:string;
};
export function verifyIntelEdDerived(envelope:unknown,
 rootPem:string,rootPin:string,sourcePin:string,clock=new Date()):DerivedIntelUi{
 const x=obj(envelope),p=obj(x.payload);
 if(x.schema!==INTEL_ED_UI_SIGNED_SCHEMA||
    x.signature_domain!==INTEL_ED_UI_PURPOSE||
    !SHA.test(rootPin)||!SHA.test(sourcePin)||
    !rootPem.startsWith("-----BEGIN PUBLIC KEY-----")||
    createHash("sha256").update(rootPem).digest("hex")!==rootPin||
    x.root_public_pem_sha256!==rootPin||
    typeof x.signature_base64!=="string"||
    !/^[A-Za-z0-9+/]{86}==$/.test(x.signature_base64))
  throw Error("INTEL_WE2_DERIVED_SIGNER_OR_SCHEMA_HOLD");
 if(p.schema!==INTEL_ED_UI_SCHEMA||p.purpose!==INTEL_ED_UI_PURPOSE||
    p.source_envelope_schema!==SOURCE_SIGNED_SCHEMA||
    p.source_signature_domain!==SOURCE_SIGNATURE_DOMAIN||
    p.source_public_pem_sha256!==sourcePin||
    !sha(p.source_envelope_sha256)||!sha(p.source_nonce_sha256)||
    !sha(p.source_replay_ledger_tip_sha256)||
    !sha(p.we2_root_admission_ack_sha256)||
    !sha(p.we2_verifier_source_sha256)||
    !Number.isSafeInteger(p.source_replay_sequence)||Number(p.source_replay_sequence)<1||
    p.we2_independent_source_verified!==true||
    p.we2_nonce_replay_fenced!==true||
    p.source_volume_uuid!==VOLUME||
    p.source_receiver_hostkey_fingerprint!==FINGERPRINT||
    typeof p.source_observed_at_utc!=="string"||
    !Number.isFinite(Date.parse(p.source_observed_at_utc))||
    typeof p.admitted_at_utc!=="string"||
    !Number.isFinite(Date.parse(p.admitted_at_utc)))
  throw Error("INTEL_WE2_SOURCE_ADMISSION_OR_REPLAY_HOLD");
 const age=clock.getTime()-Date.parse(p.admitted_at_utc as string);
 const observationAge=clock.getTime()-Date.parse(p.source_observed_at_utc as string);
 if(age< -60_000||age>UI_FRESH_MS||observationAge< -60_000||
    observationAge>UI_FRESH_MS||
    Date.parse(p.admitted_at_utc as string)<Date.parse(p.source_observed_at_utc as string))
  throw Error("INTEL_WE2_DERIVED_SOURCE_STALE");
 const normalized=obj(p.projection);
 if(normalized.schema!=="aoe2war.intel-cold.status.v1"||
    normalized.observed_at!==p.source_observed_at_utc||
    normalized.volume_uuid!==VOLUME||
    normalized.host_fingerprint!==FINGERPRINT||
    normalized.filevault_on!==true||
    normalized.source_retirement_authorized===true)
  throw Error("INTEL_WE2_PROJECTION_SOURCE_MISMATCH");
 if(normalized.objects!==undefined&&normalized.objects!==null){
  if(normalized.objects_source_envelope_sha256!==p.source_envelope_sha256||
     normalized.objects_source_nonce_sha256!==p.source_nonce_sha256||
     normalized.objects_source_sequence!==p.source_replay_sequence||
     normalized.objects_independently_verified!==true)
    throw Error("INTEL_WE2_ITEM_SOURCE_LINK_HOLD");
 }
 const sig=Buffer.from(x.signature_base64,"base64");
 if(sig.length!==64||!verify(null,intelEdUiPreimage(p),
    createPublicKey(rootPem),sig))
  throw Error("INTEL_WE2_DERIVED_SIGNATURE_INVALID");
 return {projection:normalized,
  sourceEnvelopeSha256:p.source_envelope_sha256 as string,
  sourceSequence:p.source_replay_sequence as number,
  sourcePublicPemSha256:sourcePin,
  sourceNonceSha256:p.source_nonce_sha256 as string,
  we2AckSha256:p.we2_root_admission_ack_sha256 as string};
}
export async function readIntelEdDerived(clock=new Date()):Promise<DerivedIntelUi|null>{
 if(process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED!=="WE2_ED25519_DERIVED_V1")
  return null;
 const rootPem=process.env.AOE2WAR_INTEL_WE2_DERIVED_PUBLIC_PEM;
 const rootPin=process.env.AOE2WAR_INTEL_WE2_DERIVED_PUBLIC_PEM_SHA256;
 const sourcePin=process.env.AOE2WAR_INTEL_ED25519_SOURCE_PUBLIC_PEM_SHA256;
 if(!rootPem||!rootPin||!sourcePin)throw Error("INTEL_ED_ROOT_OR_SOURCE_PUBLIC_PIN_MISSING");
 const root=process.env.AOE2WAR_OS_STORE_DIR?.trim()||
   (process.env.NODE_ENV==="production"?"/var/lib/aoe2war-storage-visual-web-v1":
    path.join(process.cwd(),"storage","aoe2war-os"));
 const dir=path.join(root,"state");
 const file=path.join(dir,"intel-we2-ed25519-admitted-ui.v1.json");
 let fh:Awaited<ReturnType<typeof fs.open>>|null=null;
 try{
  const st=await fs.lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022))
   throw Error("INTEL_DERIVED_DIRECTORY_UNSAFE");
  fh=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const a=await fh.stat();
  if(!a.isFile()||a.nlink!==1||a.size<300||a.size>MAX_RECEIPT_BYTES||
     (a.mode&0o022))throw Error("INTEL_DERIVED_FILE_UNSAFE");
  const data=await fh.readFile("utf8"),b=await fh.stat();
  if(a.ino!==b.ino||a.mtimeMs!==b.mtimeMs||a.size!==b.size)
   throw Error("INTEL_DERIVED_FILE_RACE");
  return verifyIntelEdDerived(JSON.parse(data),rootPem,rootPin,sourcePin,clock);
 }catch(e){
  if(["ENOENT","ENOTDIR","EACCES","EPERM"].includes(
    (e as NodeJS.ErrnoException).code??""))return null;
  throw e;
 }finally{await fh?.close();}
}
