/** Private, append-only owner review intent. Never a cleanup permit or scanner. */
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PlaneId, VisualReviewItem } from "./storageVisualPrivate";

export const REVIEW_SCHEMA="aoe2war.storage-owner-review.v1";
export type OwnerDecision="PROTECT"|"REVIEW_LATER"|"SINGLE_CANDIDATE_APPROVAL"|"MIGRATION_REVIEW"|"REVOKE";
export type OwnerReviewEvent={
  schema:typeof REVIEW_SCHEMA; id:string; at:string; plane:PlaneId; alias:string;
  fingerprint:string; sourceDigest:string; sourceRevision:string; category:string;
  decision:OwnerDecision; expiresAt:string|null; previousId:string|null;
  effect:"INTENT_ONLY_NO_DELETE";
};
const MAX_EVENTS=256;
const FILE_RE=/^decision-[0-9]{13}-[a-f0-9-]{36}\.json$/;
function rootDir(){
  const root=process.env.AOE2WAR_OS_STORE_DIR?.trim()||
    (process.env.NODE_ENV==="production"?"/mnt/HC_Volume_105319120/aoe2war/os-control":path.join(process.cwd(),"storage","aoe2war-os"));
  return path.join(root,"state");
}
async function checkedDir(dir:string){
  const st=await fs.lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error("REVIEW_DIRECTORY_UNSAFE");
}
async function getDir(create:boolean){
  const state=rootDir();
  await checkedDir(state); // No operator store initialization.
  const dir=path.join(state,"storage-owner-reviews.v1");
  if(create){
    try{await fs.mkdir(dir,{mode:0o700});}catch(e){
      if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;
    }
  }
  await checkedDir(dir);
  return dir;
}
function validEvent(e:unknown):e is OwnerReviewEvent{
  if(!e||typeof e!=="object"||Array.isArray(e))return false;
  const x=e as Record<string,unknown>;
  return x.schema===REVIEW_SCHEMA&&typeof x.id==="string"&&/^[a-f0-9-]{36}$/.test(x.id)&&
    typeof x.at==="string"&&Number.isFinite(Date.parse(x.at))&&
    ["mac","hel1-root","hel1-volume-105319120"].includes(x.plane as string)&&
    typeof x.alias==="string"&&/^[A-Z][A-Z0-9_-]{5,39}$/.test(x.alias)&&
    typeof x.fingerprint==="string"&&/^[a-f0-9]{64}$/.test(x.fingerprint)&&
    typeof x.sourceDigest==="string"&&/^[a-f0-9]{64}$/.test(x.sourceDigest)&&
    typeof x.sourceRevision==="string"&&/^[a-f0-9]{40}$/.test(x.sourceRevision)&&
    typeof x.category==="string"&&/^[A-Z_]{3,48}$/.test(x.category)&&
    ["PROTECT","REVIEW_LATER","SINGLE_CANDIDATE_APPROVAL","MIGRATION_REVIEW","REVOKE"].includes(x.decision as string)&&
    (x.expiresAt===null||(typeof x.expiresAt==="string"&&Number.isFinite(Date.parse(x.expiresAt))))&&
    (x.previousId===null||(typeof x.previousId==="string"&&/^[a-f0-9-]{36}$/.test(x.previousId)))&&
    x.effect==="INTENT_ONLY_NO_DELETE";
}
export async function readOwnerReviews():Promise<OwnerReviewEvent[]>{
  // Missing operator state means UNKNOWN, not an authenticated empty history.
  await checkedDir(rootDir());
  let dir:string;
  try{dir=await getDir(false);}catch(e){
    if((e as NodeJS.ErrnoException).code==="ENOENT")return [];
    throw e;
  }
  const names=(await fs.readdir(dir)).filter(n=>n!==".write-lock").sort();
  if(names.length>MAX_EVENTS||names.some(n=>!FILE_RE.test(n)))throw Error("REVIEW_HISTORY_BOUNDS_HOLD");
  const events:OwnerReviewEvent[]=[];
  for(const name of names){
    const fh=await fs.open(path.join(dir,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const before=await fh.stat();
      if(!before.isFile()||before.nlink!==1||before.size>2048||before.size===0||(before.mode&0o077)!==0)
        throw Error("REVIEW_EVENT_FILE_UNSAFE");
      const raw=await fh.readFile({encoding:"utf8"});
      const after=await fh.stat();
      if(before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)
        throw Error("REVIEW_EVENT_CHANGED");
      const event:unknown=JSON.parse(raw);
      if(!validEvent(event))throw Error("REVIEW_EVENT_INVALID");
      events.push(event);
    }finally{await fh.close();}
  }
  return events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
}
export function latestEvent(events:OwnerReviewEvent[],plane:PlaneId,alias:string){
  return events.filter(e=>e.plane===plane&&e.alias===alias).at(-1)??null;
}
export function effectiveOwnerDecision(event:OwnerReviewEvent|null,item:VisualReviewItem,now:Date){
  if(!event||event.decision==="REVOKE"||event.fingerprint!==item.fingerprint||
    event.sourceDigest!==item.sourceDigest||event.sourceRevision!==item.sourceRevision||
    event.category!==item.category||(event.expiresAt!==null&&Date.parse(event.expiresAt)<=now.getTime()))
    return null;
  return event.decision;
}
/** Immutable review event; exclusive writer lease prevents stale concurrent intent. */
export async function appendOwnerReview(args:{
  plane:PlaneId;item:VisualReviewItem;decision:OwnerDecision;previousId:string|null;now?:Date;
}):Promise<OwnerReviewEvent>{
  const dir=await getDir(true),lock=path.join(dir,".write-lock");
  try{await fs.mkdir(lock,{mode:0o700});}catch{throw Error("REVIEW_BUSY_HOLD");}
  try{
    const events=await readOwnerReviews();
    if(events.length>=MAX_EVENTS)throw Error("REVIEW_HISTORY_FULL_HOLD");
    const previous=latestEvent(events,args.plane,args.item.alias);
    if((previous?.id??null)!==args.previousId)throw Error("REVIEW_STALE_EXPECTATION");
    if(args.decision==="REVOKE"&&!previous)throw Error("REVIEW_NOTHING_TO_REVOKE");
    const now=args.now??new Date();
    const ttl=args.decision==="SINGLE_CANDIDATE_APPROVAL"?10*60_000:30*24*3600_000;
    const event:OwnerReviewEvent={
      schema:REVIEW_SCHEMA,id:randomUUID(),at:now.toISOString(),plane:args.plane,alias:args.item.alias,
      fingerprint:args.item.fingerprint,sourceDigest:args.item.sourceDigest,sourceRevision:args.item.sourceRevision,
      category:args.item.category,decision:args.decision,
      expiresAt:args.decision==="PROTECT"||args.decision==="REVOKE"?null:new Date(now.getTime()+ttl).toISOString(),
      previousId:previous?.id??null,effect:"INTENT_ONLY_NO_DELETE",
    };
    const name=`decision-${String(now.getTime()).padStart(13,"0")}-${event.id}.json`;
    const handle=await fs.open(path.join(dir,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{await handle.writeFile(JSON.stringify(event)+"\n");await handle.sync();}finally{await handle.close();}
    return event;
  }finally{await fs.rmdir(lock);}
}
