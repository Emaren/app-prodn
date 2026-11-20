"use client";

import Link from "next/link";
import StoragePremiumInspector from "./StoragePremiumInspector";
import StorageTeachingHistory from "./StorageTeachingHistory";
import {useCallback,useEffect,useMemo,useReducer,useRef,useState} from "react";
import {
  Activity,Archive,ArrowLeft,Check,Clock3,Database,HardDrive,
  Laptop2,LockKeyhole,RefreshCw,Server,ShieldAlert,ShieldCheck,SlidersHorizontal,
} from "lucide-react";
import type {StorageCommandCenter,StorageReading} from "@/lib/storageCommandCenterProjection";
import type {VisualHog} from "@/lib/storageVisualPrivate";
import type {TeachingEvent} from "@/lib/storageHogTeachingLedger";
import {signedHogInventory,teachingSourceDeadline} from "@/lib/storageSignedFreshness";
import {
  teachingDisposition,strongestRecordedProtection,type TeachingLevel,type TeachingPlane,
} from "@/lib/storageHogTeachingPolicy";

const IDS:TeachingPlane[]=["mac","hel1-root","hel1-volume-105319120"];
const COLORS=["#22d3ee","#a78bfa","#f59e0b","#2dd4bf","#60a5fa","#fb7185","#f472b6","#c4b5fd"];
const LVLCOLORS:{[K in TeachingLevel]:string}={2:"#fbbf24",3:"#a78bfa",4:"#34d399",5:"#fb7185"};
const LEVELS:[
  {id:TeachingLevel;label:string;description:string},
  {id:TeachingLevel;label:string;description:string},
  {id:TeachingLevel;label:string;description:string},
  {id:TeachingLevel;label:string;description:string},
]=[
  {id:2,label:"L2 · Review for retirement",description:"Request exact-file review. No deletion from this page."},
  {id:3,label:"L3 · Defer",description:"Preserve; investigate independently before further action."},
  {id:4,label:"L4 · Human only",description:"No software-led deletion."},
  {id:5,label:"L5 · Never delete",description:"Permanent owner protection. Cannot be downgraded."},
];
const PANEL="rounded-[24px] border border-white/[.09] bg-[#0c1624]/90 shadow-[0_15px_55px_rgba(0,0,0,.15)]";
function bytes(value:number|null){
  if(value===null||!Number.isFinite(value))return "UNKNOWN";
  if(value===0)return "0 B";
  return value>=1024**3?(value/1024**3).toFixed(2)+" GiB":
    value>=1024**2?(value/1024**2).toFixed(1)+" MiB":
    (value/1024).toFixed(1)+" KiB";
}
function shortTime(at:string|null){
  if(!at||!Number.isFinite(Date.parse(at)))return "NO SOURCE";
  const d=Date.now()-Date.parse(at);
  return d<0?"CLOCK DRIFT":d<60000?"<1 MIN":d<3600000?
    Math.floor(d/60000)+" MIN":Math.floor(d/3600000)+" HR";
}
function point(r:number,a:number){
  const radians=(a-90)*Math.PI/180;return [130+r*Math.cos(radians),130+r*Math.sin(radians)] as const;
}
function segment(start:number,end:number,inside:number,outside:number){
  if(end-start<=0.001)return "";
  const finish=Math.min(start+359.999,end);
  const a=point(outside,start),b=point(outside,finish),
    c=point(inside,finish),d=point(inside,start);
  return "M "+a.join(" ")+" A "+outside+" "+outside+" 0 "+(finish-start>180?1:0)+" 1 "+
    b.join(" ")+" L "+c.join(" ")+" A "+inside+" "+inside+" 0 "+
    (finish-start>180?1:0)+" 0 "+d.join(" ")+" Z";
}
function Sunburst({hogs,status,selected,onSelect}:{
  hogs:VisualHog[];status:ReturnType<typeof signedHogInventory>["status"];
  selected:string|null;onSelect:(key:string)=>void;
}){
  const sum=hogs.reduce((a,h)=>a+h.grossBytes,0);
  let cursor=0;
  return <div className="mx-auto max-w-[410px]">
    <svg viewBox="0 0 260 260" role="img" aria-label="Interactive radial map of verified gross storage categories. Not unique recoverable bytes." className="w-full">
      <circle cx="130" cy="130" r="115" stroke="#22334a" strokeWidth="1" fill="none" strokeDasharray="2 7"/>
      <circle cx="130" cy="130" r="95" stroke="#1c2d40" strokeWidth="31" fill="none"/>
      {sum>0&&hogs.map((h,i)=>{
        const from=cursor;cursor+=h.grossBytes/sum*360;
        return <path key={h.key} d={segment(from,cursor,74,112)}
          fill={selected===h.key?"#fff":COLORS[i%COLORS.length]}
          stroke="#09131e" strokeWidth="2" opacity={selected && selected!==h.key ? 0.38 : 1}
          role="button" tabIndex={0} aria-label={h.label+": "+bytes(h.grossBytes)}
          onClick={()=>onSelect(h.key)}
          onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(h.key);}}}
          className="cursor-pointer focus:outline-none focus:stroke-[4px] focus:stroke-white"/>;
      })}
      <circle cx="130" cy="130" r="70" stroke="#27435a" strokeWidth="1" fill="#091522"/>
      <circle cx="130" cy="130" r="61" stroke="#294054" strokeWidth="1" fill="none" strokeDasharray="1 9"/>
      <text x="130" y="124" fill="#f8fafc" textAnchor="middle" fontSize="23" fontWeight="700">
        {status==="PARTIAL"&&hogs.length>0?bytes(sum).replace(" GiB","G").replace(" MiB","M"):"—"}
      </text>
      <text x="130" y="146" fill="#839bad" textAnchor="middle" fontSize="9" letterSpacing="1.6">
        {status==="PARTIAL"?(hogs.length>0?"GROSS REPORTED":"NO CATEGORIES"):status==="STALE"?"STALE RECEIPT":"AWAITING PROOF"}
      </text>
    </svg>
    <p className="mt-1 text-center text-[11px] leading-5 text-slate-400">
      Select a wedge to inspect it. Overlapping categories, APFS clones and filesystem snapshots are not additive free space.
    </p>
  </div>;
}
function Drive({reading,id,active,onSelect,inventory}:{
  reading:StorageReading|undefined;id:TeachingPlane;active:boolean;
  onSelect:()=>void;inventory:ReturnType<typeof signedHogInventory>;
}){
  const title=id==="mac"?"M1 · Development Mac":id==="hel1-root"?"HEL1 · Root":"HEL1 · Data volume";
  const Icon=id==="mac"?Laptop2:id==="hel1-root"?Server:Database;
  const free=reading?.status==="RECEIPT"?reading.freeBytes:null;
  const used=reading?.status==="RECEIPT"?reading.usedPercent:null;
  return <button type="button" onClick={onSelect} aria-pressed={active}
    className={"relative overflow-hidden rounded-3xl border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 "+
      (active?"border-cyan-300/50 bg-cyan-300/[.08]":"border-white/10 bg-white/[.025] hover:border-white/25")}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-bold text-white"><Icon className="h-5 w-5 text-cyan-300"/>{title}</div>
      <span className={"text-[10px] font-bold tracking-wide "+(reading?.status==="RECEIPT"?"text-cyan-300":"text-amber-200")}>
        {reading?.status??"UNKNOWN"}
      </span>
    </div>
    <div className="mt-5 flex items-end justify-between gap-3">
      <div><div className="text-[10px] uppercase tracking-widest text-slate-400">Available</div>
        <div className="mt-1 text-3xl font-black tabular-nums text-white">{bytes(free)}</div></div>
      <div className="text-right"><div className="text-[11px] text-slate-400">Used</div>
        <div className="text-xl font-semibold tabular-nums text-slate-200">{used===null?"Unknown":used.toFixed(1)+"%"}</div></div>
    </div>
    {used===null?<div className="mt-4 h-1.5 border-t border-dashed border-slate-600" aria-hidden="true"/>:
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-cyan-400" style={{width:used+"%"}}/>
      </div>}
    <div className="mt-3 flex justify-between text-[10px] text-slate-400">
      <span>{inventory.categoryCount===null ? (inventory.status==="STALE"?"Category inventory stale":"Category inventory unknown") :
        inventory.categoryCount+" reported gross categories"}</span><span>{reading?.asOf ? shortTime(reading.asOf)+" OLD" : "NO SOURCE"}</span>
    </div>
  </button>;
}
export default function StorageHogWorkbench(){
  const [data,setData]=useState<StorageCommandCenter|null>(null);
  const [events,setEvents]=useState<TeachingEvent[]>([]);
  const [access,setAccess]=useState<{ownerBinding:string|null;mayRecord:boolean}|null>(null);
  const [ledgerStatus,setLedgerStatus]=useState("UNAVAILABLE");
  const [error,setError]=useState<string|null>(null);
  const [active,setActive]=useState<TeachingPlane>("mac");
  const [selected,setSelected]=useState<string|null>(null);
  const [chosen,setChosen]=useState<TeachingLevel>(2);
  const [note,setNote]=useState("");
  const [confirmForever,setConfirmForever]=useState(false);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const pending=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(pending.current)return;
    const abort=new AbortController();pending.current=abort;
    const timeout=window.setTimeout(()=>abort.abort(),7000);
    try{
      const [a,b]=await Promise.all([
        fetch("/api/admin/storage-os",{cache:"no-store",credentials:"same-origin",signal:abort.signal}),
        fetch("/api/admin/storage-os/teaching",{cache:"no-store",credentials:"same-origin",signal:abort.signal}),
      ]);
      if(!a.ok)throw Error("STORAGE OS SOURCE UNAVAILABLE");
      const storage=await a.json() as StorageCommandCenter;
      if(storage.schema!=="aoe2war.private-storage-command-center.v1")
        throw Error("UNRECOGNIZED STORAGE OS SOURCE");
      if(abort.signal.aborted)return;
      setData(storage);setError(null);
      if(b.ok){
        const ledger=await b.json() as {schema:string;events:TeachingEvent[];ownerBinding?:string|null;mayRecord?:boolean};
        if(ledger.schema!=="aoe2war.storage-teaching-history.v1"||!Array.isArray(ledger.events))
          throw Error("TEACHING LEDGER SCHEMA HOLD");
        if(abort.signal.aborted)return;
        const ownerBinding=typeof ledger.ownerBinding==="string"&&/^[a-f0-9]{64}$/.test(ledger.ownerBinding)?ledger.ownerBinding:null;
        setAccess({ownerBinding,mayRecord:!!ownerBinding&&ledger.mayRecord===true});
        setEvents(ledger.events);setLedgerStatus("VERIFIED");
      }else{setAccess(null);setEvents([]);setLedgerStatus("NOT ENROLLED");}
    }catch(e){
      if(!abort.signal.aborted){
        setData(null);setAccess(null);setEvents([]);setLedgerStatus("UNKNOWN");
        setError(e instanceof Error?e.message:"SOURCE READ FAILED");
      }
    }finally{window.clearTimeout(timeout);if(pending.current===abort)pending.current=null;}
  },[]);
  useEffect(()=>{
    const visibility=()=>{if(document.visibilityState==="visible")void refresh();else{
      pending.current?.abort();pending.current=null;
    }};
    visibility();
    const tick=window.setInterval(visibility,60_000);
    document.addEventListener("visibilitychange",visibility);
    return()=>{document.removeEventListener("visibilitychange",visibility);
      window.clearInterval(tick);pending.current?.abort();pending.current=null;};
  },[refresh]);

  const [,refreshClock]=useReducer((tick:number)=>tick+1,0);
  const now=Date.now();
  const inventories=IDS.map(id=>signedHogInventory(data?.visual,id,now));
  const activeInventory=inventories[IDS.indexOf(active)];
  const sourcePlane=activeInventory.plane;
  const reading=data?.planes.find(p=>p.id===active);
  const live=activeInventory.status==="PARTIAL";
  const teachingDeadline=live ? teachingSourceDeadline(sourcePlane?.observedAt,chosen,now) : null;
  const l2Deadline=live ? teachingSourceDeadline(sourcePlane?.observedAt,2,now) : null;
  const nextDeadline=Math.min(l2Deadline??Infinity,teachingDeadline??Infinity,...inventories.map(p=>p.currentUntil??Infinity));
  useEffect(()=>{
    if(!Number.isFinite(nextDeadline))return;
    const timer=window.setTimeout(refreshClock,Math.max(0,nextDeadline+1-Date.now()));
    return ()=>window.clearTimeout(timer);
  },[nextDeadline]);
  const hogs=useMemo(()=>live?[...(sourcePlane?.hogs??[])].sort((a,b)=>b.grossBytes-a.grossBytes):[],
    [live,sourcePlane]);
  const item=hogs.find(h=>h.key===selected)??null;
  const last=item?events.filter(e=>e.plane===active&&e.category===item.key).at(-1)??null:null;
  const priorL5=item?events.some(e=>e.plane===active&&e.category===item.key&&e.requestedLevel===5):false;
  const priorFloor=item?strongestRecordedProtection(events,active,item.key):1;
  const effectiveFloor=item?Math.max(item.level,priorFloor):5;
  const disposition=item?teachingDisposition(effectiveFloor,chosen,priorL5):null;
  const canSave=teachingDeadline!==null&&!!item&&ledgerStatus==="VERIFIED"&&access?.mayRecord===true&&!saving&&
    chosen>=effectiveFloor&&disposition?.status==="ACCEPT"&&!priorL5&&
    (chosen!==2||note.trim().length>0)&&(chosen!==5||confirmForever);
  const choosePlane=(id:TeachingPlane)=>{setActive(id);setSelected(null);setNotice(null);};
  const chooseItem=(key:string)=>{
    const candidate=hogs.find(h=>h.key===key);
    const historical=strongestRecordedProtection(events,active,key);
    setSelected(key);setChosen(Math.max(2,candidate?.level??2,historical) as TeachingLevel);setNote("");
    setConfirmForever(false);setNotice(null);
  };
  const save=async()=>{
    if(!item||!sourcePlane||!canSave)return;
    if(teachingSourceDeadline(sourcePlane.observedAt,chosen)===null){refreshClock();return;}
    setSaving(true);setNotice(null);
    try{
      const response=await fetch("/api/admin/storage-os/teaching",{
        method:"POST",cache:"no-store",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          plane:active,category:item.key,level:chosen,observedAt:sourcePlane.observedAt,
          grossBytes:item.grossBytes,sourceFloor:item.level,overlaps:item.overlaps,
          previousId:last?.id??null,note,confirmPermanent:chosen===5&&confirmForever,
        }),
      });
      const result=await response.json() as {detail?:string;authority?:string};
      if(!response.ok)throw Error(result.detail??"OWNER TEACHING HOLD");
      if(result.authority!=="OWNER_FEEDBACK_ONLY_NO_DELETE")throw Error("INVALID WRITE RECEIPT");
      setNotice("Owner classification recorded in the signed append-only intent ledger. No file was deleted.");
      setConfirmForever(false);
      await refresh();
    }catch(e){setNotice(e instanceof Error?e.message:"SAVE FAILED");}
    finally{setSaving(false);}
  };
  const safeCount=IDS.filter(id=>data?.planes.find(p=>p.id===id)?.status==="RECEIPT").length;
  return <main className="min-h-screen bg-[#070e18] text-slate-100">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_at_24%_8%,rgba(34,211,238,.12),transparent_48%),radial-gradient(ellipse_at_80%_0%,rgba(167,139,250,.07),transparent_52%)]"/>
    <div className="relative mx-auto max-w-[1550px] space-y-5 px-4 py-7 sm:px-7 lg:px-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/storage-os" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-200"><ArrowLeft className="h-4 w-4"/> Storage OS command center</Link>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[.34em] text-cyan-300/85">AoE2WAR / Private capacity intelligence</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-6xl">Storage <span className="text-cyan-300">Explorer</span></h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Find the biggest consumers. Teach Storage OS what to keep. Retire exact files only through a separately authorized, independently verified cleanup lane.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[11px] font-bold text-slate-300"><LockKeyhole className="h-4 w-4"/> PRIVATE / NO AUTO-DELETE</span>
          <button type="button" onClick={()=>void refresh()} className="rounded-full border border-cyan-300/30 p-3 text-cyan-200 hover:bg-cyan-300/10" aria-label="Refresh accepted storage receipts"><RefreshCw className="h-4 w-4"/></button>
        </div>
      </header>
      {error&&<div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}. Data withheld rather than fabricated.</div>}
      <section aria-label="Three independent storage volumes" className="grid gap-3 md:grid-cols-3">
        {IDS.map((id,i)=><Drive key={id} id={id} active={active===id}
          onSelect={()=>choosePlane(id)} reading={data?.planes.find(p=>p.id===id)}
          inventory={inventories[i]}/>)}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300"/>{data?safeCount+"/3 drives with current capacity receipts":"Current capacity receipts unknown"} · Individual file coverage: NOT ADMITTED</span>
        <span>Gross hog source: {live?"SIGNED · "+shortTime(sourcePlane?.observedAt??null):activeInventory.status} · Owner learning ledger: {ledgerStatus}</span>
      </div>
      <section className="grid gap-4 xl:grid-cols-[.96fr_1.04fr]" aria-label="Interactive capacity anatomy">
        <div className={PANEL+" p-5 sm:p-7"}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-black tracking-[.26em] text-cyan-300">CAPACITY MAP</p><h2 className="mt-2 text-2xl font-bold text-white">{reading?.label??active}</h2></div>
            <HardDrive className="h-6 w-6 text-cyan-300"/>
          </div>
          <div className="mt-2"><Sunburst hogs={hogs} status={activeInventory.status} selected={selected} onSelect={chooseItem}/></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Source observed</div>
              <div className="mt-2 text-sm font-semibold text-white">{sourcePlane?.observedAt??"UNKNOWN"}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Coverage</div>
              <div className="mt-2 text-sm font-semibold text-white">{sourcePlane?.coverage??"UNKNOWN / NOT COMPLETE"}</div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-amber-100/80">This map is derived exclusively from authenticated gross categories. It never guesses unmeasured files, calculates unique reclaim from overlapping buckets or scans a host from the browser.</p>
        </div>
        <div className={PANEL+" p-5 sm:p-7"}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-black tracking-[.26em] text-cyan-300">RANKED SOURCE ALLOCATIONS</p><h2 className="mt-2 text-2xl font-bold text-white">Biggest storage hogs</h2></div>
            <SlidersHorizontal className="h-5 w-5 text-slate-400"/>
          </div>
          {hogs.length===0?<div className="mt-6 flex min-h-[330px] flex-col justify-center rounded-2xl border border-dashed border-white/15 p-6 text-sm leading-6 text-amber-100/90">
            {live?"The signed observation reported no gross categories for this drive.":
              activeInventory.status==="STALE"?"The last signed category inventory has expired. Awaiting a new host observation.":
              "No current signed hog inventory for this drive."}
          </div>:
          <div className="mt-5 max-h-[610px] space-y-2 overflow-y-auto pr-1">{hogs.map((h,i)=>{
            const total=hogs.reduce((acc,x)=>acc+x.grossBytes,0);
            const pct=total>0?100*h.grossBytes/total:0;
            const isSelected=selected===h.key;
            const past=events.filter(e=>e.plane===active&&e.category===h.key).at(-1);
            const sameSource=past&&past.sourceObservedAt===sourcePlane?.observedAt&&
              past.grossBytes===h.grossBytes&&past.sourceFloor===h.level&&past.overlaps===h.overlaps;
            const applied=past?.requestedLevel===5||sameSource;
            const level=Math.max(h.level,strongestRecordedProtection(events,active,h.key),applied&&past?past.effectiveLevel:1);
            return <button type="button" key={h.key} onClick={()=>chooseItem(h.key)}
              aria-pressed={isSelected} className={"w-full rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 "+
                (isSelected?"border-cyan-300/60 bg-cyan-300/[.08]":"border-white/10 bg-white/[.025] hover:border-white/20")}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">#{i+1} · {h.overlaps?"OVERLAP":"GROSS ALLOCATION"}</div>
                  <div className="mt-1 truncate text-sm font-semibold text-white">{h.label}</div></div>
                <div className="shrink-0 text-right"><div className="font-mono text-sm font-bold text-white">{bytes(h.grossBytes)}</div>
                  <div className="mt-1 text-[10px] font-bold" style={{color:level>1?LVLCOLORS[level as TeachingLevel]:"#22d3ee"}}>L{level} {applied?"· taught":"· source"}</div></div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full" style={{width:pct+"%",background:COLORS[i%COLORS.length]}}/></div>
            </button>;
          })}</div>}
        </div>
      </section>
      <StoragePremiumInspector inventorySource={activeInventory} activeId={active}/>
      <section className={PANEL+" p-5 sm:p-7"} aria-label="Owner classification studio">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-black tracking-[.25em] text-amber-300">OWNER CLASSIFICATION · NEXT PHASE L2</p>
            <h2 className="mt-2 text-2xl font-bold text-white">{item?item.label:"Choose a storage consumer"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {item?bytes(item.grossBytes)+" reported gross · "+item.key+" · source L"+item.level:
                "Select a ranked category or radial wedge to review what belongs in L2, L3, L4 or permanent L5."}
            </p></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 px-3 py-2 text-[10px] font-bold text-amber-200">
            <ShieldAlert className="h-4 w-4"/> INTENT ONLY
          </span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {LEVELS.map(l=><button type="button" key={l.id}
            disabled={!item||priorL5||l.id<effectiveFloor}
            onClick={()=>{setChosen(l.id);setConfirmForever(false);setNotice(null);}}
            aria-pressed={chosen===l.id}
            className={"rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 "+
              (chosen===l.id?"border-white/55 bg-white/[.07]":"border-white/10 bg-white/[.02] hover:border-white/30")}>
            <div className="flex items-center gap-2 font-bold text-white"><span className="h-3 w-3 rounded-full" style={{background:LVLCOLORS[l.id]}}/>{l.label}</div>
            <div className="mt-2 text-xs leading-5 text-slate-400">{l.description}</div>
          </button>)}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <label htmlFor="storage-owner-note" className="text-xs font-semibold text-slate-300">Why? (Level 2 requires an owner explanation; no passwords or secrets)</label>
            <textarea id="storage-owner-note" rows={3} maxLength={160} value={note}
              disabled={!item||priorL5} onChange={e=>setNote(e.target.value)}
              placeholder="Historical release archive; preserve until restored on Intel…"
              className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-cyan-300/60 disabled:opacity-40"/>
            <div className="mt-2 text-[11px] text-slate-400">{note.length}/160 characters</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Clock3 className="h-4 w-4"/> Classification evidence</div>
            {item?<div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
              <div>Requested: <strong className="text-white">L{chosen}</strong> · effective policy: <strong className="text-white">{disposition?.effectiveLevel?"L"+disposition.effectiveLevel:"HOLD"}</strong></div>
              <div>Source protection: <strong className="text-amber-200">L{item.level} source · historical minimum L{priorFloor}; stronger owner protection cannot be downgraded</strong></div>
              <div>Unique reclaim and exact-file admission: <strong className="text-amber-200">NOT VERIFIED</strong></div>
            </div>:<p className="mt-3 text-xs text-slate-400">No category selected.</p>}
          </div>
        </div>
        {item&&sourcePlane&&access&&ledgerStatus==="VERIFIED"&&<StorageTeachingHistory
          events={events} plane={active} item={item} observedAt={sourcePlane.observedAt}
          ownerBinding={access.ownerBinding} now={now}/>}
        {chosen===5&&item&&!priorL5&&<label className="mt-4 flex items-start gap-3 rounded-xl border border-rose-300/25 bg-rose-300/[.04] p-4 text-sm text-rose-100">
          <input type="checkbox" checked={confirmForever} onChange={e=>setConfirmForever(e.target.checked)} className="mt-1"/>
          I understand L5 is permanent protection and cannot be downgraded or approved for software deletion.
        </label>}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" onClick={()=>void save()} disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
            <Check className="h-4 w-4"/>{saving?"Recording…":"Record classification"}
          </button>
          <div role="status" className="min-w-0 flex-1 text-xs leading-5 text-slate-400">
            {notice??(priorL5?"This category has permanent owner L5 protection.":
              chosen<effectiveFloor?"A stronger signed source or historical owner floor blocks this classification.":
              chosen===2&&!note.trim()?"Enter a written explanation before saving Level 2.":
              ledgerStatus!=="VERIFIED"?"Learning ledger not admitted: choices remain unsaved previews.":
              !access?.ownerBinding?"Recording requires enrollment of the owner's app account.":
              !access.mayRecord?"Only the enrolled owner account can record a classification.":
              !live?"Saving requires a current signed observation.":
              teachingDeadline===null?"Level 2 teaching requires a signed observation from the past hour.":
              "Saves an append-only owner-intent receipt; never executes delete, archive or migration.")}
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3" aria-label="Execution boundaries">
        <div className={PANEL+" p-5"}><ShieldCheck className="h-6 w-6 text-emerald-300"/>
          <h3 className="mt-4 font-bold text-white">L1 / previous phase</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">Owner has moved the campaign to L2. Independently certified L1 coverage remains UNKNOWN without its signed closure receipt.</p></div>
        <div className={PANEL+" p-5"}><Archive className="h-6 w-6 text-violet-300"/>
          <h3 className="mt-4 font-bold text-white">Per-file proofs required</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">Current signed bridge authenticates gross categories only. Exact paths, inode/device identity, rollback pins and independent restore must be accepted separately.</p></div>
        <div className={PANEL+" p-5"}><LockKeyhole className="h-6 w-6 text-rose-300"/>
          <h3 className="mt-4 font-bold text-white">No automated deletes</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">No cron, systemd timer, web POST or dashboard choice has cleanup authority. Owner-approved exact-file retirement uses the existing native controller after fresh checks.</p></div>
      </section>
      <footer className="border-t border-white/10 py-5 text-xs text-slate-400">
        Storage OS / Owner learning · Data provenance on each drive · Receipt freshness matters · No artificial sizes or fake deletion metrics
      </footer>
    </div>
  </main>;
}
