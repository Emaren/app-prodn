"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Fingerprint, Layers3, ShieldAlert, ShieldCheck, History, Clock3 } from "lucide-react";
import type { PlaneId, Level, StorageVisualView } from "@/lib/storageVisualPrivate";
import type { OwnerDecision, OwnerReviewEvent } from "@/lib/storageOwnerReviews";

const ROLES=[
 {level:1 as Level,title:"L1 / GUARDED",sub:"Exact reproducible outputs",color:"cyan",icon:Layers3},
 {level:2 as Level,title:"L2 / REVIEW",sub:"Unknown / owner judgment",color:"amber",icon:ShieldAlert},
 {level:3 as Level,title:"L3 / MIGRATION",sub:"Restore & rollback dependent",color:"violet",icon:Archive},
 {level:4 as Level,title:"L4 / PROTECTED",sub:"Active, historical or financial",color:"emerald",icon:ShieldCheck},
];
const CHOICES:[OwnerDecision,string][]=[
 ["PROTECT","PROTECT"],
 ["REVIEW_LATER","REVIEW LATER"],
 ["SINGLE_CANDIDATE_APPROVAL","SINGLE-CANDIDATE APPROVAL"],
 ["MIGRATION_REVIEW","MIGRATION REVIEW"],
];
function size(n:number|null){return n===null?"UNKNOWN":n>=1024**3?`${(n/1024**3).toFixed(2)} GiB`:`${(n/1024**2).toFixed(1)} MiB`;}
function age(at:string){const n=Date.parse(at);return Number.isFinite(n)?`${Math.max(0,Math.floor((Date.now()-n)/60000))}m`:"UNKNOWN";}
export default function StorageLevelPanels({visual,activeId}:{visual:StorageVisualView|undefined;activeId:PlaneId}){
 const [level,setLevel]=useState<Level>(2),[category,setCategory]=useState<string|null>(null);
 const [alias,setAlias]=useState<string|null>(null),[history,setHistory]=useState<OwnerReviewEvent[]|null>(null);
 const [notice,setNotice]=useState<string|null>(null),[choice,setChoice]=useState<OwnerDecision|null>(null);
 const [understood,setUnderstood]=useState(false),[busy,setBusy]=useState(false);
 const plane=visual?.planes.find(p=>p.id===activeId);
 const current=visual?.source==="SIGNED_PRIVATE_RECEIPT"&&plane?.status==="RECEIPT";
 const items=current?plane.reviewItems:undefined;
 const hogs=current?plane.hogs:[];
 const selected=items?.find(i=>i.alias===alias)??null;
 const events=(history??[]).filter(e=>e.plane===activeId&&e.alias===alias);
 const last=events.at(-1)??null;
 const active=selected&&last&&last.fingerprint===selected.fingerprint&&last.sourceDigest===selected.sourceDigest&&
  last.sourceRevision===selected.sourceRevision&&last.category===selected.category&&last.decision!=="REVOKE"&&
  (!last.expiresAt||Date.parse(last.expiresAt)>Date.now())?last.decision:null;
 const refreshHistory=useCallback(async(signal?:AbortSignal)=>{
   try{
     const response=await fetch("/api/admin/storage-os/reviews",{cache:"no-store",signal});
     if(!response.ok)throw Error("READ HOLD");
     const body=await response.json() as {schema:string;events:OwnerReviewEvent[]};
     if(body.schema!=="aoe2war.storage-owner-reviews.v1"||!Array.isArray(body.events))throw Error("SCHEMA HOLD");
     if(!signal?.aborted){setHistory(body.events);setNotice(null);}
   }catch{if(!signal?.aborted){setHistory(null);setNotice("Owner history unavailable; no action authorized.");}}
 },[]);
 useEffect(()=>{setAlias(null);setCategory(null);setChoice(null);setUnderstood(false);},[activeId]);
 useEffect(()=>{
   if(!current){setHistory(null);return;}
   const controller=new AbortController();
   if(document.visibilityState==="visible")void refreshHistory(controller.signal);
   return ()=>controller.abort();
 },[current,activeId,refreshHistory]);
 async function record(decision:OwnerDecision){
   if(!selected||!current||history===null||busy)return;
   setBusy(true);
   try{
     const response=await fetch("/api/admin/storage-os/reviews",{method:"POST",cache:"no-store",credentials:"same-origin",
       headers:{"Content-Type":"application/json"},
       body:JSON.stringify({plane:activeId,alias:selected.alias,fingerprint:selected.fingerprint,
         sourceDigest:selected.sourceDigest,sourceRevision:selected.sourceRevision,decision,previousId:last?.id??null})});
     if(!response.ok)throw Error("HOLD");
     await refreshHistory();setChoice(null);setUnderstood(false);
   }catch{setNotice("Decision NOT saved. Identity, authorization or secure register changed.");}
   finally{setBusy(false);}
 }
 const samples=current?plane.capacitySamples??[]:[];
 const change=samples.length>1?samples[samples.length-1].ordinaryFreeBytes-samples[0].ordinaryFreeBytes:null;
 return <section aria-label="L1 to L4 storage governance" className="space-y-4">
   <div className="flex flex-wrap items-end justify-between gap-3">
     <div><div className="text-[10px] font-bold tracking-[.3em] text-cyan-200/70">OWNER STORAGE GOVERNANCE</div>
       <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Four levels. Zero guesswork.</h2>
       <p className="mt-2 max-w-3xl text-sm text-slate-400">Every number comes from signed source evidence. Gross allocations may overlap; intent is never a deletion permit.</p></div>
     <span className="rounded-full border border-white/10 bg-slate-900 px-4 py-2 text-[10px] font-bold tracking-widest text-slate-300">{current?"SIGNED SOURCE":"NO CURRENT SIGNED REVIEW FEED"}</span>
   </div>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Four distinct storage levels">
     {ROLES.map(role=>{
       const Icon=role.icon,group=hogs.filter(h=>h.level===role.level),candidateCount=items?.filter(i=>i.level===role.level).length;
       const gross=group.reduce((a,h)=>a+h.grossBytes,0);
       const tint=role.color==="cyan"?"border-cyan-400/40 bg-cyan-400/[.07]":role.color==="amber"?"border-amber-400/40 bg-amber-400/[.07]":role.color==="violet"?"border-violet-400/40 bg-violet-400/[.07]":"border-emerald-400/40 bg-emerald-400/[.07]";
       return <button type="button" key={role.level} onClick={()=>{setLevel(role.level);setCategory(null);setAlias(null);setChoice(null);}}
         aria-pressed={level===role.level}
         className={`min-h-[208px] rounded-[1.65rem] border p-5 text-left transition hover:border-white/35 focus-visible:outline-2 focus-visible:outline-cyan-200 ${level===role.level?tint:"border-white/10 bg-slate-950/75"}`}>
         <Icon className="h-7 w-7 text-slate-200"/>
         <div className="mt-5 text-xs font-black tracking-wider text-white">{role.title}</div>
         <div className="mt-1 text-xs text-slate-400">{role.sub}</div>
         <div className="mt-4 flex items-end justify-between gap-2">
           <div><div className="text-[10px] text-slate-500">GROSS ALLOCATED</div><div className="mt-1 text-xl font-bold tabular-nums text-white">{current?size(gross):"UNKNOWN"}</div></div>
           <div className="text-right"><div className="text-[10px] text-slate-500">SIGNED ALIASES</div><div className="mt-1 text-xl font-bold tabular-nums text-white">{candidateCount??"—"}</div></div>
         </div>
         <div className="mt-3 text-[10px] text-slate-500">{current?`${group.length} signed categories · ${age(plane.observedAt)} old`:"No authenticated per-item census; deletion eligibility UNKNOWN"}</div>
       </button>;
     })}
   </div>
   <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
     <div className="rounded-[1.65rem] border border-white/10 bg-slate-950/75 p-5 sm:p-7">
       <h3 className="text-xl font-bold text-white">{ROLES.find(r=>r.level===level)?.title} · Top consumers</h3>
       <p className="mt-2 text-xs leading-5 text-slate-400">Select an observed category, then an exact source alias. Protected paths are never exposed to browsers.</p>
       <div className="mt-5 space-y-2">{hogs.filter(h=>h.level===level).length===0?
         <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">{current?"No reported category; coverage may be incomplete.":"NO VERIFIED HOG FEED"}</p>:
         hogs.filter(h=>h.level===level).map(h=><button key={h.key} type="button" onClick={()=>{setCategory(category===h.key?null:h.key);setAlias(null);}}
           aria-pressed={category===h.key} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 text-left hover:border-cyan-300/30">
           <span className="min-w-0"><span className="block text-sm font-semibold text-white">{h.label}</span><span className="text-[10px] text-slate-500">{h.key} · {h.overlaps?"OVERLAPS":"UNIQUE APFS UNKNOWN"}</span></span>
           <span className="shrink-0 font-mono text-sm font-semibold text-white">{size(h.grossBytes)}</span></button>)}</div>
       {category&&<div className="mt-5 border-t border-white/10 pt-4">
         <div className="text-xs font-bold tracking-wide text-cyan-200">SOURCE-OWNED CANDIDATE ALIASES</div>
         {(items??[]).filter(i=>i.category===category).length===0?<p className="mt-3 text-xs text-slate-500">No verified individual register for this category. No blanket category approvals.</p>:
           <div className="mt-3 space-y-2">{items!.filter(i=>i.category===category).map(i=><button type="button" key={i.alias} onClick={()=>{setAlias(i.alias);setChoice(null);setUnderstood(false);}}
             aria-pressed={alias===i.alias} className="flex w-full justify-between gap-2 rounded-xl border border-white/10 p-3 text-left hover:border-cyan-300/40"><div><div className="font-mono text-xs text-white">{i.alias}</div><div className="mt-1 text-[10px] text-slate-500">{i.sourceStatus} · {i.overlaps?"OVERLAP HOLD":"UNIQUE GAIN UNKNOWN"}</div></div><span className="font-mono text-xs text-white">{size(i.grossBytes)}</span></button>)}</div>}
       </div>}
     </div>
     <div className="rounded-[1.65rem] border border-white/10 bg-slate-950/75 p-5 sm:p-7">
       <div className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-cyan-300"/><h3 className="text-xl font-bold text-white">Exact owner decisions</h3></div>
       {!selected?<p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Select a signed candidate alias to review provenance and record a revocable decision. Aggregate categories cannot be approved.</p>:<>
         <div className="mt-5 rounded-xl border border-white/10 bg-white/[.025] p-4 text-xs text-slate-300">
           <div className="font-mono font-bold text-white">{selected.alias}</div>
           <div className="mt-3 font-mono text-[10px] text-slate-400">FINGERPRINT {selected.fingerprint.slice(0,16)}…<br/>SOURCE {selected.sourceRevision.slice(0,12)}…<br/>RECEIPT {selected.sourceDigest.slice(0,16)}…</div>
           <div className="mt-3 text-amber-200">{selected.sourceStatus} / {selected.proofState} / {selected.overlaps?"OVERLAP":"NO APFS GAIN PROOF"}</div>
         </div>
         <p className="mt-3 text-xs text-slate-400">Current matching owner intent: <strong className="text-white">{history===null?"UNKNOWN":active??"NONE"}</strong></p>
         <div className="mt-4 grid grid-cols-2 gap-2">{CHOICES.map(([key,label])=>{
           const canApprove=selected.level===1&&selected.sourceStatus==="GUARDED"&&selected.proofState==="COMPLETE"&&!selected.overlaps&&Date.now()-Date.parse(plane!.observedAt)<=3600_000;
           return <button key={key} type="button" disabled={busy||history===null||(key==="SINGLE_CANDIDATE_APPROVAL"&&!canApprove)} onClick={()=>{setChoice(key);setUnderstood(false);}}
             className={`rounded-lg border p-3 text-left text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-30 ${choice===key?"border-cyan-300/50 bg-cyan-300/10 text-cyan-200":"border-white/10 text-slate-300"}`}>{label}</button>;
         })}</div>
         {choice&&<div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[.05] p-3 text-xs text-amber-100">
           <p>Scoped to this signed fingerprint and source revision. This creates owner REVIEW INTENT, never an executable delete or migration authority. Drift invalidates earlier approvals.</p>
           <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={understood} onChange={e=>setUnderstood(e.target.checked)}/> I understand this does not delete or authorize a controller.</label>
           <button type="button" disabled={!understood||busy} onClick={()=>void record(choice)} className="mt-3 w-full rounded-lg bg-cyan-300 p-2 font-bold text-slate-950 disabled:opacity-30">Record this exact decision</button>
         </div>}
         {last&&last.decision!=="REVOKE"&&<button type="button" disabled={busy||history===null} onClick={()=>void record("REVOKE")} className="mt-3 text-xs text-slate-400 underline disabled:opacity-30">Revoke latest decision</button>}
         <div className="mt-5 border-t border-white/10 pt-4"><div className="flex items-center gap-2 text-xs font-bold text-white"><History className="h-4 w-4"/> Append-only history</div>
         {events.slice(-5).reverse().map(e=><div key={e.id} className="mt-2 flex justify-between gap-2 text-[10px] text-slate-400"><span>{e.decision.replaceAll("_"," ")}</span><span>{age(e.at)} · {e.fingerprint===selected.fingerprint?"MATCH":"SUPERSEDED"}</span></div>)}
         {events.length===0&&<p className="mt-2 text-xs text-slate-500">No recorded decisions for this alias.</p>}</div>
       </>}
       {notice&&<p role="alert" className="mt-4 rounded-xl border border-rose-400/30 p-3 text-xs text-rose-200">{notice}</p>}
     </div>
   </div>
   <div className="grid gap-3 md:grid-cols-2">
     <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"><div className="flex items-center gap-2 text-xs font-bold tracking-widest text-cyan-200"><Clock3 className="h-4 w-4"/> PHYSICAL FREE-SPACE HISTORY</div>
       <div className="mt-3 text-2xl font-bold text-white">{change===null?"UNKNOWN":`${change>=0?"+":"−"}${size(Math.abs(change))}`}</div>
       <p className="mt-2 text-xs text-slate-500">{samples.length} signed samples; a free-space change is NOT proof of a cleanup transaction. No invented growth trend or physical recovery.</p></div>
     <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"><div className="flex items-center gap-2 text-xs font-bold tracking-widest text-emerald-200"><ShieldCheck className="h-4 w-4"/> SAFE REVIEW BOUNDARY</div>
       <div className="mt-3 text-lg font-bold text-white">{items?`${items.length} signed aliases`:"EXACT ITEM INVENTORY UNKNOWN"}</div>
       <p className="mt-2 text-xs text-slate-500">Build, prune, snapshot and rollback events remain in the verified timeline above. None of these buttons invokes a deletion or a collector.</p></div>
   </div>
 </section>;
}
