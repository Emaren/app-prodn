/** Private, append-only, HMAC-verified owner teaching; no cleanup executor exists here.
 * No secret is auto-created, and GET never creates state. Production requires
 * separate admitted write authority for this nonfinancial log.
 */
import {createHash,createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import {constants} from "node:fs";
import {promises as fs} from "node:fs";
import path from "node:path";
import {
  STORAGE_TEACHING_SCHEMA,teachingDisposition,isTeachingLevel,isTeachingPlane,
  isProtectionLevel,type TeachingPlane,type TeachingLevel,type ProtectionLevel,
  type LearningEffect,
} from "./storageHogTeachingPolicy.ts";

const DOMAIN="AOE2WAR:STORAGE-OWNER-TEACHING:V1\0";
const MAX_EVENTS=2048;
const FILE=/^teaching-[0-9]{13}-[a-f0-9-]{36}\.json$/;
const HEX=/^[0-9a-f]{64}$/;
const CAT=/^[A-Z][A-Z0-9_-]{2,47}$/;
const HEXKEY=/^[0-9a-f]{64}$/i;

export type TeachingEvent={
  schema:typeof STORAGE_TEACHING_SCHEMA;
  id:string;at:string;plane:TeachingPlane;category:string;
  sourceObservedAt:string;sourceFingerprint:string;grossBytes:number;
  sourceFloor:ProtectionLevel;overlaps:boolean;
  requestedLevel:TeachingLevel;effectiveLevel:ProtectionLevel;
  note:string;previousId:string|null;previousDigest:string|null;
  effect:LearningEffect;digestSha256:string;hmacSha256:string;
};
type BareEvent=Omit<TeachingEvent,"digestSha256"|"hmacSha256">;

function key():Buffer {
  const hex=process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY?.trim();
  if(!hex||!HEXKEY.test(hex))throw Error("TEACHING_KEY_NOT_ENROLLED");
  if(hex.toLowerCase()===process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY?.trim().toLowerCase())
    throw Error("TEACHING_KEY_REUSED_WITH_VISUAL");
  return Buffer.from(hex,"hex");
}
function stateDir(){
  const base=process.env.AOE2WAR_OS_STORE_DIR?.trim() ||
    (process.env.NODE_ENV==="production"?
      "/mnt/HC_Volume_105319120/aoe2war/os-control":
      path.join(process.cwd(),"storage","aoe2war-os"));
  return path.join(base,"state");
}
async function checkedDir(where:string){
  const info=await fs.lstat(where);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o022))
    throw Error("TEACHING_DIRECTORY_UNSAFE");
}
async function ledgerDir(create:boolean){
  const base=stateDir();
  await checkedDir(base);
  const target=path.join(base,"storage-owner-teaching.v1");
  if(create){
    try{await fs.mkdir(target,{mode:0o700});}
    catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;}
  }
  await checkedDir(target);
  return target;
}
function stable(value:unknown):string{
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  if(value&&typeof value==="object"){
    const o=value as Record<string,unknown>;
    return "{"+Object.keys(o).sort().map(k=>JSON.stringify(k)+":"+stable(o[k])).join(",")+"}";
  }
  return JSON.stringify(value);
}
function digest(bare:BareEvent){
  return createHash("sha256").update(DOMAIN).update(stable(bare)).digest("hex");
}
function signature(sum:string,secret:Buffer){
  return createHmac("sha256",secret).update(DOMAIN).update(sum).digest("hex");
}
export function observedHogFingerprint(source:{
  plane:TeachingPlane;at:string;key:string;bytes:number;level:ProtectionLevel;overlaps:boolean;
}){
  return createHash("sha256").update(DOMAIN).update(stable(source)).digest("hex");
}
function verified(event:unknown,secret:Buffer):event is TeachingEvent{
  if(!event||typeof event!=="object"||Array.isArray(event))return false;
  const x=event as Record<string,unknown>;
  if(x.schema!==STORAGE_TEACHING_SCHEMA||
    typeof x.id!=="string"||!/^[a-f0-9-]{36}$/.test(x.id)||
    typeof x.at!=="string"||!Number.isFinite(Date.parse(x.at))||
    !isTeachingPlane(x.plane)||
    typeof x.category!=="string"||!CAT.test(x.category)||
    typeof x.sourceObservedAt!=="string"||!Number.isFinite(Date.parse(x.sourceObservedAt))||
    typeof x.sourceFingerprint!=="string"||!HEX.test(x.sourceFingerprint)||
    typeof x.grossBytes!=="number"||!Number.isSafeInteger(x.grossBytes)||x.grossBytes<0||
    !isProtectionLevel(x.sourceFloor)||typeof x.overlaps!=="boolean"||
    !isTeachingLevel(x.requestedLevel)||!isProtectionLevel(x.effectiveLevel)||
    typeof x.note!=="string"||x.note.length>160||
    !(x.previousId===null||(typeof x.previousId==="string"&&/^[a-f0-9-]{36}$/.test(x.previousId)))||
    !(x.previousDigest===null||(typeof x.previousDigest==="string"&&HEX.test(x.previousDigest)))||
    typeof x.digestSha256!=="string"||!HEX.test(x.digestSha256)||
    typeof x.hmacSha256!=="string"||!HEX.test(x.hmacSha256))return false;
  const decision=teachingDisposition(x.sourceFloor,x.requestedLevel);
  if(decision.status!=="ACCEPT"||decision.effectiveLevel!==x.effectiveLevel||
    decision.effect!==x.effect)return false;
  const d=digest(Object.fromEntries(Object.entries(x).filter(([k])=>
    k!=="digestSha256"&&k!=="hmacSha256")) as BareEvent);
  return timingSafeEqual(Buffer.from(d),Buffer.from(x.digestSha256 as string)) &&
    timingSafeEqual(Buffer.from(signature(d,secret)),Buffer.from(x.hmacSha256 as string));
}
export async function readTeachingEvents():Promise<TeachingEvent[]>{
  const secret=key();
  let dir:string;
  try{dir=await ledgerDir(false);}
  catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [];throw e;}
  const names=(await fs.readdir(dir)).filter(n=>n!==".write-lock").sort();
  if(names.length>MAX_EVENTS||names.some(n=>!FILE.test(n)))
    throw Error("TEACHING_EVENT_NAMES_HOLD");
  const events:TeachingEvent[]=[];
  let prior:TeachingEvent|null=null;
  for(const name of names){
    const fh=await fs.open(path.join(dir,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const a=await fh.stat();
      if(!a.isFile()||a.nlink!==1||a.size<20||a.size>2300||(a.mode&0o077))
        throw Error("TEACHING_EVENT_FILE_UNSAFE");
      const data=await fh.readFile("utf8");
      const b=await fh.stat();
      if(a.ino!==b.ino||a.size!==b.size||a.mtimeMs!==b.mtimeMs)
        throw Error("TEACHING_EVENT_CHANGED");
      const candidate:unknown=JSON.parse(data);
      if(!verified(candidate,secret))throw Error("TEACHING_EVENT_FORGED_OR_INVALID");
      const x=candidate as TeachingEvent;
      if(x.previousId!==(prior?.id??null)||x.previousDigest!==(prior?.digestSha256??null)||
         (prior!==null&&Date.parse(x.at)<=Date.parse(prior.at)))
        throw Error("TEACHING_EVENT_CHAIN_BROKEN");
      events.push(x);prior=x;
    }finally{await fh.close();}
  }
  return events;
}
export function latestTeachingEvent(events:TeachingEvent[],plane:TeachingPlane,category:string){
  return events.filter(x=>x.plane===plane&&x.category===category).at(-1)??null;
}
export async function appendTeachingEvent(input:{
  plane:TeachingPlane;category:string;sourceObservedAt:string;sourceFingerprint:string;
  grossBytes:number;sourceFloor:ProtectionLevel;overlaps:boolean;
  requestedLevel:TeachingLevel;note:string;previousId:string|null;
}):Promise<TeachingEvent>{
  if(!CAT.test(input.category)||!HEX.test(input.sourceFingerprint)||!isTeachingPlane(input.plane)||
     !isTeachingLevel(input.requestedLevel)||!isProtectionLevel(input.sourceFloor)||
     !Number.isSafeInteger(input.grossBytes)||input.grossBytes<0||
     typeof input.overlaps!=="boolean"||!Number.isFinite(Date.parse(input.sourceObservedAt))||
     typeof input.note!=="string"||input.note.length>160)
    throw Error("TEACHING_FIELDS_INVALID");
  const dir=await ledgerDir(true),lock=path.join(dir,".write-lock");
  try{await fs.mkdir(lock,{mode:0o700});}catch{throw Error("TEACHING_BUSY_HOLD");}
  try{
    const old=await readTeachingEvents();
    if(old.length>=MAX_EVENTS)throw Error("TEACHING_LOG_FULL");
    const latest=latestTeachingEvent(old,input.plane,input.category);
    if((latest?.id??null)!==input.previousId)throw Error("TEACHING_STALE_EXPECTATION");
    const immutable=old.some(e=>e.plane===input.plane&&e.category===input.category&&e.requestedLevel===5);
    const admission=teachingDisposition(input.sourceFloor,input.requestedLevel,immutable);
    if(admission.status!=="ACCEPT"||admission.effect===null||admission.effectiveLevel===null)
      throw Error("TEACHING_PROTECTED_LEVEL_HOLD");
    if(immutable)throw Error("TEACHING_L5_ALREADY_PERMANENT");
    const before=old.at(-1)??null;
    const stamp=new Date(Math.max(Date.now(),before?Date.parse(before.at)+1:0)).toISOString();
    const bare:BareEvent={schema:STORAGE_TEACHING_SCHEMA,id:randomUUID(),at:stamp,
      plane:input.plane,category:input.category,
      sourceObservedAt:input.sourceObservedAt,sourceFingerprint:input.sourceFingerprint,
      grossBytes:input.grossBytes,sourceFloor:input.sourceFloor,overlaps:input.overlaps,
      requestedLevel:input.requestedLevel,effectiveLevel:admission.effectiveLevel,
      note:input.note,previousId:before?.id??null,previousDigest:before?.digestSha256??null,
      effect:admission.effect};
    // The chain is global. UI concurrency token is category-specific; keep
    // category target's last event in the separately validated request only.
    const sum=digest(bare),event:TeachingEvent={...bare,digestSha256:sum,hmacSha256:signature(sum,key())};
    const name="teaching-"+String(Date.parse(stamp)).padStart(13,"0")+"-"+event.id+".json";
    const fh=await fs.open(path.join(dir,name),constants.O_EXCL|constants.O_CREAT|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    try{await fh.writeFile(JSON.stringify(event)+"\n");await fh.sync();}
    finally{await fh.close();}
    const d=await fs.open(dir,constants.O_RDONLY);
    try{await d.sync();}finally{await d.close();}
    return event;
  }finally{await fs.rmdir(lock);}
}
