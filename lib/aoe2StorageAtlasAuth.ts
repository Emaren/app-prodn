/** Storage Atlas signed, read-only producer/consumer contract.
 * Signature validity proves receipt provenance, NOT complete census,
 * freshness outside the TTL, device health, reclaimed bytes, or live GO.
 */
import {createHash, createPublicKey, verify as verifySignature} from "node:crypto";
import {toStorageAtlasPublicSnapshot, type StorageAtlasPublicSnapshot}
 from "./aoe2StorageAtlasPublicContract.ts";

const DOMAIN=Buffer.from("aoe2war/storage-atlas/receipt-v1\0","utf8");
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PLANES=["mac","hel1-root","hel1-volume-105319120"] as const;
const CLASSES=new Set(["protected","active","generated_rebuildable","historical_review","personal_human_review","unknown"]);
export const SIGNED_ATLAS_SCHEMA="aoe2war.storage-atlas.signed-receipts.v1" as const;
export type StoragePlane=typeof PLANES[number];
export type SignedAtlasPublic=Readonly<{schema:"aoe2war.storage-atlas.authenticated-public.v1";provenance:"ED25519_THREE_HOST_RECEIPTS";
  admission:"HOLD";live:false;verified_at:string;receipt_sequences:Readonly<Record<StoragePlane,number>>;
  snapshot:StorageAtlasPublicSnapshot}>;
export type CollectorPin=Readonly<{collector_id:string;public_key_pem:string;filesystem_uuid:string;mount_source:string;
  mountpoint:string;source_sha:string;minimum_sequence:number;previous_receipt_sha256:string}>;
export type AtlasTrustPolicy=Readonly<Record<StoragePlane,CollectorPin>>;
export type AtlasSignedReceipt=Readonly<{plane:StoragePlane;payload_base64:string;signature_base64:string}>;
export type AtlasEnvelope=Readonly<{schema:typeof SIGNED_ATLAS_SCHEMA;receipts:readonly AtlasSignedReceipt[]}>;
const reject=(msg:string):never=>{throw new Error("STORAGE_ATLAS_AUTH_HOLD:"+msg);};
function object(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))return reject("object_required");
 return value as Record<string,unknown>;
}
function str(value:unknown):string{
 if(typeof value!=="string"||!value||value.length>4096)return reject("invalid_string");
 return value;
}
function safeInt(x:unknown):number{
 if(typeof x!=="number"||!Number.isSafeInteger(x)||x<0)return reject("invalid_integer");
 return x;
}
function iso(value:unknown):number{
 const x=str(value);
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x))return reject("not_utc");
 const n=Date.parse(x);
 if(!Number.isFinite(n))return reject("invalid_utc");
 return n;
}
function bytes64(input:unknown,limit:number):Buffer{
 if(typeof input!=="string"||!input||input.length>Math.ceil(limit/3)*4+4||!B64.test(input))
  return reject("noncanonical_base64");
 const x=input;
 const b=Buffer.from(x,"base64");
 if(b.length===0||b.length>limit||b.toString("base64")!==x)return reject("noncanonical_base64");
 return b;
}

/** Three independently pinned collectors; replay pin is a TRUSTED external
 * high-water mark, not supplied by the signed evidence under inspection.
 */
export function authenticateStorageAtlas(input:unknown,policy:AtlasTrustPolicy,now:Date=new Date()):SignedAtlasPublic{
 const env=object(input);
 if(env.schema!==SIGNED_ATLAS_SCHEMA||!Array.isArray(env.receipts)||env.receipts.length!==3)
  return reject("three_receipts_required");
 const nowMs=now.getTime();
 if(!Number.isFinite(nowMs))return reject("clock");
 const outputs:Record<string,Record<string,unknown>>={};
 const sequences:Record<string,number>={};
 const seenKeys=new Set<string>();
 for(const raw of env.receipts){
  const receipt=object(raw),plane=str(receipt.plane) as StoragePlane;
  if(!PLANES.includes(plane)||outputs[plane])return reject("unknown_or_duplicate_plane");
  const pin=object(policy[plane]);
  const pub=str(pin.public_key_pem),collector=str(pin.collector_id);
  if(seenKeys.has(pub))return reject("shared_collector_public_key");
  seenKeys.add(pub);
  if(!HEX40.test(str(pin.source_sha))||!HEX64.test(str(pin.previous_receipt_sha256)))
   return reject("unqualified_pins");
  const lower=safeInt(pin.minimum_sequence);
  if(lower>=Number.MAX_SAFE_INTEGER)return reject("sequence_overflow");
  const data=bytes64(receipt.payload_base64,128*1024);
  const signature=bytes64(receipt.signature_base64,128);
  if(signature.length!==64)return reject("ed25519_signature_size");
  let key;
  try{key=createPublicKey(pub);}catch{return reject("untrusted_public_key")}
  if(key.asymmetricKeyType!=="ed25519"||!verifySignature(null,Buffer.concat([DOMAIN,data]),key,signature))
   return reject("signature");
  let decoded:unknown;
  try{decoded=JSON.parse(data.toString("utf8"));}catch{return reject("invalid_payload")}
  const v=object(decoded);
  if(v.plane!==plane||v.collector_id!==collector||v.sequence!==lower+1||
    v.previous_receipt_sha256!==pin.previous_receipt_sha256)
   return reject("identity_or_replay");
  if(v.source && typeof v.source==="object"){
   const src=object(v.source);
   if(src.collector!==collector||src.source_sha!==pin.source_sha)return reject("collector_source_drift");
  }else return reject("missing_collector_provenance");
  const fs=object(v.filesystem),desired=plane==="mac"?"apfs":"ext4";
  if(fs.fs_type!==desired||fs.uuid!==pin.filesystem_uuid||
   fs.mount_source!==pin.mount_source||fs.mountpoint!==pin.mountpoint)
   return reject("filesystem_identity_drift");
  if(plane==="hel1-root"&&fs.mountpoint!=="/")return reject("root_mount_drift");
  if(plane==="hel1-volume-105319120"&&fs.uuid!=="a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42")
   return reject("volume_uuid_drift");
  const when=iso(v.observed_at),signed=iso(v.issued_at),ttl=safeInt(v.ttl_seconds);
  if(Math.abs(when-signed)>30_000||signed>nowMs+30_000||ttl<1||ttl>300||nowMs-when>ttl*1000)
   return reject("stale_disputed_or_future_observation");
  if(v.mount_verified!==true)return reject("mount_unverified");
  const cap=object(v.capacity),total=safeInt(cap.total_bytes),free=safeInt(cap.free_blocks_bytes),ordinary=safeInt(cap.ordinary_free_bytes);
  if(total===0||ordinary>free||free>total)return reject("capacity_arithmetic");
  if(!Array.isArray(v.consumers)||v.consumers.length>128)return reject("consumer_bound");
  for(const row of v.consumers){
   const c=object(row);
   if(typeof c.path!=="string"||!c.path.startsWith("/")||c.path.length>4096||c.path.includes("/../")||
    !CLASSES.has(str(c.class)))return reject("invalid_consumer");
   if(c.measured_bytes!==null&&c.measured_bytes!==undefined)safeInt(c.measured_bytes);
  }
  if(v.coverage==="complete"&&(v.census_complete!==true||v.consumers.some((x:unknown)=>object(x).probe_ok!==true)))
   return reject("false_census_complete");
  if(!["complete","partial","inaccessible"].includes(str(v.coverage)))return reject("coverage");
  if(v.measured_reclaimed_bytes!==undefined&&v.measured_reclaimed_bytes!==null)
   return reject("unverified_reclaim_forbidden");
  // The original signed receipt remains PRIVATE. Projection discards paths,
  // identities, signatures and source provenance.
  outputs[plane]=v;
  sequences[plane]=safeInt(v.sequence);
 }
 const assembled={schema:"aoe2war.storage-atlas.private.v1",kind:"aoe2war-storage-atlas-snapshot",
  assembled_at:now.toISOString(),planes:PLANES.map(p=>outputs[p])};
 const snapshot=toStorageAtlasPublicSnapshot(assembled,now);
 return {schema:"aoe2war.storage-atlas.authenticated-public.v1",provenance:"ED25519_THREE_HOST_RECEIPTS",
  admission:"HOLD",live:false,verified_at:now.toISOString(),receipt_sequences:sequences as Record<StoragePlane,number>,
  snapshot};
}
