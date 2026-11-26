/**
 * HEL1 ROOT 26-runtime WE4 snapshot: digest-pinned SOURCE-ONLY admission.
 * Digest equality is not a WE2 signed host measurement or a live service
 * dependency audit. No raw source path, UID, inode, signatures or private
 * source document is emitted to the browser. No file walk/SSH/spawn.
 */

export const ROOT_RUNTIME_COHORT_SCHEMA="aoe2war.storage-atlas.runtime-cohort.v1";
export const WE4_SOURCE_SCHEMA="we4.hel1.actual-runtime-inventory.v1";
export const WE4_COHORT_SOURCE_SHA256="d0bf8741c5a5852e6bf2dccc07ce774d0726017172c878fb8818c72eecb68b0f";
export const WE4_COHORT_SOURCE_BYTES=9424;
export const WE4_COHORT_GROSS_BYTES=41255313408;
const ID=/^[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{40}$/;
const BUILD=/^[A-Za-z0-9_-]{12,48}$/;
const pinnedKeep=new Set([
 "9cf670724c82","f50ead889c61","da0bee282e52"
]);
export type RuntimeDisposition="KEEP_PROTECTED_DEPENDENCY_AT_WE4_OBSERVATION"|
 "REVIEW_HOLD_NO_ROLLBACK_EXCLUSION";
export type RuntimeGenerationItem={
 id:string;grossBytes:number;sourceSha:string;buildId:string;
 modifiedAt:string;ageSeconds:number|null;
 activity:"HISTORICAL_DEPENDENCY_KEEP_NOT_FRESH_PROCESS_CHECK"|"UNKNOWN_NO_PROCESS_VERIFICATION";
 disposition:RuntimeDisposition;deleteAuthorized:false;transferAuthorized:false;
 uniqueReclaimBytes:null;
};
export type RootRuntimeCohort={
 schema:typeof ROOT_RUNTIME_COHORT_SCHEMA;
 status:"SOURCE_ONLY_DIGEST_PINNED_NOT_SIGNED"|"NOT_ADMITTED";
 authority:"PRIVATE_ADMIN_INSPECTION_NO_COPY_DELETE";
 sourceHash:string|null;sourceObservedAt:string|null;
 sourceAgeSeconds:number|null;coverage:"SELECTED_26_DIRECTORIES_ONLY"|"UNKNOWN";
 measuredCount:number|null;measuredGrossBytes:number|null;rows:RuntimeGenerationItem[];
 fullFilesystemCensus:false;uniqueReclaimBytes:null;
 signedSourceAtRead:false;liveDependenciesCheckedNow:false;
 reason:string;
};
export function unknownRuntimeCohort(reason="SOURCE_ONLY_NOT_ENROLLED"):RootRuntimeCohort{
 return {schema:ROOT_RUNTIME_COHORT_SCHEMA,status:"NOT_ADMITTED",
  authority:"PRIVATE_ADMIN_INSPECTION_NO_COPY_DELETE",sourceHash:null,
  sourceObservedAt:null,sourceAgeSeconds:null,coverage:"UNKNOWN",
  measuredCount:null,measuredGrossBytes:null,rows:[],fullFilesystemCensus:false,
  uniqueReclaimBytes:null,signedSourceAtRead:false,liveDependenciesCheckedNow:false,reason};
}
function record(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=="object"||Array.isArray(x))throw Error("COHORT_OBJECT_HOLD");
 return x as Record<string,unknown>;
}
function whole(x:unknown):x is number{
 return typeof x==="number"&&Number.isSafeInteger(x)&&x>=0;
}
function iso(x:unknown):x is string{
 return typeof x==="string"&&Number.isFinite(Date.parse(x))&&
  /^2026-11-22T04:22:06[.]025312\+00:00$/.test(x);
}
/** Strict source adapter. Validates exact digest before calling this with WE4
 * input. The three KEEP identifiers are historical source dependency notes,
 * NOT fresh PID observations; all others are HOLD pending separate evidence.
 */
export function projectValidatedRuntimeCohort(value:unknown,now:Date):RootRuntimeCohort{
 const obj=record(value);
 if(obj.schema!==WE4_SOURCE_SCHEMA||obj.count!==26||obj.measured_count!==26||
    obj.whole_filesystem_scanned!==false||obj.reclaim_bytes!==null||
    obj.mount_dev!==2049||!iso(obj.observed_utc)||
    !Array.isArray(obj.rows)||obj.rows.length!==26)throw Error("COHORT_SCHEMA_OR_COUNT_HOLD");
 const nowMs=now.getTime(),observed=Date.parse(obj.observed_utc);
 if(!Number.isFinite(nowMs)||observed>nowMs+60_000)
   throw Error("COHORT_SOURCE_TIME_INVALID");
 let sum=0;
 const seen=new Set<string>(),sources=new Set<string>();
 const rows:RuntimeGenerationItem[]=obj.rows.map(raw=>{
  const x=record(raw);
  const g=x.generation,sha=x.source_sha,build=x.build_id,b=x.allocated_bytes;
  if(typeof g!=="string"||!ID.test(g)||seen.has(g)||
     typeof sha!=="string"||!SHA.test(sha)||!sha.startsWith(g)||
     sources.has(sha)||typeof build!=="string"||!BUILD.test(build)||
     !whole(b)||b===0||b>4*1024**3||x.device!==2049||
     !whole(x.inode)||x.inode===0||x.mode!=="0o755"||
     x.allocation_status!=="MEASURED_SELECTED_TREE"||
     typeof x.mtime_ns!=="number"||!Number.isFinite(x.mtime_ns)||
     x.mtime_ns<1e18||x.mtime_ns>1e19||
     Object.keys(x).sort().join("|")!==
       ["allocated_bytes","allocation_status","build_id","device","generation",
       "inode","mode","mtime_ns","source_sha"].sort().join("|"))
    throw Error("COHORT_ROW_IDENTITY_OR_PROTECTION_HOLD");
  const timestampMs=Math.floor(x.mtime_ns/1e6);
  if(timestampMs>observed+60_000||timestampMs<Date.UTC(2020,0,1))
    throw Error("COHORT_INODE_TIME_HOLD");
  sum+=b;
  seen.add(g);sources.add(sha);
  const keeper=pinnedKeep.has(g);
  return {id:g,grossBytes:b,sourceSha:sha,buildId:build,
    modifiedAt:new Date(timestampMs).toISOString(),
    ageSeconds:Math.max(0,Math.floor((nowMs-timestampMs)/1000)),
    activity:keeper?"HISTORICAL_DEPENDENCY_KEEP_NOT_FRESH_PROCESS_CHECK":
      "UNKNOWN_NO_PROCESS_VERIFICATION",
    disposition:keeper?"KEEP_PROTECTED_DEPENDENCY_AT_WE4_OBSERVATION":
      "REVIEW_HOLD_NO_ROLLBACK_EXCLUSION",
    deleteAuthorized:false,transferAuthorized:false,uniqueReclaimBytes:null};
 });
 if(sum!==WE4_COHORT_GROSS_BYTES||seen.size!==26||sources.size!==26||
    ![...pinnedKeep].every(x=>seen.has(x)))
    throw Error("COHORT_GROSS_TOTAL_OR_KEEP_PINS_HOLD");
 return {schema:ROOT_RUNTIME_COHORT_SCHEMA,
   status:"SOURCE_ONLY_DIGEST_PINNED_NOT_SIGNED",
   authority:"PRIVATE_ADMIN_INSPECTION_NO_COPY_DELETE",
   sourceHash:WE4_COHORT_SOURCE_SHA256,
   sourceObservedAt:obj.observed_utc,
   sourceAgeSeconds:Math.floor((nowMs-observed)/1000),
   coverage:"SELECTED_26_DIRECTORIES_ONLY",measuredCount:26,
   measuredGrossBytes:sum,rows,
   fullFilesystemCensus:false,uniqueReclaimBytes:null,
   signedSourceAtRead:false,liveDependenciesCheckedNow:false,
   reason:"WE4_OWNER_PRIVATE_DIGEST_MATCH_SOURCE_NOT_CURRENT_SIGNED_HOST_PROOF"};
}
