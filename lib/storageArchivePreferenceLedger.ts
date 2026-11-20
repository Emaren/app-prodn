/** Append-only owner YES/NO archive preference; NEVER a transfer or deletion permit. */
import {createHash,createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import {constants,promises as fs} from "node:fs";
import path from "node:path";
import type {ExactItem} from "./storageExactItemSource.ts";

export const ARCHIVE_SCHEMA="aoe2war.storage-archive-preference.v1" as const;
const DOMAIN="AOE2WAR:STORAGE-ARCHIVE-PREFERENCE:V1\0";
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[A-Fa-f0-9-]{36}$/;
const FILENAME=/^archive-choice-[0-9]{13}-[a-f0-9-]{36}\.json$/;
export type ArchiveChoice="YES"|"NO";
export type ArchiveEvent={
  schema:typeof ARCHIVE_SCHEMA;id:string;at:string;
  ownerBinding:string;objectId:string;sourceFingerprint:string;
  sourceDigest:string;sourceObservedAt:string;
  machine:string;deviceId:string;inode:string;filesystemUuid:string;
  allocatedBytes:number;logicalBytes:number;
  choice:ArchiveChoice;previousChoiceId:string|null;
  previousId:string|null;previousDigest:string|null;
  effect:"OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE";
  digestSha256:string;hmacSha256:string;
};
type Bare=Omit<ArchiveEvent,"digestSha256"|"hmacSha256">;
const isChoice=(x:unknown):x is ArchiveChoice=>x==="YES"||x==="NO";
function stable(v:unknown):string{
  if(Array.isArray(v))return "["+v.map(stable).join(",")+"]";
  if(v&&typeof v==="object"){const x=v as Record<string,unknown>;
    return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";}
  return JSON.stringify(v);
}
function key(){
  const raw=process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY?.trim();
  if(!raw||!SHA.test(raw)||[process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY,
    process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY,
    process.env.AOE2WAR_STORAGE_EXACT_OBJECT_HMAC_KEY,
    process.env.AOE2WAR_INTEL_COLD_HMAC_KEY].some(k=>k?.toLowerCase()===raw.toLowerCase()))
    throw Error("ARCHIVE_ISOLATED_KEY_NOT_ENROLLED");
  return Buffer.from(raw,"hex");
}
function digest(bare:Bare){
  return createHash("sha256").update(DOMAIN).update(stable(bare)).digest("hex");
}
function sign(hash:string,secret:Buffer){
  return createHmac("sha256",secret).update(DOMAIN).update(hash).digest("hex");
}
function stateDir(){
  return path.join(process.env.AOE2WAR_OS_STORE_DIR?.trim()||
    (process.env.NODE_ENV==="production"?"/mnt/HC_Volume_105319120/aoe2war/os-control":
      path.join(process.cwd(),"storage","aoe2war-os")),"state");
}
async function checkDir(p:string){
  const stat=await fs.lstat(p);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o022))
    throw Error("ARCHIVE_UNSAFE_DIRECTORY");
}
async function getDir(create:boolean){
  const parent=stateDir();await checkDir(parent);
  const directory=path.join(parent,"storage-archive-preferences.v1");
  if(create)try{await fs.mkdir(directory,{mode:0o700});}
    catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;}
  await checkDir(directory);
  return directory;
}
function valid(event:unknown,secret:Buffer):event is ArchiveEvent{
  if(!event||typeof event!=="object"||Array.isArray(event))return false;
  const e=event as Record<string,unknown>;
  if(e.schema!==ARCHIVE_SCHEMA||typeof e.id!=="string"||!UUID.test(e.id)||
     typeof e.at!=="string"||!Number.isFinite(Date.parse(e.at))||
     typeof e.ownerBinding!=="string"||!SHA.test(e.ownerBinding)||
     typeof e.objectId!=="string"||!SHA.test(e.objectId)||
     typeof e.sourceFingerprint!=="string"||!SHA.test(e.sourceFingerprint)||
     typeof e.sourceDigest!=="string"||!SHA.test(e.sourceDigest)||
     typeof e.sourceObservedAt!=="string"||!Number.isFinite(Date.parse(e.sourceObservedAt))||
     typeof e.machine!=="string"||e.machine.length<3||e.machine.length>64||
     typeof e.deviceId!=="string"||!/^[0-9]{1,20}$/.test(e.deviceId)||
     typeof e.inode!=="string"||!/^[0-9]{1,20}$/.test(e.inode)||
     typeof e.filesystemUuid!=="string"||!UUID.test(e.filesystemUuid)||
     !Number.isSafeInteger(e.allocatedBytes)||Number(e.allocatedBytes)<0||
     !Number.isSafeInteger(e.logicalBytes)||Number(e.logicalBytes)<0||
     !isChoice(e.choice)||
     !(e.previousChoiceId===null||(typeof e.previousChoiceId==="string"&&UUID.test(e.previousChoiceId)))||
     !(e.previousId===null||(typeof e.previousId==="string"&&UUID.test(e.previousId)))||
     !(e.previousDigest===null||(typeof e.previousDigest==="string"&&SHA.test(e.previousDigest)))||
     e.effect!=="OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE"||
     typeof e.digestSha256!=="string"||!SHA.test(e.digestSha256)||
     typeof e.hmacSha256!=="string"||!SHA.test(e.hmacSha256))return false;
  const bare=Object.fromEntries(Object.entries(e).filter(([k])=>k!=="digestSha256"&&k!=="hmacSha256")) as Bare;
  const sum=digest(bare);
  return timingSafeEqual(Buffer.from(sum,"hex"),Buffer.from(e.digestSha256 as string,"hex"))&&
    timingSafeEqual(Buffer.from(sign(sum,secret),"hex"),Buffer.from(e.hmacSha256 as string,"hex"));
}
export async function readArchiveEvents():Promise<ArchiveEvent[]>{
  const secret=key();let dir:string;
  try{dir=await getDir(false);}
  catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [];throw e;}
  const names=(await fs.readdir(dir)).filter(n=>n!==".write-lock").sort();
  if(names.length>2048||names.some(n=>!FILENAME.test(n)))throw Error("ARCHIVE_EVENT_NAMES_HOLD");
  const events:ArchiveEvent[]=[];let prior:ArchiveEvent|null=null;
  for(const n of names){
    const fh=await fs.open(path.join(dir,n),
      constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const a=await fh.stat();
      if(!a.isFile()||a.nlink!==1||a.size<20||a.size>2000||(a.mode&0o077))
        throw Error("ARCHIVE_EVENT_UNSAFE");
      const value=await fh.readFile("utf8");const b=await fh.stat();
      if(a.ino!==b.ino||a.size!==b.size||a.mtimeMs!==b.mtimeMs)
        throw Error("ARCHIVE_EVENT_RACE");
      const e:unknown=JSON.parse(value);
      if(!valid(e,secret))throw Error("ARCHIVE_EVENT_TAMPER");
      const event=e as ArchiveEvent;
      if(event.previousId!==(prior?.id??null)||
         event.previousDigest!==(prior?.digestSha256??null)||
         (prior!==null&&Date.parse(event.at)<=Date.parse(prior.at)))
        throw Error("ARCHIVE_EVENT_CHAIN_BROKEN");
      const previousForObject=events.filter(x=>x.objectId===event.objectId).at(-1);
      if(event.previousChoiceId!==(previousForObject?.id??null))
        throw Error("ARCHIVE_OBJECT_EVENT_CHAIN_BROKEN");
      events.push(event);prior=event;
    }finally{await fh.close();}
  }
  return events;
}
export function latestArchiveChoice(events:readonly ArchiveEvent[],objectId:string){
  return events.filter(e=>e.objectId===objectId).at(-1)??null;
}
export async function appendArchiveChoice(input:{
  object:ExactItem;choice:ArchiveChoice;previousChoiceId:string|null;
  ownerBinding:string;
}):Promise<ArchiveEvent>{
  if(!isChoice(input.choice)||!SHA.test(input.ownerBinding)||
     !SHA.test(input.object.objectId)||!SHA.test(input.object.fingerprint)||
     !SHA.test(input.object.sourceDigest))
    throw Error("ARCHIVE_CHOICE_FIELDS_INVALID");
  const dir=await getDir(true),lock=path.join(dir,".write-lock");
  try{await fs.mkdir(lock,{mode:0o700});}
  catch{throw Error("ARCHIVE_WRITE_BUSY");}
  try{
    const history=await readArchiveEvents();
    if(history.some(e=>e.ownerBinding!==input.ownerBinding))
      throw Error("ARCHIVE_OWNER_LINEAGE_HOLD");
    if(history.length>=2048)throw Error("ARCHIVE_LOG_FULL");
    const last=latestArchiveChoice(history,input.object.objectId);
    if((last?.id??null)!==input.previousChoiceId)
      throw Error("ARCHIVE_STALE_CHOICE");
    if(last?.choice===input.choice)throw Error("ARCHIVE_DUPLICATE_CHOICE");
    const before=history.at(-1);
    const at=new Date(Math.max(Date.now(),before?Date.parse(before.at)+1:0)).toISOString();
    const obj=input.object;
    const bare:Bare={schema:ARCHIVE_SCHEMA,id:randomUUID(),at,
      ownerBinding:input.ownerBinding,objectId:obj.objectId,
      sourceFingerprint:obj.fingerprint,sourceDigest:obj.sourceDigest,
      sourceObservedAt:obj.observedAt,machine:obj.machine,
      deviceId:obj.deviceId,inode:obj.inode,filesystemUuid:obj.filesystemUuid,
      allocatedBytes:obj.allocatedBytes,logicalBytes:obj.logicalBytes,
      choice:input.choice,previousChoiceId:last?.id??null,
      previousId:before?.id??null,previousDigest:before?.digestSha256??null,
      effect:"OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE"};
    const sum=digest(bare);
    const event:ArchiveEvent={...bare,digestSha256:sum,hmacSha256:sign(sum,key())};
    const filename="archive-choice-"+Date.parse(at)+"-"+event.id+".json";
    const fh=await fs.open(path.join(dir,filename),
      constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    try{await fh.writeFile(JSON.stringify(event)+"\n");await fh.sync();}
    finally{await fh.close();}
    const df=await fs.open(dir,constants.O_RDONLY);
    try{await df.sync();}finally{await df.close();}
    return event;
  }finally{await fs.rmdir(lock);}
}
