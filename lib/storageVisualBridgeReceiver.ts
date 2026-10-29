/**
 * Existing AoE2WAR OS bridge: isolated, source-authenticated storage_visual
 * operation. No scanner/timer/deletion/finance/release controller.
 * This is not the independent W1 release witness or a host installation permit.
 */
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {constants} from "node:fs";
import {promises as fs} from "node:fs";
import path from "node:path";
import {HOG_CATALOG,verifyVisualReceipt,readPrivateStorageVisual} from "./storageVisualPrivate.ts";

const SUBMISSION_SCHEMA="aoe2war.storage-visual.bridge-submission.v1";
const SOURCE_SIGNED="aoe2war.storage-visual.source-signed.v1";
const SOURCE_PLANE="aoe2war.storage-visual.source-plane.v1";
const VISUAL_SIGNED="aoe2war.storage-visual.signed.v1";
const VISUAL_SCHEMA="aoe2war.storage-visual.private.v1";
const ACK_SCHEMA="aoe2war.storage-visual.bridge-ack.v1";
const SRC_DOMAIN="AOE2WAR_SOURCE_PLANE_V1\0",VIS_DOMAIN="AOE2WAR_STORAGE_VISUAL_V1\0";
const SUB_DOMAIN="AOE2WAR_STORAGE_BRIDGE_SUBMISSION_V1\0",ACK_DOMAIN="AOE2WAR_STORAGE_BRIDGE_ACK_V1\0";
const PLANES=["mac","hel1-root","hel1-volume-105319120"] as const;
type Plane=typeof PLANES[number];
type Obj=Record<string,unknown>;
type Hog={key:keyof typeof HOG_CATALOG;gross_allocated_bytes:number;overlaps:true};
type SourceRow={id:Plane;observed_at:string;hogs:Hog[]};
type VisualRow={id:Plane;observed_at:string;coverage:"PARTIAL";hogs:Hog[];events:unknown[]};
const hex64=/^[a-f0-9]{64}$/;
const SOURCE_FIELDS=["schema","id","observed_at","source_evidence_sha256","collector","mount_identity","coverage","hogs","events","read_only","auto_delete_permitted","financial_authority"];
function obj(x:unknown):Obj{
 if(x===null||typeof x!=="object"||Array.isArray(x))throw Error("VISUAL_OBJECT_REQUIRED");
 return x as Obj;
}
function exact(x:Obj,fields:string[]){
 const a=Object.keys(x).sort(),b=[...fields].sort();
 if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error("VISUAL_FIELDS_UNRECOGNIZED");
}
function canonical(x:unknown):string{
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 if(x!==null&&typeof x==="object"){
  const o=x as Obj;
  return "{"+Object.keys(o).sort().map(k=>JSON.stringify(k)+":"+canonical(o[k])).join(",")+"}";
 }
 if(typeof x==="number"&&!Number.isSafeInteger(x))throw Error("VISUAL_NUMBER_UNSAFE");
 const encoded=JSON.stringify(x);
 if(encoded===undefined)throw Error("VISUAL_VALUE_UNSAFE");
 return encoded;
}
const sha=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
function hmac(key:string,domain:string,s:string){
 return createHmac("sha256",Buffer.from(key,"hex")).update(domain,"utf8").update(s,"utf8").digest("hex");
}
function matches(expected:string,provided:unknown){
 return typeof provided==="string"&&hex64.test(provided)&&
  timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(provided,"hex"));
}
function keys(){
 const vars=[
  process.env.AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY,
  process.env.AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY,
  process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY,
  process.env.AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY,
 ];
 if(vars.some(k=>typeof k!=="string"||!hex64.test(k))||new Set(vars).size!==4)
  throw Error("VISUAL_CREDENTIAL_SEGREGATION_HOLD");
 const bridgeToken=process.env.AOE2WAR_OS_BRIDGE_TOKEN?.trim();
 if(bridgeToken&&vars.some(k=>bridgeToken===k||bridgeToken===Buffer.from(k!,"hex").toString("base64")))
  throw Error("VISUAL_BRIDGE_TOKEN_KEY_REUSE_HOLD");
 return vars as [string,string,string,string];
}
function stamp(x:unknown,now:number):string{
 if(typeof x!=="string"||x.length>40||!/^20\d{2}-\d\d-\d\dT/.test(x))
  throw Error("VISUAL_TIME_INVALID");
 const t=Date.parse(x);
 if(!Number.isFinite(t)||t>now+60_000||now-t>36*3600_000)throw Error("VISUAL_STALE_OR_FUTURE");
 return x;
}
function size(x:unknown){
 if(typeof x!=="number"||!Number.isSafeInteger(x)||x<0)throw Error("VISUAL_SIZE_INVALID");
 return x;
}
function parseSource(raw:unknown,key:string,now:number){
 const envelope=obj(raw);
 exact(envelope,["schema","payload","signature_hmac_sha256"]);
 if(envelope.schema!==SOURCE_SIGNED)throw Error("VISUAL_SOURCE_ENVELOPE");
 const p=obj(envelope.payload);exact(p,SOURCE_FIELDS);
 if(p.schema!==SOURCE_PLANE||!PLANES.includes(p.id as Plane)||p.coverage!=="PARTIAL"
  ||p.read_only!==true||p.auto_delete_permitted!==false||p.financial_authority!==false
  ||typeof p.source_evidence_sha256!=="string"||!hex64.test(p.source_evidence_sha256))
  throw Error("VISUAL_SOURCE_POLICY");
 const id=p.id as Plane;
 if(p.collector!==(id==="mac"?"MAC_PULSE":"HEL1_ESTATE_OBSERVER"))
  throw Error("VISUAL_ROLE_MISMATCH");
 if(p.mount_identity!==(id==="mac"?"UNVERIFIED_APFS_VOLUME_UUID":"SOURCE_MOUNT_CHECK_NO_UUID"))
  throw Error("VISUAL_MOUNT_UNQUALIFIED");
 stamp(p.observed_at,now);
 if(!Array.isArray(p.events)||p.events.length!==0||!Array.isArray(p.hogs)||p.hogs.length>32)
  throw Error("VISUAL_EVENTS_OR_HOGS");
 const seen=new Set<string>();
 for(const rawHog of p.hogs){
  const h=obj(rawHog);exact(h,["key","gross_allocated_bytes","overlaps"]);
  if(typeof h.key!=="string"||!(h.key in HOG_CATALOG)||seen.has(h.key)||h.overlaps!==true)
   throw Error("VISUAL_HOG_POLICY");
  const rule=HOG_CATALOG[h.key as keyof typeof HOG_CATALOG];
  if(!rule.planes.includes(id))throw Error("VISUAL_HOG_WRONG_PLANE");
  size(h.gross_allocated_bytes);seen.add(h.key);
 }
 const expected=hmac(key,SRC_DOMAIN,canonical(p));
 if(!matches(expected,envelope.signature_hmac_sha256))throw Error("VISUAL_SOURCE_AUTH_HOLD");
 return p as unknown as SourceRow;
}
async function secureDir(dir:string){
 const st=await fs.lstat(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
  (typeof process.getuid==="function"&&st.uid!==process.getuid()))
  throw Error("VISUAL_STORE_DIRECTORY_HOLD");
}
async function secureRead(file:string,max:number){
 const f=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const a=await f.stat();
  if(!a.isFile()||a.nlink!==1||a.size<1||a.size>max||(a.mode&0o077)!==0||
    (typeof process.getuid==="function"&&a.uid!==process.getuid()))throw Error("VISUAL_STORE_FILE_HOLD");
  const s=await f.readFile({encoding:"utf8"});
  const b=await f.stat();
  if(a.ino!==b.ino||a.mtimeMs!==b.mtimeMs||a.size!==b.size)throw Error("VISUAL_STORE_CHANGED");
  return s;
 }finally{await f.close();}
}
async function atomic(file:string,content:string){
 const tmp=file+"."+process.pid+"."+Date.now()+".tmp";
 const handle=await fs.open(tmp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
 try{await handle.writeFile(content,"utf8");await handle.sync();}finally{await handle.close();}
 try{
  await fs.rename(tmp,file);
  const parent=await fs.open(path.dirname(file),constants.O_RDONLY|constants.O_DIRECTORY);
  try{await parent.sync();}finally{await parent.close();}
 }finally{await fs.unlink(tmp).catch(e=>{if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;});}
}
export async function acceptStorageVisualSubmission(raw:unknown,now:Date=new Date()){
 const [macKey,hel1Key,visualKey,ackKey]=keys();
 const submission=obj(raw);exact(submission,["schema","submission_id","source_receipts"]);
 const sources=submission.source_receipts;
 if(submission.schema!==SUBMISSION_SCHEMA||!Array.isArray(sources)||sources.length<1||sources.length>3)
  throw Error("VISUAL_SUBMISSION_INVALID");
 const rawCanonical=canonical(sources);
 const id=sha(SUB_DOMAIN+rawCanonical);
 if(submission.submission_id!==id||Buffer.byteLength(canonical(submission),"utf8")>49152)
  throw Error("VISUAL_SUBMISSION_DIGEST_OR_SIZE_HOLD");
 const nowMs=now.getTime();
 const checked=sources.map(s=>{
  const p=obj(obj(s).payload);
  if(!PLANES.includes(p.id as Plane))throw Error("VISUAL_ID_UNRECOGNIZED");
  return parseSource(s,p.id==="mac"?macKey:hel1Key,nowMs);
 });
 if(new Set(checked.map(p=>p.id)).size!==checked.length||
  checked.some((p,i)=>i>0&&PLANES.indexOf(p.id as Plane)<=PLANES.indexOf(checked[i-1].id as Plane)))
  throw Error("VISUAL_SOURCE_ORDER_OR_DUPLICATE_HOLD");
 const root=process.env.AOE2WAR_OS_STORE_DIR?.trim()||
   (process.env.NODE_ENV==="production"?"/mnt/HC_Volume_105319120/aoe2war/os-control":path.join(process.cwd(),"storage","aoe2war-os"));
 const state=path.join(root,"state"),acks=path.join(state,"storage-visual-bridge-acks.v1");
 await secureDir(state);await secureDir(acks);
 const currentPath=path.join(state,"storage-visual.v1.json");
 const ackPath=path.join(acks,"ack-"+id+".json");
 const lock=path.join(state,".storage-visual-bridge-lock");
 try{await fs.mkdir(lock,{mode:0o700});}catch{throw Error("VISUAL_WRITER_BUSY_HOLD");}
 try{
  const old=await readPrivateStorageVisual(now);
  const oldRaw=await secureRead(currentPath,65536).catch(e=>{
   if((e as NodeJS.ErrnoException).code==="ENOENT")return null;
   throw e;
  });
  if(oldRaw===null&&old.source!=="NONE")throw Error("VISUAL_STORE_INCONSISTENT");
  if(oldRaw!==null&&old.source!=="SIGNED_PRIVATE_RECEIPT")throw Error("VISUAL_STORE_UNTRUSTED");
  const prior=await secureRead(ackPath,4096).catch(e=>{
   if((e as NodeJS.ErrnoException).code==="ENOENT")return null;
   throw e;
  });
  if(prior!==null){
   const entry=obj(JSON.parse(prior));
   if(entry.submission_id!==id||typeof entry.stored_sha256!=="string"||
      oldRaw===null||sha(oldRaw)!==entry.stored_sha256)throw Error("VISUAL_REPLAY_INCONSISTENT");
   return signedAck(id,checked.map(p=>p.id as Plane),now,entry.stored_sha256,ackKey,"IDEMPOTENT");
  }
  const kept=new Map<Plane,VisualRow>();
  for(const p of (old.source==="SIGNED_PRIVATE_RECEIPT"?old.planes:[])){
   if(nowMs-Date.parse(p.observedAt)>36*3600_000)continue;
   kept.set(p.id,{id:p.id,observed_at:p.observedAt,coverage:"PARTIAL",
    hogs:p.hogs.map(h=>({key:h.key,gross_allocated_bytes:h.grossBytes,overlaps:h.overlaps as true})),
    events:p.events.map(e=>({id:e.id,at:e.at,kind:e.kind,category:e.category,bytes:e.bytes,transaction_digest:e.transactionDigest}))});
  }
  for(const p of checked){
   const prev=kept.get(p.id as Plane);
   if(prev&&Date.parse(p.observed_at as string)<=Date.parse(prev.observed_at))
    throw Error("VISUAL_REPLAY_OR_NONMONOTONE_SOURCE");
   kept.set(p.id,{id:p.id,observed_at:p.observed_at,coverage:"PARTIAL",
    hogs:p.hogs,events:[]});
  }
  const payload={schema:VISUAL_SCHEMA,generated_at:now.toISOString(),
   planes:PLANES.filter(x=>kept.has(x)).map(x=>kept.get(x))};
  const envelope={schema:VISUAL_SIGNED,payload,
   signature_hmac_sha256:hmac(visualKey,VIS_DOMAIN,canonical(payload))};
  const validated=verifyVisualReceipt(envelope,visualKey,now);
  if(validated.source!=="SIGNED_PRIVATE_RECEIPT")throw Error("VISUAL_GENERATED_HOLD");
  const raw=canonical(envelope)+"\n";
  if(Buffer.byteLength(raw,"utf8")>65536)throw Error("VISUAL_STORE_TOO_LARGE");
  if((await fs.readdir(acks)).length>=256)throw Error("VISUAL_ACK_CAPACITY_HOLD");
  await atomic(currentPath,raw);
  const readback=await secureRead(currentPath,65536);
  if(readback!==raw)throw Error("VISUAL_READBACK_MISMATCH");
  const digest=sha(readback);
  const ackRecord=canonical({schema:"aoe2war.storage-visual.ack-history.v1",
   submission_id:id,stored_sha256:digest,at:now.toISOString()})+"\n";
  const ah=await fs.open(ackPath,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{await ah.writeFile(ackRecord);await ah.sync();}finally{await ah.close();}
  const dirHandle=await fs.open(acks,constants.O_RDONLY|constants.O_DIRECTORY);
  try{await dirHandle.sync();}finally{await dirHandle.close();}
  return signedAck(id,checked.map(p=>p.id as Plane),now,digest,ackKey,"NEW");
 }finally{await fs.rmdir(lock);}
}
function signedAck(id:string,accepted:Plane[],now:Date,digest:string,key:string,replay:"NEW"|"IDEMPOTENT"){
 const payload={schema:ACK_SCHEMA,status:"STORED_VERIFIED_READBACK",submission_id:id,
  accepted_planes:accepted,received_at:now.toISOString(),stored_sha256:digest,
  readback_sha256:digest,replay};
 return {payload,signature_hmac_sha256:hmac(key,ACK_DOMAIN,canonical(payload))};
}
