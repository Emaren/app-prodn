/** Phase9 Storage OS: source-owned read-only, path-free Storage Atlas projection.
 * NEVER import a cleanup controller into a public server route. A snapshot's
 * timestamp is a historical receipt, not evidence the browser scanned a disk.
 */
export const STORAGE_ATLAS_PUBLIC_SCHEMA="aoe2war.storage-atlas.public.v1" as const;
export const STORAGE_ATLAS_PRIVATE_SCHEMA="aoe2war.storage-atlas.private.v1" as const;
export const STORAGE_ATLAS_PLANES=["mac","hel1-root","hel1-volume-105319120"] as const;
type PlaneId=typeof STORAGE_ATLAS_PLANES[number];
type Coverage="complete"|"partial"|"inaccessible";
type Severity="HOLD"|"UNKNOWN"|"WATCH"|"CRITICAL"|"OBSERVE";
const CLASSES=new Set(["protected","active","generated_rebuildable","historical_review","personal_human_review","unknown"]);
const allowed=new Set<string>(STORAGE_ATLAS_PLANES);
const MAX_FRESH_SECONDS=86400;

export type StorageAtlasPublicPlane=Readonly<{
 plane:PlaneId;
 coverage:Coverage;
 stale:boolean;
 age_seconds:number|null;
 severity:Severity;
 effective_used_percent:number|null;
 ordinary_free_bytes:number|null;
 measured_reclaimed_bytes:number|null;
 top_consumer_classes:readonly string[];
}>;
export type StorageAtlasPublicSnapshot=Readonly<{
 schema:typeof STORAGE_ATLAS_PUBLIC_SCHEMA;
 as_of:string;
 live:false;
 financial_or_cleanup_authority:false;
 admission:"HOLD";
 planes:readonly StorageAtlasPublicPlane[];
}>;

function obj(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=="object"||Array.isArray(x))throw Error("STORAGE_ATLAS_HOLD:invalid_object");
 return x as Record<string,unknown>;
}
function numeric(x:unknown,max=Number.MAX_SAFE_INTEGER):number|null{
 if(typeof x!=="number"||!Number.isSafeInteger(x)||x<0||x>max)return null;
 return x;
}
function timestamp(x:unknown):number|null{
 if(typeof x!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x))return null;
 const t=Date.parse(x);
 return Number.isFinite(t)?t:null;
}
/** Strict server-side projection of a private snapshot; inputs are untrusted.
 * This is NOT an authentication substitute: admission is always HOLD.
 */
export function toStorageAtlasPublicSnapshot(raw:unknown,now:Date=new Date()):StorageAtlasPublicSnapshot{
 const v=obj(raw);
 if(v.schema!==STORAGE_ATLAS_PRIVATE_SCHEMA||
    v.kind!=="aoe2war-storage-atlas-snapshot"||
    !Array.isArray(v.planes)||v.planes.length!==3)
   throw Error("STORAGE_ATLAS_HOLD:private_schema_or_missing_plane");
 const nowMs=now.getTime(),t=timestamp(v.assembled_at);
 if(!Number.isFinite(nowMs)||t===null||t>nowMs+30000)
   throw Error("STORAGE_ATLAS_HOLD:timestamp");
 const seen=new Set<string>(),out:StorageAtlasPublicPlane[]=[];
 for(const item of v.planes){
  const p=obj(item);
  if(typeof p.plane!=="string"||!allowed.has(p.plane)||seen.has(p.plane))
   throw Error("STORAGE_ATLAS_HOLD:duplicate_or_unknown_plane");
  seen.add(p.plane);
  const observed=timestamp(p.observed_at);
  const ttl=numeric(p.ttl_seconds,MAX_FRESH_SECONDS);
  const age=observed===null?null:Math.max(0,Math.floor((nowMs-observed)/1000));
  const stale=p.stale!==false||observed===null||observed>nowMs+30000||ttl===null||age===null||age>ttl;
  const coverage=p.coverage==="complete"||p.coverage==="partial"||p.coverage==="inaccessible"
   ?p.coverage:"inaccessible";
  const cap=p.capacity && typeof p.capacity==="object"&&!Array.isArray(p.capacity)?obj(p.capacity):{};
  const percent=typeof cap.effective_used_percent==="number"&&Number.isFinite(cap.effective_used_percent)&&
    cap.effective_used_percent>=0&&cap.effective_used_percent<=100?cap.effective_used_percent:null;
  const free=numeric(cap.ordinary_free_bytes);
  // Ignore arbitrary strings, IDs, operator paths, hostnames and raw receipts.
  const classes=Array.isArray(p.consumers)?p.consumers.slice(0,5).map(x=>{
    const a=x&&typeof x==="object"&&!Array.isArray(x)?obj(x):{};
    return typeof a.class==="string"&&CLASSES.has(a.class)?a.class:"unknown";
  }):[];
  const original=p.severity;
  const severity:Severity=stale||coverage!=="complete"?"HOLD":
    original==="CRITICAL"||original==="WATCH"||original==="OBSERVE"||original==="UNKNOWN"||original==="HOLD"
     ?original:"UNKNOWN";
  out.push(Object.freeze({
    plane:p.plane as PlaneId,coverage,stale:stale||coverage!=="complete",age_seconds:age,severity,
    effective_used_percent:percent,ordinary_free_bytes:free,
    // Unauthenticated raw JSON may never mint a measured gain.
    measured_reclaimed_bytes:null,top_consumer_classes:Object.freeze(classes)
  }));
 }
 if(seen.size!==3)throw Error("STORAGE_ATLAS_HOLD:incomplete_three_plane_set");
 out.sort((a,b)=>STORAGE_ATLAS_PLANES.indexOf(a.plane)-STORAGE_ATLAS_PLANES.indexOf(b.plane));
 return Object.freeze({
  schema:STORAGE_ATLAS_PUBLIC_SCHEMA,as_of:new Date(t).toISOString(),live:false,
  financial_or_cleanup_authority:false,admission:"HOLD",planes:Object.freeze(out)
 });
}
