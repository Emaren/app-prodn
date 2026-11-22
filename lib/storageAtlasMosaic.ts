/**
 * Storage Atlas v1 / pure, bounded, read-only source-to-visual projection.
 *
 * Nothing in here authenticates a source, scans disk, copies, archives or
 * chooses a physical retirement. Only the established private server readers
 * may pass data to this projector. A CSS block is NEVER evidence of unique
 * occupied/free/reclaimable bytes.
 */
import type {StorageCommandCenter,StorageReading} from "./storageCommandCenterProjection.ts";
import type {VisualPlane,VisualHog,StorageVisualView} from "./storageVisualPrivate.ts";
import type {IntelColdView} from "./intelColdStorageEvidence.ts";

export const ATLAS_SCHEMA="aoe2war.storage-os.spatial-atlas.v1" as const;
export const ATLAS_IDS=["hel1-root","hel1-data","m1","intel"] as const;
export type AtlasId=typeof ATLAS_IDS[number];
export type AtlasCategoryKind=
  "LIVE_PROTECTED"|"RECOVERY_PROTECTED"|"REVIEW_HOLD"|"TRANSFER_HOLD"|"MEASURED_OTHER"|
  "UNKNOWN"|"AVAILABLE";
export type AtlasTrust="NATIVE_SOURCE_SIGNED"|"SERVER_HMAC_ONLY"|"INDEPENDENT_INTEL_SIGNED"|"NOT_ADMITTED";
export type AtlasCoverage="MEASURED_PARTIAL"|"NOT_SCANNED"|"UNKNOWN"|"STALE"|"OVERLAP_UNCERTAIN";
export type AtlasDirectory={
  id:string; label:string; bytes:number; proof:"SAMPLED_ALIAS_ONLY";
  overlaps:boolean; protectionLevel:number; restore:"UNKNOWN"; // never invent restoration
};
export type AtlasCategory={
  id:string; label:string; grossBytes:number; kind:AtlasCategoryKind;
  level:number|null; overlaps:boolean; coverage:AtlasCoverage;
  observedAt:string|null; source:AtlasTrust; owner:string;
  restore:"HISTORICAL_RESTORE_PROOF_PRESENT"|"RECOVERY_UNVERIFIED"|"UNKNOWN";
  disposition:"KEEP"|"HOLD"|"NOT_AUTHORIZED"; directories:AtlasDirectory[];
  uniqueReclaimBytes:null; allowedToDelete:false; allowedToTransfer:false;
};
export type AtlasSurface={
 id:AtlasId; label:string; host:"M1"|"HEL1"|"INTEL"; role:string; mountLabel:string;
 source:AtlasTrust; sourceObservedAt:string|null; sourceAgeSeconds:number|null;
 coverage:AtlasCoverage; totalBytes:number|null; usedBytes:number|null;
 availableBytes:number|null; reservedBytes:number|null; usedPercent:number|null; capacityAuthority:
   "INDEPENDENT_SIGNED_POLICY_HOLD"|"OBSERVED_OPERATOR_UNCERTIFIED"|"INTEL_SIGNED_CAPACITY"|"UNKNOWN";
 categories:AtlasCategory[]; unattributedBytes:number|null;
 // No available original whole-disk disjoint unique-footprint certificate.
 uniqueMappedBytes:null; uniqueReclaimBytes:null; excludedBytes:null;
 partitionCertified:false; blockers:string[];
};
export type AtlasPayload={
 schema:typeof ATLAS_SCHEMA;
 authority:"ADMIN_READ_ONLY_NO_SCAN_COPY_OR_RETIRE";
 polledAt:string;
 surfaces:AtlasSurface[];
};
const GiB=1024**3;
const MiB=1024**2;
export const ATLAS_SCALES={gib:GiB,mib100:100*MiB} as const;
export type AtlasScale=keyof typeof ATLAS_SCALES;
export const KIND_LABELS:Record<AtlasCategoryKind,string>={
  LIVE_PROTECTED:"Live / protected",
  RECOVERY_PROTECTED:"Recovery / original",
  REVIEW_HOLD:"Review candidate · HOLD",
  TRANSFER_HOLD:"Potential Intel transfer · HOLD",
  MEASURED_OTHER:"Signed gross sample",
  UNKNOWN:"Unattributed / not scanned",
  AVAILABLE:"Reported available"
};
export const KIND_STYLES:Record<AtlasCategoryKind,{bg:string;pattern:string;edge:string}>={
 LIVE_PROTECTED:{bg:"#1caa95",pattern:"solid",edge:"#64ead2"},
 RECOVERY_PROTECTED:{bg:"#8c78ec",pattern:"solid",edge:"#c4b5fd"},
 REVIEW_HOLD:{bg:"#dc9550",pattern:"diagonal",edge:"#fdba74"},
 TRANSFER_HOLD:{bg:"#409dd7",pattern:"dashed",edge:"#7dd3fc"},
 MEASURED_OTHER:{bg:"#3e93aa",pattern:"solid",edge:"#67e8f9"},
 UNKNOWN:{bg:"#566173",pattern:"crosshatch",edge:"#94a3b8"},
 AVAILABLE:{bg:"#183f44",pattern:"dotted",edge:"#5eead4"}
};
const META:Record<AtlasId,Pick<AtlasSurface,"label"|"host"|"role"|"mountLabel">>={
 "hel1-root":{label:"HEL1 ROOT",host:"HEL1",role:"Production services, releases and OS",mountLabel:"HEL1 /dev/sda1 /"},
 "hel1-data":{label:"HEL1 DATA",host:"HEL1",role:"Traffic, staging, recovery and evidence",mountLabel:"HEL1 /dev/sdb (mounted volume)"},
 m1:{label:"M1 DEVELOPMENT",host:"M1",role:"Source originals, projects and development caches",mountLabel:"Development Mac / APFS"},
 intel:{label:"INTEL COLD VAULT",host:"INTEL",role:"Encrypted independent archive destination",mountLabel:"Intel FileVault / independent reader"}
};
const SOURCE_ID:Record<Exclude<AtlasId,"intel">,VisualPlane["id"]>={
 "hel1-root":"hel1-root","hel1-data":"hel1-volume-105319120",m1:"mac"
};
const cleanBytes=(n:unknown):number|null=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0?n:null;
const validIso=(s:unknown):s is string=>typeof s==="string"&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(s)&&Number.isFinite(Date.parse(s));
function age(when:string|null,now:number){
 if(!validIso(when)||Date.parse(when)>now+60_000)return null;
 return Math.max(0,Math.floor((now-Date.parse(when))/1000));
}
function kindFor(h:VisualHog):AtlasCategoryKind {
 if(h.key==="HEL1_HISTORICAL_RUNTIME_4C14"||h.key==="HEL1_HISTORICAL_RUNTIME_C089")
   return "REVIEW_HOLD";
 if(h.key==="RECOVERY_VAULT"||h.key==="HEL1_ROOT_BACKUPS"||h.key==="HEL1_FINANCIAL_RESTORE"||
   h.key==="EVIDENCE_ORIGINALS"||h.key==="FINANCIAL_ORIGINALS"||
   h.key==="OWNER_INDEPENDENT_RECOVERY_COPY"||h.key==="OWNER_CHATGPT_CONVERSATION_ZIP"||
   h.key==="OWNER_ORIGINAL_PHOTOS"||h.key==="HEL1_EVIDENCE_ARCHIVE")
   return "RECOVERY_PROTECTED";
 if(h.key==="APP_ACTIVE_DEPENDENCIES"||h.key==="HEL1_TRAFFIC_DB"||
   h.key==="PROJECT_SOURCE"||h.key==="HEL1_ROOT_SYSTEM"||
   h.key==="HEL1_ACTIVE_SWAP")return "LIVE_PROTECTED";
 return h.level>=5?"RECOVERY_PROTECTED":
   h.level===4?"REVIEW_HOLD":"MEASURED_OTHER";
}
function visualCategories(plane:VisualPlane,source:AtlasTrust,current:boolean):AtlasCategory[]{
 const rows=plane.hogs.slice(0,32);
 const valid=rows.filter(x=>cleanBytes(x.grossBytes)!==null&&x.grossBytes>0);
 return valid.map(h=>{
   // Only source-reviewed *already-published* aliases. No raw protected paths.
   const aliases=(source==="NATIVE_SOURCE_SIGNED"&&plane.nativeV2Source?
     plane.reviewItems:undefined)?.filter(
     i=>i.category===h.key&&cleanBytes(i.grossBytes)!==null
   ).slice(0,12)??[];
   return {
     id:h.key,label:h.label,grossBytes:h.grossBytes,kind:kindFor(h),level:h.level,
     overlaps:h.overlaps,coverage:!current?"STALE":
       h.overlaps?"OVERLAP_UNCERTAIN":"MEASURED_PARTIAL",
     observedAt:plane.observedAt,source,owner:"Source catalog / review controller",
     restore:"UNKNOWN" as const,disposition:"HOLD" as const,
     directories:aliases.map(i=>({id:i.alias,label:i.alias,bytes:i.grossBytes,
       proof:"SAMPLED_ALIAS_ONLY" as const,overlaps:i.overlaps,
       protectionLevel:i.level,restore:"UNKNOWN" as const})),
     uniqueReclaimBytes:null,allowedToDelete:false,allowedToTransfer:false
   };
 });
}
function base(id:AtlasId):AtlasSurface{
 return {...META[id],id,source:"NOT_ADMITTED",sourceObservedAt:null,sourceAgeSeconds:null,
   coverage:"UNKNOWN",totalBytes:null,usedBytes:null,availableBytes:null,reservedBytes:null,usedPercent:null,
   capacityAuthority:"UNKNOWN",categories:[],unattributedBytes:null,
   uniqueMappedBytes:null,uniqueReclaimBytes:null,excludedBytes:null,partitionCertified:false,
   blockers:["No current source-qualified complete filesystem distribution.",
     "Unknown occupied bytes are NOT free, disposable or reclaimable."]};
}
function planeProjection(id:Exclude<AtlasId,"intel">,raw:StorageCommandCenter|null,now:number):AtlasSurface{
 const item=base(id),sourceId=SOURCE_ID[id];
 const reading:StorageReading|undefined=raw?.planes.find(x=>x.id===sourceId);
 const visual:StorageVisualView|undefined=raw?.visual;
 const admittedVisual=visual?.source==="SIGNED_PRIVATE_RECEIPT"&&
   visual.authority==="PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY";
 const receipt=admittedVisual?visual!.planes.find(x=>x.id===sourceId):undefined;
 if(receipt){
   const current=receipt.status==="RECEIPT"&&age(receipt.observedAt,now)!==null&&
     age(receipt.observedAt,now)!<=36*3600;
   item.source=receipt.nativeV2Source&&visual?.contract==="WE2_NATIVE_V2_ED25519"
     ?"NATIVE_SOURCE_SIGNED":"SERVER_HMAC_ONLY";
   item.sourceObservedAt=receipt.observedAt;
   item.sourceAgeSeconds=age(receipt.observedAt,now);
   item.categories=visualCategories(receipt,item.source,current);
   item.coverage=!current?"STALE":receipt.hogs.length===0?"NOT_SCANNED":
     receipt.hogs.some(x=>x.overlaps)?"OVERLAP_UNCERTAIN":"MEASURED_PARTIAL";
   if(item.source==="SERVER_HMAC_ONLY")item.blockers.push(
     "Server HMAC verifies gross bucket publication, NOT source signer or complete inode walk.");
   if(item.coverage==="NOT_SCANNED")item.blockers.push(
     "Signed empty hog list is NOT SCANNED FOR HOGS, not zero used disk.");
   if(item.coverage==="STALE")item.blockers.push(
     "Recorded category observation is stale; not current allocated distribution.");
   if(receipt.hogs.some(x=>x.overlaps))item.blockers.push(
     "Nested/shared categories may overlap. Gross blocks are not additive.");
 }
 // Independent capacity provenance never derives total, used or reclaimable.
 if(reading?.status==="RECEIPT"&&reading.source==="SIGNED_THREE_PLANE_RECEIPT"){
   item.availableBytes=cleanBytes(reading.freeBytes);
   item.usedPercent=typeof reading.usedPercent==="number"&&
      reading.usedPercent>=0&&reading.usedPercent<=100?reading.usedPercent:null;
   item.capacityAuthority="INDEPENDENT_SIGNED_POLICY_HOLD";
 }else if(reading?.status==="RECEIPT"&&reading.source==="WE2_NATIVE_V2_SIGNED_PLANE"){
   item.availableBytes=cleanBytes(reading.freeBytes);
   item.capacityAuthority="INDEPENDENT_SIGNED_POLICY_HOLD";
 }else if(reading?.source==="OPERATOR_ESTATE_SNAPSHOT"&&reading.status==="RECEIPT"){
   item.availableBytes=cleanBytes(reading.freeBytes);
   item.capacityAuthority="OBSERVED_OPERATOR_UNCERTIFIED";
 }
 // A signed available-byte sample is NOT a total-byte or used-byte sample.
 return item;
}
function intelProjection(raw:IntelColdView|null|undefined,now:number):AtlasSurface{
 const item=base("intel");
 if(!raw||raw.schema!=="aoe2war.intel-cold.status.v1"||
    raw.authority!=="READ_ONLY_NO_CLEANUP_OR_REINSTALL"||
    raw.source!=="SIGNED_PRIVATE_RECEIPT")return item;
 item.source="INDEPENDENT_INTEL_SIGNED";
 item.sourceObservedAt=validIso(raw.observedAt)?raw.observedAt:null;
 item.sourceAgeSeconds=age(item.sourceObservedAt,now);
 const fresh=raw.health==="ONLINE"&&item.sourceAgeSeconds!==null&&item.sourceAgeSeconds<=15*60;
 if(fresh){
   item.availableBytes=cleanBytes(raw.capacity.availableBytes);
   item.capacityAuthority="INTEL_SIGNED_CAPACITY";
 }
 if(fresh&&Array.isArray(raw.objects)){
   item.categories=raw.objects.slice(0,48).filter(x=>cleanBytes(x.allocatedBytes)!==null).map(x=>({
     id:x.alias,label:x.alias,grossBytes:x.allocatedBytes,kind:"RECOVERY_PROTECTED",
     level:x.protectionLevel,overlaps:true,coverage:"OVERLAP_UNCERTAIN",
     observedAt:item.sourceObservedAt,source:item.source,owner:"Intel encrypted archive",
     restore:x.restore==="HISTORICAL_RESTORE_PROOF_PRESENT"?
       "HISTORICAL_RESTORE_PROOF_PRESENT":"RECOVERY_UNVERIFIED",
     disposition:"KEEP",directories:[],uniqueReclaimBytes:null,
     allowedToDelete:false,allowedToTransfer:false
   }));
   item.coverage=item.categories.length?"OVERLAP_UNCERTAIN":"NOT_SCANNED";
 }else item.coverage="STALE";
 item.blockers.push("Intel archive object byte totals are not unique filesystem occupied bytes.");
 item.blockers.push("Historical independent restore never grants current copy or retirement authority.");
 return item;
}
export function projectStorageAtlas(raw:StorageCommandCenter|null,
 intel:IntelColdView|null,now:Date=new Date()):AtlasPayload{
 const ms=now.getTime();
 if(!Number.isFinite(ms))throw Error("ATLAS_CLOCK_INVALID");
 const surfaces:AtlasSurface[]=ATLAS_IDS.map(id=>id==="intel"
   ?intelProjection(intel,ms):planeProjection(id,raw,ms));
 return {schema:ATLAS_SCHEMA,authority:"ADMIN_READ_ONLY_NO_SCAN_COPY_OR_RETIRE",
   polledAt:now.toISOString(),surfaces};
}
/** Aggregate BLOCKS, never render one DOM widget per 100MiB for huge data.
 * Tiles represent only known gross samples; unknown total stays a separate
 * unscaled grey zone and cannot be assigned a fictional count.
 */
export function tileGroups(surface:AtlasSurface,scale:AtlasScale,maxTiles=200){
 const unit=ATLAS_SCALES[scale];
 const rows=surface.categories.filter(c=>cleanBytes(c.grossBytes)!==null&&c.grossBytes>0);
 const total=rows.reduce((n,c)=>n+c.grossBytes,0);
 const requested=rows.reduce((n,c)=>n+Math.ceil(c.grossBytes/unit),0);
 const divisor=Math.max(1,Math.ceil(requested/Math.max(1,Math.min(320,maxTiles))));
 const actualUnit=unit*divisor;
 const cells=rows.map(c=>({category:c,count:Math.min(320,Math.ceil(c.grossBytes/actualUnit)),
   unitBytes:actualUnit,overlapping:c.overlaps,source:c.source}));
 return {groups:cells,unitBytes:actualUnit,requestedUnits:requested,
   renderedTiles:cells.reduce((n,x)=>n+x.count,0),
   grossSampleBytes:total,physicalPartitionValid:false};
}
export const formatAtlasBytes=(bytes:number|null):string=>{
 if(bytes===null)return "UNKNOWN";
 if(bytes===0)return "0 B";
 const base=bytes>=GiB?GiB:bytes>=MiB?MiB:1024;
 return (bytes/base).toFixed(base===GiB?2:1)+(base===GiB?" GiB":base===MiB?" MiB":" KiB");
};
