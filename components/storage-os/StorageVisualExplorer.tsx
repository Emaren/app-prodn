"use client";

import { useState } from "react";
import { Activity, Archive, Clock3, Eye, Layers3, Shield, ShieldAlert, Trash2 } from "lucide-react";
import type { StorageVisualView, PlaneId, VisualHog, VisualEvent } from "@/lib/storageVisualPrivate";
import { LEVELS, INVALID_LEVEL, byLevel, grossLevelSlices } from "@/lib/storageVisualLevelPolicy";

const FRAME="rounded-[1.65rem] border border-white/10 bg-slate-950/65";
function size(bytes:number|null):string{
  if(bytes===null)return "—";
  if(bytes===0)return "0 B";
  return bytes>=1024**3?`${(bytes/1024**3).toFixed(2)} GiB`:`${(bytes/1024**2).toFixed(1)} MiB`;
}
function age(x:string){const t=Date.parse(x),minutes=Math.max(0,Math.floor((Date.now()-t)/60000));return minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`;}
function point(r:number,angle:number):[number,number]{const v=(angle-90)*Math.PI/180;return [120+r*Math.cos(v),120+r*Math.sin(v)];}
function wedge(start:number,end:number,inside:number,outside:number){
  if(end-start<0.001)return "";
  const e=Math.min(end,start+359.999);
  const [a,b]=point(outside,start),[c,d]=point(outside,e),[f,g]=point(inside,e),[h,i]=point(inside,start);
  const large=e-start>180?1:0;
  return `M ${a} ${b} A ${outside} ${outside} 0 ${large} 1 ${c} ${d} L ${f} ${g} A ${inside} ${inside} 0 ${large} 0 ${h} ${i} Z`;
}
const RING_COLORS=["#22d3ee","#a5b4fc","#fbbf24","#34d399","#38bdf8","#f472b6","#d8b4fe","#fca5a5","#7dd3fc","#f9a8d4"];

function Sunburst({items,selectedKey}: {items:VisualHog[];selectedKey:string|null}) {
  const {total:gross,slices:levelSlices,complete}=grossLevelSlices(items);
  let cursor=0,innerCursor=0;
  return <div className="relative mx-auto w-full max-w-[340px]">
    <svg role="img" aria-label={gross>0?"Concentric chart of relative gross allocations, not unique disk use":"No verified storage-size receipt"} viewBox="0 0 240 240" className="w-full">
      <circle cx="120" cy="120" r="99" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 7"/>
      <circle cx="120" cy="120" r="89" fill="none" stroke="#1e293b" strokeWidth="26"/>
      <circle cx="120" cy="120" r="58" fill="none" stroke="#1e293b" strokeWidth="18"/>
      {gross>0&&items.map((h,i)=>{
        const start=cursor;cursor+=h.grossBytes/gross*360;
        return <path key={h.key} d={wedge(start,cursor,76,103)}
          fill={selectedKey===h.key?"#ffffff":RING_COLORS[i%RING_COLORS.length]}
          stroke="#050b14" strokeWidth="1.4" opacity={selectedKey && selectedKey !== h.key ? 0.35 : 1}/>;
      })}
      {gross>0&&levelSlices.map(x=>{
        const start=innerCursor;innerCursor+=x.value/gross*360;
        return <path key={x.level} d={wedge(start,innerCursor,46,68)}
          fill={x.color} stroke="#050b14" strokeWidth="1.5"/>;
      })}
      <circle cx="120" cy="120" r="37" fill="#07111e" stroke="#334155" strokeWidth="1"/>
      <text x="120" y="117" textAnchor="middle" fill="#f8fafc" fontSize="18" fontWeight="700">
        {gross>0?size(gross).replace(" GiB","G").replace(" MiB","M"):"—"}
      </text>
      <text x="120" y="135" textAnchor="middle" fill="#94a3b8" fontSize="8" letterSpacing="1.2">{gross>0?"GROSS SLICES":"NO RECEIPT"}</text>
    </svg>
    <div className="text-center text-[10px] font-bold tracking-widest text-slate-500">INNER · PROTECTION LEVELS　 OUTER · TOP CONSUMERS</div>
    {!complete&&<div role="status" className="mt-2 text-center text-xs font-bold text-amber-200">UNKNOWN LEVEL / SIZE HOLD · NO PROTECTION CLASSIFICATION OR RECOVERY AUTHORITY</div>}
  </div>;
}
function Timeline({events,source}: {events:VisualEvent[];source:string}) {
  const icons={GENERATED:Layers3,PRUNE_RECEIPT:Trash2,PRUNE_HOLD:ShieldAlert,NEXT_REVIEW:Eye,SNAPSHOT:Archive,COLLECTED:Activity};
  const names={GENERATED:"BUILD / GENERATION",PRUNE_RECEIPT:"PRUNE RECEIPT",PRUNE_HOLD:"PRUNE BLOCKED",NEXT_REVIEW:"NEXT REVIEW",SNAPSHOT:"SNAPSHOT OBSERVED",COLLECTED:"COLLECTION"};
  return <div className={`${FRAME} p-5 sm:p-7`}>
    <div className="flex items-center justify-between gap-2">
      <div><div className="text-[10px] font-bold tracking-[.25em] text-cyan-200/70">DISK ACTIVITY</div>
        <h3 className="mt-1 text-xl font-bold">Build / prune ledger</h3></div>
      <Activity className="h-5 w-5 text-cyan-300"/>
    </div>
    {events.length===0?<div className="mt-6 flex min-h-[145px] items-center gap-3 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">
      <Clock3 className="h-6 w-6 shrink-0"/> No verified generation, cleanup or pending-review events published for this drive.
    </div>:
    <div className="mt-4 space-y-1">{events.slice(0,12).map(e=>{
      const Icon=icons[e.kind];
      return <div key={e.id} className="flex items-center gap-3 rounded-xl border-b border-white/[.045] py-3">
        <span className="rounded-lg bg-white/[.06] p-2 text-cyan-200"><Icon className="h-4 w-4"/></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold tracking-wider text-slate-200">{names[e.kind]}</div>
          <div className="mt-1 text-[11px] text-slate-500">{e.category?.replaceAll("_"," ")??"Storage OS"} · {age(e.at)}</div>
        </div>
        <div className="text-right"><div className="font-mono text-sm font-bold text-white">{size(e.bytes)}</div>
          {e.kind==="PRUNE_RECEIPT"&&<div className="text-[9px] text-amber-200">RECEIPT · NOT NET APFS GAIN</div>}
        </div>
      </div>;
    })}</div>}
    <div className="mt-4 text-[10px] text-slate-500">SOURCE · {source==="NONE"?"NO VERIFIED RECEIPT":source} · NO DELETE CONTROLS</div>
  </div>;
}

export default function StorageVisualExplorer({visual,activeId}:{visual:StorageVisualView|undefined;activeId:PlaneId}){
  const [selectedKey,setSelectedKey]=useState<string|null>(null);
  const source=visual?.source??"NONE";
  const plane=visual?.planes.find(p=>p.id===activeId);
  const hogs=plane?.hogs??[];
  const events=plane?.events??[];
  const total=hogs.reduce((a,b)=>a+b.grossBytes,0);
  const slice=hogs.find(x=>x.key===selectedKey)??null;
  const current=source==="SIGNED_PRIVATE_RECEIPT"&&plane?.status==="RECEIPT";
  return <section aria-label="Storage intelligence" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 px-1">
      <div>
        <div className="text-[10px] font-bold tracking-[.34em] text-cyan-200/65">DEEP STORAGE INTELLIGENCE</div>
        <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Where the bytes live.</h2>
      </div>
      <span className={`rounded-full border px-3 py-2 text-[10px] font-bold tracking-widest ${current?"border-cyan-300/25 text-cyan-200":"border-amber-300/25 text-amber-100"}`}>
        {current?"SIGNED PRIVATE RECEIPT":plane?"STALE RECEIPT":"NO VERIFIED HOG FEED"}
      </span>
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
      <div className={`${FRAME} p-5 sm:p-7`}>
        <div className="flex flex-wrap justify-between gap-3">
          <div><div className="text-[10px] font-bold tracking-[.25em] text-cyan-200/70">CAPACITY ANATOMY</div>
            <h3 className="mt-1 text-xl font-bold">Radial storage map</h3></div>
          <span className="text-[10px] font-bold text-slate-500">{plane?.coverage==="DISJOINT"?"NONOVERLAPPING REPORTED CATEGORIES":"GROSS ALLOCATIONS · MAY OVERLAP"}</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1.4fr_.6fr] sm:items-center">
          <Sunburst items={hogs} selectedKey={selectedKey}/>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            {LEVELS.map(l=><div key={l.level} className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{background:l.color}}/>
                <span className="text-[10px] font-black tracking-wide text-slate-100">{l.short}</span></div>
              <div className="mt-1 text-[10px] text-slate-400">{l.name}</div>
              <div className="text-[9px] text-slate-600">{l.detail}</div>
            </div>)}
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3 text-xs text-slate-400">
          {slice?<><span className="font-bold text-white">{slice.label}</span> · {size(slice.grossBytes)} · L{slice.level}</>:
            "Select any consumer to isolate its slice. No deletion authority is implied."}
        </div>
        <div className="mt-3 text-[10px] leading-5 text-slate-500">
          {plane?`Observed ${age(plane.observedAt)} · Gross categories may overlap, contain clones or omit unknown storage. No slice is unique physical reclaim.`:
            "This is a real-data visualization. Until a signed collector receipt is present, no historical sizes are hardcoded into the chart."}
        </div>
      </div>
      <div className={`${FRAME} p-5 sm:p-7`}>
        <div className="flex items-center justify-between">
          <div><div className="text-[10px] font-bold tracking-[.25em] text-cyan-200/70">LARGEST ALLOCATIONS</div>
            <h3 className="mt-1 text-xl font-bold">Top storage hogs</h3></div>
          <Shield className="h-5 w-5 text-emerald-300"/>
        </div>
        {hogs.length===0?<div className="mt-5 flex min-h-[250px] items-center rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">
          No authenticated per-category sizes for this drive. An old manual reading is never substituted for live telemetry.
        </div>:
        <div className="mt-5 space-y-2">{hogs.slice(0,12).map((h,i)=>{
          const pct=total>0?Math.max(1,100*h.grossBytes/total):0;
          const meta=byLevel(h.level)??INVALID_LEVEL;
          return <button key={h.key} type="button" onClick={()=>setSelectedKey(selectedKey===h.key?null:h.key)}
            aria-pressed={selectedKey===h.key} className={`w-full rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${selectedKey===h.key?"border-cyan-300/50 bg-cyan-300/[.05]":"border-white/[.07] bg-white/[.025] hover:border-white/20"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-semibold text-slate-200">{i+1}. {h.label}</span>
              <span className="shrink-0 font-mono text-xs font-bold text-white">{size(h.grossBytes)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full" style={{width:`${pct}%`,background:meta.color}}/></div>
            <div className="mt-2 flex justify-between gap-2 text-[9px] font-bold tracking-wide text-slate-500">
              <span style={{color:meta.color}}>{meta.short} · {meta.name.toUpperCase()}</span>
              <span>{h.overlaps?"OVERLAPS":"GROSS · UNVERIFIED UNIQUE"}</span>
            </div>
          </button>;
        })}</div>}
      </div>
    </div>
    <Timeline events={events} source={source}/>
  </section>;
}
