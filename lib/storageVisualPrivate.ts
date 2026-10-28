/**
 * Private authenticated visual-only storage observations.
 * Never scans a filesystem, follows a target path, claims deletion permission,
 * or treats gross directories as physical APFS recovery.
 *
 * Source owners publish a bounded HMAC receipt in the existing OS state dir.
 * Missing key/receipt => UNKNOWN; malformed/unsigned => fail closed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

export const VISUAL_SCHEMA = "aoe2war.storage-visual.private.v1";
export const SIGNED_SCHEMA = "aoe2war.storage-visual.signed.v1";
const DOMAIN = "AOE2WAR_STORAGE_VISUAL_V1\0";
const MAX_FILE = 64 * 1024;
const MAX_EVENTS = 64;
const MAX_HOGS = 32;
export type PlaneId = "mac" | "hel1-root" | "hel1-volume-105319120";
export type Level = 1 | 2 | 3 | 4;
export type HogKey =
  | "CROSSOVER_STEAM_REPLAY" | "RECOVERY_VAULT" | "MOBILESYNC_BACKUPS"
  | "GUARDED_GENERATED" | "DOWNLOADS" | "DOCKER_VM" | "CODEX_WORKTREES" | "CODEX_RUNTIME"
  | "E5_SEAL" | "APP_ACTIVE_DEPENDENCIES" | "RENAISSANCE_DEPENDENCIES"
  | "WATCHER_SIGNED_DIST" | "OTHER_GENERATED" | "PROJECT_SOURCE"
  | "PYTHON_TOOLCHAINS" | "GO_MODULES" | "BROWSER_CACHES"
  | "HEL1_ROOT_SYSTEM" | "HEL1_DEPLOY_BUILDS" | "HEL1_ROOT_BACKUPS"
  | "HEL1_EVIDENCE_ARCHIVE" | "HEL1_TRAFFIC_DB" | "HEL1_ACTIVE_SWAP"
  | "HEL1_FINANCIAL_RESTORE" | "HEL1_SNAPSHOTS" | "HEL1_STAGING"
  | "OTHER_MEASURED";

export const HOG_CATALOG: Record<HogKey,{ label: string; level: Level; planes: readonly PlaneId[] }> = {
  GUARDED_GENERATED:{label:"Source-qualified generated review",level:1,planes:["mac","hel1-root","hel1-volume-105319120"]},
  CROSSOVER_STEAM_REPLAY:{label:"CrossOver · Steam & Replay Lab",level:4,planes:["mac"]},
  RECOVERY_VAULT:{label:"Recovery vault",level:4,planes:["mac"]},
  MOBILESYNC_BACKUPS:{label:"iPhone & iPad backups",level:4,planes:["mac"]},
  DOWNLOADS:{label:"Downloads · owner review",level:2,planes:["mac"]},
  DOCKER_VM:{label:"Docker virtual disks",level:3,planes:["mac"]},
  CODEX_WORKTREES:{label:"Codex worktrees",level:4,planes:["mac"]},
  CODEX_RUNTIME:{label:"Codex runtime",level:4,planes:["mac"]},
  E5_SEAL:{label:"E5 release seal",level:4,planes:["mac"]},
  APP_ACTIVE_DEPENDENCIES:{label:"Active app dependencies",level:4,planes:["mac"]},
  RENAISSANCE_DEPENDENCIES:{label:"Historical Renaissance dependencies",level:2,planes:["mac"]},
  WATCHER_SIGNED_DIST:{label:"Signed Watcher distribution",level:4,planes:["mac"]},
  OTHER_GENERATED:{label:"Other generated outputs",level:2,planes:["mac","hel1-root","hel1-volume-105319120"]},
  PROJECT_SOURCE:{label:"Project source & worktrees",level:4,planes:["mac"]},
  PYTHON_TOOLCHAINS:{label:"Python toolchains",level:2,planes:["mac"]},
  GO_MODULES:{label:"Go module cache",level:2,planes:["mac"]},
  BROWSER_CACHES:{label:"Browser caches",level:2,planes:["mac"]},
  HEL1_ROOT_SYSTEM:{label:"Root OS & services",level:4,planes:["hel1-root"]},
  HEL1_DEPLOY_BUILDS:{label:"Deployment builds",level:3,planes:["hel1-root"]},
  HEL1_ROOT_BACKUPS:{label:"Root backup evidence",level:4,planes:["hel1-root"]},
  HEL1_EVIDENCE_ARCHIVE:{label:"Evidence archive",level:4,planes:["hel1-volume-105319120"]},
  HEL1_TRAFFIC_DB:{label:"Traffic database",level:4,planes:["hel1-volume-105319120"]},
  HEL1_ACTIVE_SWAP:{label:"Active swap",level:4,planes:["hel1-volume-105319120"]},
  HEL1_FINANCIAL_RESTORE:{label:"Financial restore",level:4,planes:["hel1-volume-105319120"]},
  HEL1_SNAPSHOTS:{label:"Snapshot generations",level:3,planes:["hel1-root","hel1-volume-105319120"]},
  HEL1_STAGING:{label:"Stage and rollback outputs",level:3,planes:["hel1-root","hel1-volume-105319120"]},
  OTHER_MEASURED:{label:"Other measured buckets",level:3,planes:["mac","hel1-root","hel1-volume-105319120"]},
};
const PLANE_IDS: PlaneId[]=["mac","hel1-root","hel1-volume-105319120"];
const EVENT_KINDS=["GENERATED","PRUNE_RECEIPT","PRUNE_HOLD","NEXT_REVIEW","SNAPSHOT","COLLECTED"] as const;
export type VisualEventKind=typeof EVENT_KINDS[number];
export type VisualHog={key:HogKey;label:string;level:Level;grossBytes:number;overlaps:boolean};
export type VisualEvent={id:string;at:string;kind:VisualEventKind;category:HogKey|null;bytes:number|null;transactionDigest:string|null};
export type VisualReviewItem={
  alias:string; category:HogKey; level:Level; grossBytes:number;
  fingerprint:string; sourceDigest:string; sourceRevision:string;
  sourceStatus:"GUARDED"|"REVIEW_ONLY"|"PROTECTED"|"MIGRATION_REVIEW";
  proofState:"COMPLETE"|"INCOMPLETE"; overlaps:boolean;
};
export type VisualCapacitySample={at:string; ordinaryFreeBytes:number};
export type VisualPlane={
  id:PlaneId; observedAt:string; coverage:"PARTIAL"|"DISJOINT"; hogs:VisualHog[];
  events:VisualEvent[];status:"RECEIPT"|"STALE";
  reviewItems?:VisualReviewItem[];capacitySamples?:VisualCapacitySample[];
};
export type StorageVisualView={
  authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY";
  planes:VisualPlane[];
  source:"SIGNED_PRIVATE_RECEIPT"|"NONE";
};
export const EMPTY_VISUAL:StorageVisualView={
  authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[],source:"NONE"
};
function obj(x:unknown):Record<string,unknown>{
  return x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
}
function safeBytes(x:unknown):number|null{
  return typeof x==="number"&&Number.isSafeInteger(x)&&x>=0?x:null;
}
function time(x:unknown):string|null{
  return typeof x==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(x)
    &&Number.isFinite(Date.parse(x))?x:null;
}
function isKey(x:unknown):x is HogKey{
  return typeof x==="string"&&Object.prototype.hasOwnProperty.call(HOG_CATALOG,x);
}
function stableStringify(value:unknown):string{
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  if(value!==null&&typeof value==="object"){
    const v=value as Record<string,unknown>;
    return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stableStringify(v[k])).join(",")+"}";
  }
  return JSON.stringify(value);
}
export function signVisualPayloadForTests(payload:unknown, keyHex:string):string{
  return createHmac("sha256",Buffer.from(keyHex,"hex"))
    .update(DOMAIN,"utf8").update(stableStringify(payload),"utf8").digest("hex");
}
export function verifyVisualReceipt(
  envelope:unknown,keyHex:string,clock:Date=new Date()
):StorageVisualView{
  if(!/^[0-9a-f]{64,128}$/i.test(keyHex))throw Error("VISUAL_AUTH_KEY_NOT_CONFIGURED");
  const signed=obj(envelope),payload=obj(signed.payload);
  if(signed.schema!==SIGNED_SCHEMA||payload.schema!==VISUAL_SCHEMA)throw Error("VISUAL_SCHEMA_HOLD");
  if(typeof signed.signature_hmac_sha256!=="string"||!/^[0-9a-f]{64}$/i.test(signed.signature_hmac_sha256))throw Error("VISUAL_UNSIGNED_HOLD");
  const expected=Buffer.from(signVisualPayloadForTests(payload,keyHex),"hex");
  const found=Buffer.from(signed.signature_hmac_sha256,"hex");
  if(!timingSafeEqual(expected,found))throw Error("VISUAL_SIGNATURE_INVALID");
  const ts=time(payload.generated_at);
  if(!ts||Date.parse(ts)>clock.getTime()+60_000)throw Error("VISUAL_DATE_INVALID");
  const planes=payload.planes;
  if(!Array.isArray(planes)||planes.length>3)throw Error("VISUAL_PLANES_INVALID");
  const seenPlanes=new Set<string>(),out:VisualPlane[]=[];
  for(const raw of planes){
    const p=obj(raw),id=p.id;
    if(!PLANE_IDS.includes(id as PlaneId)||seenPlanes.has(id as string))throw Error("VISUAL_PLANE_DUPLICATE_OR_UNRECOGNIZED");
    seenPlanes.add(id as string);
    const observedAt=time(p.observed_at);
    if(!observedAt||Date.parse(observedAt)>clock.getTime()+60_000||Date.parse(observedAt)>Date.parse(ts)+60_000)throw Error("VISUAL_OBSERVATION_TIME");
    if(p.coverage!=="PARTIAL"&&p.coverage!=="DISJOINT")throw Error("VISUAL_COVERAGE_INVALID");
    if(!Array.isArray(p.hogs)||p.hogs.length>MAX_HOGS||!Array.isArray(p.events)||p.events.length>MAX_EVENTS)throw Error("VISUAL_ROWS_INVALID");
    const hogs:VisualHog[]=[],events:VisualEvent[]=[];
    const keys=new Set<string>(),eventIds=new Set<string>();
    for(const rawHog of p.hogs){
      const h=obj(rawHog),key=h.key;
      if(!isKey(key)||!HOG_CATALOG[key].planes.includes(id as PlaneId)||keys.has(key)||safeBytes(h.gross_allocated_bytes)===null||typeof h.overlaps!=="boolean")throw Error("VISUAL_HOG_INVALID");
      keys.add(key);
      const rule=HOG_CATALOG[key];
      // Protection level comes from fixed server-side policy, never from an untrusted publisher.
      hogs.push({key,label:rule.label,level:rule.level,grossBytes:h.gross_allocated_bytes as number,overlaps:h.overlaps});
    }
    // DISJOINT requires affirmative, per-category nonoverlap assertions. Do not
    // construct a 100% filesystem partition unless source-owned geometry proves it.
    if(p.coverage==="DISJOINT"&&hogs.some(h=>h.overlaps))throw Error("VISUAL_DISJOINT_CONTRADICTION");
    for(const rawEvent of p.events){
      const e=obj(rawEvent),at=time(e.at),kind=e.kind,bytes=e.bytes;
      if(typeof e.id!=="string"||!/^[a-zA-Z0-9_-]{8,64}$/.test(e.id)||eventIds.has(e.id)||!at||Date.parse(at)>clock.getTime()+60_000||Date.parse(at)>Date.parse(ts)+60_000||!EVENT_KINDS.includes(kind as VisualEventKind)||!(e.category===null||isKey(e.category))||!(bytes===null||safeBytes(bytes)!==null))throw Error("VISUAL_EVENT_INVALID");
      if(isKey(e.category)&&!HOG_CATALOG[e.category].planes.includes(id as PlaneId))throw Error("VISUAL_EVENT_WRONG_PLANE");
      eventIds.add(e.id);
      const dg=e.transaction_digest;
      if(kind==="PRUNE_RECEIPT"&&!(typeof dg==="string"&&/^[0-9a-f]{64}$/i.test(dg)))throw Error("VISUAL_PRUNE_RECEIPT_MISSING");
      if(dg!==null&&!(typeof dg==="string"&&/^[0-9a-f]{64}$/i.test(dg)))throw Error("VISUAL_EVENT_DIGEST_INVALID");
      events.push({id:e.id,at,kind:kind as VisualEventKind,category:e.category as HogKey|null,bytes:bytes as number|null,transactionDigest:dg as string|null});
    }
    // Optional, HMAC-bound exact candidate aliases: no raw paths, owner or secret fields.
    // Missing producer extension means UNKNOWN, never zero known candidates.
    const rawItems=p.review_items,rawSamples=p.capacity_samples;
    if(rawItems!==undefined&&(!Array.isArray(rawItems)||rawItems.length>48))
      throw Error("VISUAL_REVIEW_ROWS_INVALID");
    if(rawSamples!==undefined&&(!Array.isArray(rawSamples)||rawSamples.length>24))
      throw Error("VISUAL_CAPACITY_ROWS_INVALID");
    const reviewItems:VisualReviewItem[]=[];
    const aliases=new Set<string>();
    for(const rawItem of (rawItems??[]) as unknown[]){
      const item=obj(rawItem),category=item.category;
      if(typeof item.alias!=="string"||!/^[A-Z][A-Z0-9_-]{5,39}$/.test(item.alias)||
        aliases.has(item.alias)||!isKey(category)||!HOG_CATALOG[category].planes.includes(id as PlaneId)||
        safeBytes(item.gross_allocated_bytes)===null||typeof item.overlaps!=="boolean"||
        typeof item.fingerprint!=="string"||!/^[0-9a-f]{64}$/.test(item.fingerprint)||
        typeof item.source_digest!=="string"||!/^[0-9a-f]{64}$/.test(item.source_digest)||
        typeof item.source_revision!=="string"||!/^[0-9a-f]{40}$/.test(item.source_revision)||
        !["GUARDED","REVIEW_ONLY","PROTECTED","MIGRATION_REVIEW"].includes(item.source_status as string)||
        !["COMPLETE","INCOMPLETE"].includes(item.proof_state as string))
        throw Error("VISUAL_REVIEW_ITEM_INVALID");
      aliases.add(item.alias);
      const level=HOG_CATALOG[category].level;
      if((level===4&&item.source_status!=="PROTECTED")||
        (level===1&&item.source_status==="GUARDED"&&item.proof_state!=="COMPLETE"))
        throw Error("VISUAL_REVIEW_POLICY_HOLD");
      reviewItems.push({alias:item.alias,category,level,grossBytes:item.gross_allocated_bytes as number,
        fingerprint:item.fingerprint,sourceDigest:item.source_digest,sourceRevision:item.source_revision,
        sourceStatus:item.source_status as VisualReviewItem["sourceStatus"],
        proofState:item.proof_state as VisualReviewItem["proofState"],overlaps:item.overlaps as boolean});
    }
    const capacitySamples:VisualCapacitySample[]=[];
    for(const rawSample of (rawSamples??[]) as unknown[]){
      const sample=obj(rawSample),at=time(sample.at),free=safeBytes(sample.ordinary_free_bytes);
      if(!at||Date.parse(at)>Date.parse(ts)+60_000||free===null)throw Error("VISUAL_CAPACITY_SAMPLE_INVALID");
      capacitySamples.push({at,ordinaryFreeBytes:free});
    }
    capacitySamples.sort((a,b)=>a.at.localeCompare(b.at));
    if(capacitySamples.some((x,j)=>j>0&&x.at===capacitySamples[j-1].at))throw Error("VISUAL_CAPACITY_DUPLICATE");
    out.push({id:id as PlaneId,observedAt,coverage:p.coverage as VisualPlane["coverage"],
      hogs:hogs.sort((a,b)=>b.grossBytes-a.grossBytes),events:events.sort((a,b)=>b.at.localeCompare(a.at)),
      reviewItems,capacitySamples,
      status:clock.getTime()-Date.parse(observedAt)<=36*3600_000?"RECEIPT":"STALE"});
  }
  return {authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",source:"SIGNED_PRIVATE_RECEIPT",planes:out};
}
/** A missing file or missing key is UNKNOWN; corrupted/forged evidence fails closed. */
export async function readPrivateStorageVisual(clock:Date=new Date()):Promise<StorageVisualView>{
  const key=process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;
  if(!key)return EMPTY_VISUAL;
  if(!/^[0-9a-f]{64,128}$/i.test(key))throw Error("VISUAL_AUTH_KEY_INVALID");
  const root=process.env.AOE2WAR_OS_STORE_DIR?.trim()||
    (process.env.NODE_ENV==="production"?"/mnt/HC_Volume_105319120/aoe2war/os-control":path.join(process.cwd(),"storage","aoe2war-os"));
  const dir=path.join(root,"state"),file=path.join(dir,"storage-visual.v1.json");
  let handle:Awaited<ReturnType<typeof fs.open>>|null=null;
  try{
    const dirStat=await fs.lstat(dir);
    if(!dirStat.isDirectory()||dirStat.isSymbolicLink())throw Error("VISUAL_DIRECTORY_UNSAFE");
    handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const before=await handle.stat();
    if(!before.isFile()||before.size<=0||before.size>MAX_FILE||before.nlink!==1)throw Error("VISUAL_FILE_UNSAFE");
    const raw=await handle.readFile({encoding:"utf8"});
    const after=await handle.stat();
    if(before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.size!==after.size)throw Error("VISUAL_FILE_CHANGED");
    return verifyVisualReceipt(JSON.parse(raw),key,clock);
  }catch(e){
    if((e as NodeJS.ErrnoException).code==="ENOENT")return EMPTY_VISUAL;
    throw e;
  }finally{await handle?.close();}
}
