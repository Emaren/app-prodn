"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Archive,ArrowLeft,ArrowUpRight,Box,Boxes,ChevronRight,
  Database,HardDrive,Laptop2,LockKeyhole,
  Maximize2,RefreshCw,Search,ZoomIn} from "lucide-react";
import {useRouter} from "next/navigation";
import {ATLAS_IDS,ATLAS_SCALES,KIND_LABELS,KIND_STYLES,
  formatAtlasBytes,projectStorageAtlas,tileGroups,type AtlasCategory,
  type AtlasId,type AtlasPayload,type AtlasScale,type AtlasSurface} from "@/lib/storageAtlasMosaic";
import {unknownRuntimeCohort,type RootRuntimeCohort} from "@/lib/storageAtlasGenerationCohort";

const ROUTES:Record<AtlasId,string>={
 "hel1-root":"/admin/storage-os/atlas/hel1-root",
 "hel1-data":"/admin/storage-os/atlas/hel1-data",
 m1:"/admin/storage-os/atlas/m1",
 intel:"/admin/storage-os/atlas/intel"
};
const UNKNOWN=projectStorageAtlas(null,null,new Date("2000-01-01T00:00:00Z"));
const LEGS=["LIVE_PROTECTED","RECOVERY_PROTECTED","REVIEW_HOLD",
  "TRANSFER_HOLD","MEASURED_OTHER","UNKNOWN","AVAILABLE"] as const;
const ICONS={m1:Laptop2,"hel1-root":HardDrive,"hel1-data":Database,intel:Archive};
const observed=(s:string|null)=>s&&Number.isFinite(Date.parse(s))?
  new Date(s).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"})+" · local time":"UNKNOWN";
const sourceLabel=(s:AtlasSurface["source"])=>s==="NATIVE_SOURCE_SIGNED"?"NATIVE SIGNED":
 s==="SERVER_HMAC_ONLY"?"SERVER HMAC ONLY":
 s==="INDEPENDENT_INTEL_SIGNED"?"INTEL SIGNED":"NOT ADMITTED";
const ageLabel=(seconds:number|null)=>seconds===null?"UNKNOWN":seconds<60?"<1 MIN":
 seconds<3600?Math.floor(seconds/60)+" MIN":Math.floor(seconds/3600)+" HR";
type VisualMode="blocks"|"diamonds";
type Scale=AtlasScale|"auto";
function actualScale(scale:Scale,plane:AtlasSurface):AtlasScale{
 if(scale!=="auto")return scale;
 const gross=plane.categories.reduce((n,c)=>n+c.grossBytes,0);
 return gross>120*1024**3?"gib":"mib100";
}
function Swatch({kind,size="normal"}:{kind:(typeof LEGS)[number];size?:"small"|"normal"}){
 const style=KIND_STYLES[kind];
 return <span aria-hidden="true"
  className={"inline-block shrink-0 rounded-[4px] border "+(size==="small"?"h-3 w-3":"h-4 w-4")}
  style={{backgroundColor:style.bg,borderColor:style.edge,
    backgroundImage:kind==="UNKNOWN"?
      "repeating-linear-gradient(45deg,transparent 0px,transparent 4px,rgba(0,0,0,.32) 4px,rgba(0,0,0,.32) 6px)":
      kind==="REVIEW_HOLD"||kind==="TRANSFER_HOLD"?
        "repeating-linear-gradient(135deg,transparent 0,transparent 6px,rgba(0,0,0,.18) 6px,rgba(0,0,0,.18) 9px)":undefined}}/>;
}
function EvidenceTag({s}:{s:AtlasSurface}){
 return <span className={"rounded-full border px-2 py-1 text-[10px] font-black tracking-wide "+
   (s.source==="NOT_ADMITTED"?"border-amber-300/30 text-amber-100":
     "border-cyan-300/30 text-cyan-100")}>
   {sourceLabel(s.source)}
 </span>;
}
function GhostField({compact}:{compact:boolean}){
 // Deliberately unscaled. An empty census is NOT 0 B. No 'N GiB' claim.
 const count=compact?40:108;
 return <div className={"relative min-w-0 overflow-hidden rounded-[20px] border border-slate-300/15 bg-[#111d2c] "+
     (compact?"min-h-[175px] p-3":"min-h-[295px] p-4 sm:min-h-[410px] sm:p-6")}
    role="img" aria-label="UNATTRIBUTED GREY storage field. Size unknown, not a proportional filesystem map.">
   <div className={"absolute inset-0 grid gap-[3px] opacity-65 "+(compact?
       "grid-cols-8 p-3":"grid-cols-9 p-4 sm:grid-cols-12 sm:p-5")} aria-hidden="true">
     {Array.from({length:count},(_,i)=><span key={i}
       className="min-h-[8px] rounded-[3px] border border-slate-400/[.14] bg-slate-400/[.085]"
       style={{opacity:.4+(.16*(i%5))}}/>)}
   </div>
   <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a1322]/30 to-[#0a1322]/90"/>
   <div className="relative flex h-full min-h-[150px] flex-col items-center justify-center text-center sm:min-h-[240px]">
     <span className="rounded-full border border-slate-300/25 bg-[#0a1322]/85 px-3 py-1 text-[10px] font-black tracking-[.16em] text-slate-200">
       UNKNOWN / NOT SCANNED
     </span>
     <p className={"mt-3 font-black tracking-tight text-white "+(compact?"text-lg":"text-2xl sm:text-4xl")}>
       Unattributed storage
     </p>
     <p className="mt-2 max-w-[340px] text-[11px] leading-5 text-slate-200 sm:text-xs">
       No complete, nonoverlapping signed disk allocation census.
       Grey space is <strong>not zero</strong> and is <strong>not scaled to invented bytes</strong>.
     </p>
   </div>
   <span className="absolute bottom-2 right-3 text-[9px] font-semibold tracking-wider text-slate-300">UNSCALED UNKNOWN REGION</span>
 </div>;
}
function Mosaic({surface,scale,mode,compact,onSelect}:{surface:AtlasSurface;scale:Scale;mode:VisualMode;
 compact:boolean;onSelect:(c:AtlasCategory)=>void}){
 const resolved=actualScale(scale,surface);
 const tile=tileGroups(surface,resolved,compact?72:200);
 const physical=tile.groups.length>0;
 return <div className="space-y-3">
   <GhostField compact={compact}/>
   <div className="rounded-[20px] border border-white/15 bg-[#071624] p-3 sm:p-4">
     <div className="flex flex-wrap items-center justify-between gap-2">
       <div><p className="text-[10px] font-black uppercase tracking-[.15em] text-cyan-200">Source-observed GROSS category samples</p>
         <p className="mt-1 text-[11px] text-slate-200">
           {physical?formatAtlasBytes(tile.grossSampleBytes)+" reported · potentially overlapping":"No qualified positive-byte category samples"}
         </p></div>
       <span className="rounded-xl border border-slate-400/20 px-2 py-1 text-[10px] text-slate-200">
         1 cell ≈ {formatAtlasBytes(tile.unitBytes)} GROSS
       </span>
     </div>
     {physical?<div className={"mt-3 grid grid-cols-8 gap-[3px] sm:grid-cols-12 "+(compact?"min-h-[40px]":"min-h-[78px]")}>
       {tile.groups.flatMap(g=>Array.from({length:g.count},(_,i)=>{
         const category=g.category,sty=KIND_STYLES[category.kind];
         return <button key={category.id+":"+i} type="button" onClick={()=>onSelect(category)}
          className={"group relative aspect-square min-h-[12px] rounded-[3px] border text-transparent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white "+
            "transition-transform duration-150 motion-reduce:transition-none hover:brightness-125 "+""}
          style={{borderColor:sty.edge,backgroundColor:"rgba(5,16,30,.5)"}}
          title={category.label+" · "+formatAtlasBytes(category.grossBytes)+" GROSS · "+category.coverage}
          aria-label={"Inspect "+category.label+", "+formatAtlasBytes(category.grossBytes)+" gross; "+category.coverage}>
           <span aria-hidden="true" className="absolute inset-[2px] rounded-[2px]"
             style={{background:sty.bg,clipPath:mode==="diamonds"?"polygon(50% 0,100% 50%,50% 100%,0 50%)":undefined}}/>
         </button>;
       }))}</div>:
       <p className="mt-4 rounded-xl border border-slate-400/15 bg-slate-400/[.07] p-3 text-xs leading-5 text-slate-200">
         {surface.coverage==="NOT_SCANNED"?"NOT SCANNED FOR HOGS — old signed empty buckets do not mean zero storage.":
           surface.coverage==="STALE"?"Only stale or unadmitted samples exist. No current distribution published.":
             "No admissible directory sample. The main grey field remains UNKNOWN."}
       </p>}
     <p className="mt-3 text-[10px] leading-5 text-slate-300">
       Separate sample strip: relative cell widths do NOT partition the filesystem.
       {tile.renderedTiles>0?" "+tile.renderedTiles+" bounded visual cells; scale may coarsen for performance.":""}
       {" "}Overlapping, nested, cloned and hardlinked objects are never summed into certified used or free space.
     </p>
   </div>
 </div>;
}
function CapacityRail({surface}:{surface:AtlasSurface}){
 const total=surface.totalBytes,used=surface.usedBytes,free=surface.availableBytes,
   reserved=surface.reservedBytes;
 const measured=total!==null&&total>0&&used!==null&&free!==null&&reserved!==null;
 const usedPercent=measured?Math.min(100,used!/total!*100):0;
 const availablePercent=measured?Math.min(100,free!/total!*100):0;
 const targetGiB:Record<AtlasId,number>={"hel1-root":25,"hel1-data":40,m1:25,intel:60};
 const target=targetGiB[surface.id]*1024**3;
 const gap=free===null?null:Math.max(0,target-free);
 const dated=surface.capacityAgeSeconds!==null&&surface.capacityAgeSeconds>900;
 const label=surface.capacityAuthority==="NATIVE_HEL1_STATFS_UNCERTIFIED"?
   "HEL1 SERVER STATFS · OBSERVED ONLY":
   surface.capacityAuthority==="OWNER_M1_APFS_DATED_UNCERTIFIED"?
   "OWNER M1 APFS · DATED OBSERVATION":
   surface.capacityAuthority==="INTEL_SIGNED_CAPACITY"?"INDEPENDENT INTEL CAPACITY RECEIPT":
   surface.capacityAuthority==="UNKNOWN"?"NO ADMITTED CAPACITY SOURCE":
   surface.capacityAuthority.replaceAll("_"," ");
 return <section aria-label={"Native capacity observation for "+surface.label}
   className="mt-3 rounded-2xl border border-sky-300/20 bg-[#081b2b] p-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
     <span className="text-[10px] font-black tracking-[.11em] text-sky-200">{label}</span>
     <span className={"text-[10px] font-black "+(dated?"text-amber-200":"text-slate-300")}>
       {surface.capacityObservedAt?
         (dated?"DATED / NOT CURRENT · ":"OBSERVED · ")+observed(surface.capacityObservedAt):
         "NO WHOLE-DISK CAPACITY OBSERVATION"}</span>
   </div>
   {measured?<><div className="mt-3 flex items-end justify-between gap-2">
     <div><p className="text-[10px] text-slate-300">USED / NATIVE FILESYSTEM ACCOUNTING</p>
       <p className="mt-1 text-lg font-black tabular-nums text-white">{formatAtlasBytes(used)}
         <span className="text-xs font-semibold text-slate-300"> / {formatAtlasBytes(total)}</span></p></div>
     <p className="text-xs font-black tabular-nums text-sky-100">{Math.round(usedPercent*10)/10}% used</p>
   </div>
   <div role="img" aria-label={surface.label+" native observed disk capacity: "+
     formatAtlasBytes(used)+" used, "+formatAtlasBytes(free)+" available, "+
     formatAtlasBytes(reserved)+" reserved; this is not a category allocation census"}
     className="mt-2 flex h-4 overflow-hidden rounded-lg border border-white/10 bg-slate-700">
     <div className="bg-amber-500/80" style={{width:usedPercent+"%"}}/>
     <div className="bg-cyan-500/75" style={{width:availablePercent+"%"}}/>
   </div></>:<p className="mt-2 text-sm font-bold text-slate-200">
     USED / TOTAL UNKNOWN · Source admission required
   </p>}
   <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-slate-200">
     <span>Ordinarily available <strong className="tabular-nums text-white">{formatAtlasBytes(free)}</strong></span>
     <span>Reserve / other <strong className="tabular-nums text-white">{formatAtlasBytes(reserved)}</strong></span>
     <span>Target ≥{targetGiB[surface.id]} GiB · gap <strong className="tabular-nums text-amber-100">
       {gap===null?"UNKNOWN":formatAtlasBytes(gap)}</strong></span>
   </div>
   <p className="mt-2 break-words text-[10px] leading-5 text-slate-300">
     {surface.capacityDeviceIdentity?"Device: "+surface.capacityDeviceIdentity+" · ":""}
     Capacity observation is NOT signed category proof. The grey mosaic remains unscanned;
     no bytes are called reclaimable by this observation.
   </p>
 </section>;
}
function EvidenceCard({surface,compact=false}:{surface:AtlasSurface;compact?:boolean}){
 const facts=[
   ["Capacity source",surface.capacityAuthority.replaceAll("_"," ")],
   ["Available (source-labeled)",surface.capacityAuthority==="OBSERVED_OPERATOR_UNCERTIFIED"?
     "OBSERVED ONLY · "+formatAtlasBytes(surface.availableBytes):
     formatAtlasBytes(surface.availableBytes)],
   ["Used physical bytes",formatAtlasBytes(surface.usedBytes)],
   ["Capacity observation",surface.capacityObservedAt?observed(surface.capacityObservedAt):"UNKNOWN"],
   ["Category observation",surface.sourceAgeSeconds===null?"UNKNOWN":ageLabel(surface.sourceAgeSeconds)+" ago"],
   ["Total physical bytes",formatAtlasBytes(surface.totalBytes)],
   ["Reserved / inaccessible",formatAtlasBytes(surface.reservedBytes)],
   ["Excluded / unscanned",formatAtlasBytes(surface.excludedBytes)],
   ["Unattributed bytes",formatAtlasBytes(surface.unattributedBytes)]
 ];
 return <div className={"grid gap-2 text-[11px] text-slate-200 "+(compact?"grid-cols-2":"grid-cols-2 sm:grid-cols-4")}>
   {(compact?facts.slice(0,4):facts).map(([title,value])=>
     <div key={title} className="min-w-0 rounded-xl border border-white/10 bg-white/[.025] p-2.5">
       <p className="text-[10px] text-slate-300">{title}</p>
       <p className="mt-1 break-words font-semibold text-white">{value}</p>
     </div>)}
 </div>;
}
function SurfacePanel({surface,scale,mode,onSelect}:{surface:AtlasSurface;
 scale:Scale;mode:VisualMode;onSelect:(x:AtlasCategory)=>void}){
 const Icon=ICONS[surface.id];
 return <article className="min-w-0 rounded-[26px] border border-cyan-300/15 bg-[#0b1828] p-3 shadow-[0_14px_60px_rgba(0,0,0,.2)] sm:p-4">
   <div className="flex flex-wrap items-center justify-between gap-3">
     <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-200"/>
       <h2 className="text-base font-black text-white">{surface.label}</h2></div>
     <EvidenceTag s={surface}/>
   </div>
   <p className="mt-1 text-[11px] text-slate-300">{surface.role}</p>
   <CapacityRail surface={surface}/>
   <div className="mt-4"><Mosaic surface={surface} scale={scale} mode={mode} compact
     onSelect={onSelect}/></div>
   <div className="mt-4"><EvidenceCard surface={surface} compact/></div>
   <Link href={ROUTES[surface.id]} className="mt-4 flex min-h-11 items-center justify-between rounded-xl border border-cyan-300/35 bg-cyan-300/[.06] px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-300/[.12] focus-visible:outline-2 focus-visible:outline-cyan-200">
     Enter {surface.label} <Maximize2 className="h-4 w-4"/>
   </Link>
 </article>;
}
function DetailPanel({category,onClose}:{category:AtlasCategory|null;onClose:()=>void}){
 if(!category)return <div className="rounded-[22px] border border-white/15 bg-[#0b1a29] p-4 sm:p-5">
   <p className="text-[10px] font-black tracking-widest text-cyan-200">DETAIL / INSPECTOR</p>
   <p className="mt-4 text-sm font-bold text-white">Select a colored source sample to zoom</p>
   <p className="mt-2 text-xs leading-6 text-slate-300">Only source-supplied bounded aliases can form directory children.
     There is no browser filesystem traversal, and grey UNKNOWN is not clickable as a deletion candidate.</p>
 </div>;
 return <section aria-label="Selected source category" aria-live="polite" className="min-w-0 rounded-[22px] border border-cyan-300/30 bg-[#0b1a29] p-4 sm:p-5">
   <div className="flex items-center justify-between gap-3">
     <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-200">CATEGORY / DRILLDOWN</p>
     <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-200">
       <ArrowLeft className="mr-1 inline h-4 w-4"/> Back
     </button>
   </div>
   <div className="mt-3 flex items-center gap-2"><Swatch kind={category.kind}/>
     <h3 className="min-w-0 break-words text-lg font-black text-white">{category.label}</h3></div>
   <p className="mt-2 text-2xl font-black tabular-nums text-white">{formatAtlasBytes(category.grossBytes)}
     <span className="ml-2 text-[11px] font-semibold text-amber-100">GROSS · NOT UNIQUE</span></p>
   <dl className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2">
     {[
       ["Source trust",category.source.replaceAll("_"," ")],
       ["Observed instant (browser-local)",observed(category.observedAt)],
       ["Coverage",category.coverage.replaceAll("_"," ")],
       ["Classification",KIND_LABELS[category.kind]],
       ["Protection",category.level===null?"UNKNOWN":"L"+category.level],
       ["Owner / producer",category.owner],
       ["Independent restoration",category.restore.replaceAll("_"," ")],
       ["Current content hash verified",category.currentContentHashVerifiedNow===null?
         "UNKNOWN":category.currentContentHashVerifiedNow?"VERIFIED AT SOURCE":"NOT VERIFIED NOW"],
       ["Historical restore receipt",category.historicalRestoreReceiptSha256??"UNKNOWN"],
       ["Unique reclaim", "UNKNOWN · NOT AUTHORIZED"]
     ].map(([a,b])=><div key={a}><dt className="text-slate-300">{a}</dt>
       <dd className="mt-1 break-words font-semibold text-white">{b}</dd></div>)}
   </dl>
   <div className="mt-5 rounded-xl border border-white/10 bg-white/[.035] p-3">
     <h4 className="text-xs font-bold text-white">Directory / bounded alias children</h4>
     {category.directories.length?category.directories.map(d=><div key={d.id}
       className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100">
       <p className="break-all font-mono">{d.label}</p>
       <p className="mt-1 text-slate-300">{formatAtlasBytes(d.bytes)} sampled · L{d.protectionLevel} · {d.proof} · overlap {d.overlaps?"UNKNOWN/YES":"NOT ASSERTED"}</p>
     </div>):<p className="mt-2 text-xs leading-5 text-amber-100">No separately admitted child alias list.
       Do not invent directory names, file counts, paths, or a drilldown scan.</p>}
   </div>
   <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[.05] p-3 text-xs leading-5 text-amber-100">
     Inspection only. Source classification is not copy authority, an L4 deletion permit, or physical reclaimed bytes.
     L5 originals remain NEVER DELETE.
   </p>
   <Link href="/admin/storage-os/explorer" className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-lg border border-cyan-300/30 px-3 text-xs font-bold text-cyan-100">
     Open existing owner Explorer <ArrowUpRight className="h-4 w-4"/>
   </Link>
 </section>;
}

function RuntimeCohort({cohort,scale,mode}:{cohort:RootRuntimeCohort;scale:Scale;mode:VisualMode}){
 const [focused,setFocused]=useState<string|null>(null);
 const rows=cohort.rows;
 const selected=rows.find(x=>x.id===focused)??null;
 const unit=scale==="mib100"?ATLAS_SCALES.mib100:ATLAS_SCALES.gib;
 const requested=rows.reduce((n,x)=>n+Math.ceil(x.grossBytes/unit),0);
 const divisor=Math.max(1,Math.ceil(requested/170));
 const tileUnit=unit*divisor;
 return <section aria-label="WE4 ROOT runtime generation intelligence" className="rounded-[24px] border border-violet-300/25 bg-[#0b1728] p-4 sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div>
       <p className="text-[10px] font-black tracking-[.2em] text-violet-200">WE4 OWNER SOURCE / SEPARATE COHORT / ROOT ONLY</p>
       <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">26 runtime generations</h3>
       <p className="mt-2 text-xs leading-5 text-slate-200">
         A separate 26-tree gross allocation cohort—not a complete disk partition.
         Source SHA-256 pin proves exact file bytes, not independent host signing,
         current processes, rollback exclusion or recoverable space.
       </p>
     </div>
     <span className="rounded-full border border-amber-200/30 bg-amber-200/[.05] px-3 py-2 text-[10px] font-black text-amber-100">
       {cohort.status==="SOURCE_ONLY_DIGEST_PINNED_NOT_SIGNED"?"DIGEST PIN · UNSIGNED":"NOT ADMITTED"}
     </span>
   </div>
   <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
     {[
       ["Measured generation trees",cohort.measuredCount===null?"UNKNOWN":cohort.measuredCount+"/26"],
       ["Selected gross bytes",formatAtlasBytes(cohort.measuredGrossBytes)],
       ["Host signer this read",cohort.signedSourceAtRead?"YES":"NO"],
       ["Unique reclaim", "UNKNOWN / NO PERMIT"]
     ].map(([name,value])=><div key={name} className="rounded-xl border border-white/10 bg-white/[.025] p-3">
       <p className="text-[10px] text-slate-300">{name}</p>
       <p className="mt-2 text-sm font-black tabular-nums text-white">{value}</p>
     </div>)}
   </div>
   {rows.length?<div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
     <div className="rounded-2xl border border-white/10 bg-[#071321] p-3">
       <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-200">
         <span>26 SELECTED GROSS GENERATION TREES</span>
         <span>1 cell ≈ {formatAtlasBytes(tileUnit)}</span>
       </div>
       <div role="group" aria-label="Select individual runtime generations"
          className="mt-3 grid grid-cols-10 gap-[3px] sm:grid-cols-12">
         {rows.flatMap(row=>Array.from({length:Math.ceil(row.grossBytes/tileUnit)},(_,i)=>{
           const keep=row.disposition==="KEEP_PROTECTED_DEPENDENCY_AT_WE4_OBSERVATION";
           const sty=KIND_STYLES[keep?"RECOVERY_PROTECTED":"REVIEW_HOLD"];
           return <button type="button" key={row.id+":"+i}
             onClick={()=>setFocused(row.id)} aria-pressed={focused===row.id}
             aria-label={"Inspect runtime "+row.id+" "+formatAtlasBytes(row.grossBytes)+" gross source-only"}
             title={row.id+" · "+formatAtlasBytes(row.grossBytes)+" GROSS · "+row.buildId}
             className="relative aspect-square min-h-[10px] rounded-[3px] border focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-white"
             style={{borderColor:sty.edge,backgroundColor:sty.bg,
               clipPath:mode==="diamonds"?"polygon(50% 0,100% 50%,50% 100%,0 50%)":undefined}}/>;
         }))}</div>
       <p className="mt-3 text-[10px] leading-5 text-slate-300">
         26 separately sampled source generations; gross st_blocks totals are not unique recovered bytes.
         Three previously source-identified dependencies are purple KEEP. Orange generations are REVIEW HOLD,
         not removable, and this source did not perform a fresh process check.
       </p>
     </div>
     <div className="min-w-0 rounded-2xl border border-white/10 bg-[#071321] p-4">
       {selected?<div>
         <div className="flex justify-between gap-2"><p className="text-[10px] font-black text-violet-200">SOURCE GENERATION DETAIL</p>
           <button className="rounded-lg border border-white/10 px-3 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-white"
             type="button" onClick={()=>setFocused(null)}>Close</button></div>
         <p className="mt-3 font-mono text-xl font-bold text-white">{selected.id}</p>
         {([
           ["Gross sampled allocation",formatAtlasBytes(selected.grossBytes)],
           ["BUILD_ID",selected.buildId],
           ["Source revision",selected.sourceSha],
           ["Last modified",observed(selected.modifiedAt)],
           ["Generation age",ageLabel(selected.ageSeconds)],
           ["Activity",selected.activity],
           ["Disposition",selected.disposition],
           ["Transfer / retirement","NOT AUTHORIZED"]
         ] as const).map(([k,v])=><div key={k} className="mt-3 min-w-0">
           <p className="text-[10px] text-slate-300">{k}</p>
           <p className="mt-1 break-all text-[11px] font-bold text-white">{v}</p>
         </div>)}
       </div>:<div>
         <p className="text-[10px] font-black text-violet-200">GENERATION DETAIL</p>
         <p className="mt-3 text-sm font-semibold text-white">Select a colored block</p>
         <p className="mt-2 text-xs text-slate-300">
           Source identity, BUILD_ID, historical age, activity uncertainty and exact review disposition are available.
           Neither a selected tile nor a negative PID snapshot grants deletion rights.
         </p>
       </div>}
     </div>
   </div>:<p className="mt-4 rounded-xl border border-slate-300/20 bg-slate-400/[.07] p-4 text-xs leading-6 text-slate-200">
     The source-qualified 26-object manifest has not been enrolled on this website.
     {cohort.reason}. No raw M1 private manifest is imported into the browser; all tiles and identities stay UNKNOWN
     until exact digest-pinned private source delivery is independently authorized.
   </p>}
   <div className="mt-3 text-[10px] leading-5 text-slate-300">
     WE4 observed: {observed(cohort.sourceObservedAt)} · source age: {ageLabel(cohort.sourceAgeSeconds)}
     · 26/26 measures selected trees only; filesystem residual remains GREY/UNSCALED.
     Source-only is not an independently signed live host observation.
   </div>
 </section>;
}

export default function StorageSpatialAtlas({initialPlane}:{initialPlane:AtlasId|null}){
 const router=useRouter();
 const [payload,setPayload]=useState<AtlasPayload|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [scale,setScale]=useState<Scale>("gib");
 const [mode,setMode]=useState<VisualMode>("blocks");
 const [chosen,setChosen]=useState<string|null>(null);
 const [query,setQuery]=useState("");
 const refresh=useCallback(async()=>{
   setLoading(true);setError(null);
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),12000);
   try{
     const response=await fetch("/api/admin/storage-os/atlas",{
       method:"GET",credentials:"same-origin",cache:"no-store",signal:controller.signal});
     if(!response.ok){setError(response.status===403?"ADMIN_AUTH_REQUIRED":
       response.status===401?"SIGN_IN_REQUIRED":"ATLAS_EVIDENCE_UNAVAILABLE");setPayload(null);return;}
     const v=await response.json() as AtlasPayload;
     if(v.schema!=="aoe2war.storage-os.spatial-atlas.v1"||
        v.authority!=="ADMIN_READ_ONLY_NO_SCAN_COPY_OR_RETIRE"||
        !Array.isArray(v.surfaces)||v.surfaces.length!==4||
        ATLAS_IDS.some(id=>v.surfaces.filter(p=>p.id===id).length!==1)){
       setError("ATLAS_CONTRACT_INVALID");setPayload(null);return;
     }
     setPayload(v);
   }catch{setError("ATLAS_SOURCE_TIMEOUT_OR_FAILURE");setPayload(null);}
   finally{clearTimeout(timeout);setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
   // Navigating from the overview's source sample to its physical surface.
   if(!initialPlane)return;
   const focus=new URLSearchParams(window.location.search).get("focus");
   if(focus&&/^[A-Z0-9_-]{1,60}$/.test(focus))setChosen(focus);
 },[initialPlane]);
 const surfaces=payload?.surfaces??UNKNOWN.surfaces;
 const runtimeCohort=payload?.rootRuntimeCohort??unknownRuntimeCohort();
 const current=initialPlane?surfaces.find(s=>s.id===initialPlane):null;
 const active=useMemo(()=>current?.categories.find(c=>c.id===chosen)??null,[current,chosen]);
 const nav=[{name:"All four",href:"/admin/storage-os/atlas",id:null},
   ...ATLAS_IDS.map(id=>({name:UNKNOWN.surfaces.find(s=>s.id===id)!.label,href:ROUTES[id],id}))];
 const allMeasured=surfaces.flatMap(s=>s.categories.map(c=>({...c,device:s.id}))).filter(c=>
   !query||c.label.toLowerCase().includes(query.toLowerCase())||c.id.toLowerCase().includes(query.toLowerCase()));
 return <main className="min-h-screen overflow-x-hidden bg-[#050d19] pb-20 text-slate-100">
   <div className="pointer-events-none absolute left-0 top-0 h-[340px] w-full bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,.12),transparent_68%)]"/>
   <div className="relative mx-auto w-full max-w-[1960px] space-y-5 px-3 py-5 sm:px-6 lg:px-10">
     <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
       <div><Link href="/admin/storage-os/explorer" className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-cyan-200 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200">
           <ArrowLeft className="h-4 w-4"/> STORAGE EXPLORER
         </Link>
         <p className="mt-1 text-[10px] font-black uppercase tracking-[.27em] text-cyan-200">PRIVATE / SPATIAL FILESYSTEM / FIVE PAGES</p>
         <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">STORAGE <span className="text-cyan-200">ATLAS</span></h1>
         <p className="mt-2 max-w-[800px] text-xs leading-6 text-slate-300 sm:text-sm">
           Source-backed clusters. Three physical computers, four storage surfaces.
           Every grey region is unmeasured, not empty. No scanning, transfer or deletion controls.
         </p>
       </div>
       <div className="flex flex-wrap items-center gap-2">
         <span className="rounded-full border border-amber-300/30 px-3 py-2 text-[10px] font-black text-amber-100">
           <LockKeyhole className="mr-1 inline h-3.5 w-3.5"/> ADMIN READ ONLY
         </span>
         <button type="button" onClick={()=>void refresh()} disabled={loading}
           className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 px-3 text-xs font-bold text-slate-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-50">
           <RefreshCw className="h-4 w-4"/> Re-read receipts
         </button>
       </div>
     </header>
     <nav aria-label="Five private Storage Atlas pages" className="flex flex-wrap gap-2">
       {nav.map(n=><Link key={n.href} href={n.href}
         aria-current={n.id===initialPlane?"page":undefined}
         className={"inline-flex min-h-10 items-center rounded-xl border px-3 py-2 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-cyan-200 "+
           (n.id===initialPlane?"border-cyan-300/60 bg-cyan-300/10 text-white":
             "border-white/15 text-slate-200 hover:border-cyan-300/30")}>{n.name}</Link>)}
     </nav>
     {error?<div role="alert" className="rounded-xl border border-amber-300/40 bg-amber-300/[.08] p-3 text-sm text-amber-100">
       {error}: current authenticated source unavailable. No locally cached measurements or invented replacement.
     </div>:null}
     <section aria-label="Visualization controls" className="flex flex-wrap items-end justify-between gap-4 rounded-[20px] border border-white/10 bg-[#0b1827] p-3 sm:p-4">
       <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-200">BLOCK SCALE / SOURCE-DERIVED GROSS SAMPLES</p>
         <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Choose measured block scale">
           {([{id:"gib",text:"1 GiB"},{id:"mib100",text:"100 MiB"},{id:"auto",text:"Auto / fit"}] as const).map(x=>
             <button key={x.id} type="button" aria-pressed={scale===x.id}
               onClick={()=>setScale(x.id)} className={"min-h-10 rounded-lg border px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-cyan-200 "+
                 (scale===x.id?"border-cyan-300/55 bg-cyan-300/10":"border-white/15 hover:bg-white/10")}>{x.text}</button>)}
         </div>
       </div>
       <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-200">RENDER MODE</p>
         <div className="mt-2 flex gap-2" role="group" aria-label="Choose mosaic geometry">
           {([{id:"blocks",text:"Tetris blocks",Icon:Boxes},
             {id:"diamonds",text:"Diamonds",Icon:Box}] as const).map(x=>
             <button key={x.id} type="button" aria-pressed={mode===x.id} onClick={()=>setMode(x.id)}
               className={"inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-cyan-200 "+
                 (mode===x.id?"border-cyan-300/55 bg-cyan-300/10":"border-white/15 hover:bg-white/10")}>
               <x.Icon className="h-4 w-4"/>{x.text}</button>)}
         </div>
       </div>
       <p className="max-w-[260px] text-[10px] leading-5 text-slate-300">
         1 GiB / 100 MiB scales apply to positive-byte category sample tiles.
         Unknown space has no invented physical unit.
       </p>
     </section>
     <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300" aria-label="Atlas breadcrumbs">
       <Link href="/admin/storage-os/atlas" className="min-h-8 rounded px-2 py-1 text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-200">Four surfaces</Link>
       {current?<><ChevronRight className="h-3.5 w-3.5"/>
         <Link href={ROUTES[current.id]} onClick={()=>setChosen(null)}
           className="min-h-8 rounded px-2 py-1 text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-200">{current.label}</Link></>:null}
       {active?<><ChevronRight className="h-3.5 w-3.5"/>
         <span className="font-bold text-white">{active.label}</span></>:null}
     </div>
     {!current?<section aria-label="All four storage surfaces" className="grid gap-4 lg:grid-cols-2">
       {surfaces.map(s=><SurfacePanel key={s.id} surface={s} scale={scale} mode={mode}
         onSelect={c=>router.push(ROUTES[s.id]+"?focus="+encodeURIComponent(c.id))}/>)}
     </section>:
     <section aria-label={current.label+" spatial storage detail"} className="space-y-4">
       <div className="flex flex-wrap items-center justify-between gap-3">
         <div><p className="text-[10px] font-black tracking-widest text-cyan-200">{current.host} / {current.mountLabel}</p>
           <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">{current.label} / Source layout</h2>
           <p className="mt-1 text-xs text-slate-300">{current.role}</p></div>
         <div className="flex items-center gap-2"><EvidenceTag s={current}/>
           <span className="rounded-full border border-slate-300/20 px-3 py-1.5 text-[10px] font-bold text-slate-200">
             {current.coverage.replaceAll("_"," ")}
           </span></div>
       </div>
       <CapacityRail surface={current}/>
       <EvidenceCard surface={current}/>
       <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2.35fr)_minmax(290px,1fr)]">
         <div className="min-w-0 rounded-[25px] border border-cyan-300/15 bg-[#0b1828] p-3 sm:p-5">
           <Mosaic surface={current} scale={scale} mode={mode} compact={false}
             onSelect={c=>setChosen(c.id)}/>
         </div>
         <div className="min-w-0 space-y-4">
           <DetailPanel category={active} onClose={()=>setChosen(null)}/>
           <div className="rounded-[22px] border border-amber-300/15 bg-[#0d1b2a] p-4">
             <h3 className="text-sm font-bold text-white">Exact evidence blockers</h3>
             <p className="mt-2 text-[11px] text-slate-300">Source observed: {observed(current.sourceObservedAt)}</p>
             <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-amber-100">
               {current.blockers.slice(0,6).map((b,i)=><li key={i}>{b}</li>)}
             </ul>
           </div>
         </div>
       </div>
       {current.id==="hel1-root"?<RuntimeCohort cohort={runtimeCohort} scale={scale} mode={mode}/>:null}
       <div className="min-w-0 rounded-[23px] border border-white/15 bg-[#0a1727] p-4">
         <div className="flex flex-wrap items-center justify-between gap-3">
           <h3 className="text-sm font-black text-white">Source-qualified category index</h3>
           <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/20 px-3">
             <Search className="h-4 w-4 text-slate-300"/>
             <span className="sr-only">Search verified category aliases</span>
             <input value={query} onChange={e=>setQuery(e.target.value)}
               placeholder="Filter measured categories" className="w-48 max-w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-300"/>
           </label>
         </div>
         <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
           {allMeasured.filter(c=>c.device===current.id).map(c=>
             <button type="button" key={c.id} onClick={()=>setChosen(c.id)}
               className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[.025] px-3 text-left hover:bg-white/[.07] focus-visible:outline-2 focus-visible:outline-cyan-200">
               <Swatch kind={c.kind}/>
               <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white">{c.label}</strong>
                 <span className="text-[10px] text-slate-300">{formatAtlasBytes(c.grossBytes)} · {c.coverage}</span></span>
               <ZoomIn className="h-4 w-4 text-cyan-200"/>
             </button>)}
           {!allMeasured.some(c=>c.device===current.id)?
             <p className="text-xs text-slate-300">No matching admitted categories. Unknown is not zero.</p>:null}
         </div>
       </div>
     </section>}
     <section className="rounded-[23px] border border-white/10 bg-[#081725] p-4 sm:p-5" aria-label="Storage evidence legend">
       <div className="flex flex-wrap items-center justify-between gap-2">
         <h2 className="text-sm font-bold text-white">Evidence-color legend</h2>
         <span className="text-[10px] font-semibold text-slate-200">Consistent categories / all five pages</span>
       </div>
       <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
         {LEGS.map(k=><div key={k} className="flex items-center gap-2 text-xs text-slate-200">
           <Swatch kind={k}/>{KIND_LABELS[k]}</div>)}
       </div>
       <p className="mt-4 text-[11px] leading-5 text-slate-300">
         No colored block represents an independently certified occupied-share percentage unless a complete,
         nonoverlapping source census explicitly proves one. Gross source samples may overlap. Free,
         reserved, active recovery, transfer eligibility and actual physical reclamation are independent proofs.
         KEEP / COLD / PRUNE / PROTECTED are standing review labels only when independently
         assigned to specific items; no candidate gross figure is certified physical reclaim.
         L4 has no software delete; L5 is NEVER DELETE.
       </p>
     </section>
     <footer className="border-t border-white/10 pt-4 text-[11px] leading-5 text-slate-300">
       AoE2WAR Storage Atlas / private read-only v1 · Receipt timestamp {payload?observed(payload.polledAt):"AWAITING SOURCE"}.
       {" "}Re-reading is not scanning. BAE Basic · Advanced · Extreme is a separate release.
       No archive, deletion, transfer or custody control is enabled here.
     </footer>
   </div>
 </main>;
}
