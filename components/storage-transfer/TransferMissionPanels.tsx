"use client";

import {
  Activity, Archive, ArrowRight, CheckCircle2, Clock3, Database, HardDrive,
  LockKeyhole, Radar, Server, ShieldAlert, ShieldCheck, Timer, Waves,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  byteLabel, measuredProgress, TRANSFER_STEPS,
  type TransferCohort, type TransferReadModel, type TransferStep,
} from "@/lib/storageTransferPresentation";

const SURFACE="rounded-[1.6rem] border border-cyan-200/[.12] bg-[#0b1523]/90 shadow-[0_20px_65px_rgba(0,0,0,.18)]";
const lane:Record<string,string>={
 "mac":"M1 DEV MAC","hel1-root":"HEL1 ROOT",
 "hel1-volume-105319120":"HEL1 VOLUME","intel":"INTEL RECEIVER",
};
function metric(label:string,value:string,description:string,icon:React.ReactNode){
 return <div className="min-w-0 rounded-2xl border border-white/[.08] bg-white/[.025] p-4"
    title={description}>
   <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.17em] text-slate-400">{icon}{label}</div>
   <div className="mt-3 break-words text-2xl font-black tabular-nums text-white sm:text-3xl">{value}</div>
   <p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p>
 </div>;
}
function duration(seconds:number|null):string{
 if(seconds===null||!Number.isFinite(seconds)||seconds<0)return "MEASURING";
 if(seconds<60)return Math.ceil(seconds)+"s";
 if(seconds<3600)return Math.ceil(seconds/60)+"m";
 if(seconds<86400)return (seconds/3600).toFixed(1)+"h";
 return (seconds/86400).toFixed(1)+"d";
}
function freshness(value:string|null):string{
 if(!value)return "NO RECEIPT";
 const ms=Date.parse(value);
 return Number.isFinite(ms)?new Date(ms).toLocaleString("en-CA",{timeZone:"UTC",hour12:false})+" UTC":"INVALID";
}
function Badge({state}:{state:string}){
 const tone=state==="VERIFIED"?"border-emerald-400/25 bg-emerald-300/[.07] text-emerald-200":
 state==="ACTIVE"?"border-cyan-400/25 bg-cyan-300/[.07] text-cyan-100":
 state==="HOLD"?"border-rose-400/25 bg-rose-300/[.07] text-rose-200":
 "border-amber-300/15 bg-amber-300/[.04] text-amber-200";
 return <span className={"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-bold tracking-wider "+tone}>{state}</span>;
}
function Rail({cohort}:{cohort:TransferCohort}){
 return <ol aria-label={"Verified phase history for "+cohort.label}
  className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
  {TRANSFER_STEPS.map((step,index)=>{
   const raw=cohort.stage[step]??"UNKNOWN";
   const allowed=step==="READBACK"?cohort.receiverAuthenticated&&cohort.receiverReadbackMatched:
    step==="ISOLATED RESTORE"?cohort.independentRestore?.verified&&cohort.receiverReadbackMatched: true;
   const state=raw==="VERIFIED"&&!allowed?"HOLD":raw;
   return <li key={step} className={"min-w-0 rounded-xl border p-2.5 "+
    (state==="VERIFIED"?"border-emerald-300/25 bg-emerald-300/[.06]":
     state==="ACTIVE"?"border-cyan-300/25 bg-cyan-300/[.06]":"border-white/[.07] bg-white/[.02]")}>
    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
     {String(index+1).padStart(2,"0")}{state==="VERIFIED"?<CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-emerald-300"/>:
     <span aria-hidden className="h-2 w-2 rounded-full bg-slate-600"/>}</div>
    <div className="mt-2 min-h-8 text-[10px] font-bold leading-4 text-slate-200">{step}</div>
    <div className="mt-1 text-[9px] font-medium tracking-wider text-slate-500">{state}</div>
   </li>;
  })}
 </ol>;
}
function Plot({cohort}:{cohort:TransferCohort}){
 const samples=cohort.samples.slice(-12).filter(x=>Number.isSafeInteger(x.bytesSent)&&
  Number.isFinite(Date.parse(x.at)));
 if(samples.length<3)return <div className="flex h-24 items-center justify-center text-xs text-slate-500">Rate samples not yet available</div>;
 const first=Date.parse(samples[0].at),last=Date.parse(samples[samples.length-1].at);
 const lo=samples[0].bytesSent,hi=samples[samples.length-1].bytesSent;
 if(last<=first||hi<=lo)return <div className="flex h-24 items-center justify-center text-xs text-slate-500">Rate continuity unverified</div>;
 const line=samples.map(p=>{
  const x=12+276*(Date.parse(p.at)-first)/(last-first);
  const y=80-68*(p.bytesSent-lo)/(hi-lo);
  return x.toFixed(1)+","+y.toFixed(1);
 }).join(" ");
 return <svg viewBox="0 0 300 94" role="img" aria-label={"Measured cumulative ciphertext bytes over "+samples.length+" sender samples"}
  className="h-24 w-full text-cyan-300">
  <path d="M12 80 H288 M12 46 H288 M12 12 H288" stroke="currentColor" strokeOpacity=".11" strokeDasharray="4 6" fill="none"/>
  <polyline points={line} stroke="currentColor" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>;
}
function CargoCard({cohort,now}:{cohort:TransferCohort;now:Date}){
 const measure=measuredProgress(cohort,now);
 const rest=cohort.independentRestore?.verified===true&&cohort.receiverReadbackMatched;
 const verified=cohort.sourceHashMatched&&cohort.receiverReadbackMatched&&cohort.receiverAuthenticated;
 const clip=(value:string|null|undefined)=>value?value.slice(0,12)+"…":"—";
 return <article className={SURFACE+" min-w-0 p-4 sm:p-6"} aria-label={"Cargo "+cohort.label}>
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="flex min-w-0 items-start gap-3">
    <div className="rounded-xl border border-cyan-200/20 bg-cyan-200/[.07] p-3 text-cyan-200"><Archive className="h-6 w-6"/></div>
    <div className="min-w-0">
     <div className="text-[9px] font-black tracking-[.24em] text-cyan-200/75">CARGO / {cohort.id}</div>
     <h3 className="mt-1 break-words text-lg font-bold text-white">{cohort.label}</h3>
     <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">{lane[cohort.source]}
      <ArrowRight className="h-3 w-3 text-cyan-200"/>{lane[cohort.destination]}</div>
    </div>
   </div>
   <div className="flex items-center gap-2"><Badge state={verified?"VERIFIED":cohort.stage.TRANSFER==="ACTIVE"?"ACTIVE":"WAITING"}/>
    <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-400">L{cohort.protectedLevel}</span></div>
  </div>
  <div className="mt-5 flex items-end justify-between gap-2 text-xs text-slate-300">
   <span>Actual ciphertext progress</span><span className="font-mono tabular-nums text-white">{measure.percent===null?"—":measure.percent.toFixed(1)+"%"}</span>
  </div>
  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-700/75" role="progressbar"
   aria-label={"Verified bytes transferred for "+cohort.label}
   aria-valuemin={0} aria-valuemax={100} aria-valuenow={measure.percent===null?undefined:measure.percent}>
   <div className="h-full rounded-full bg-gradient-to-r from-cyan-700 via-cyan-400 to-emerald-300 transition-[width] motion-reduce:transition-none"
    style={{width:measure.percent===null?"0%":measure.percent+"%"}}/>
  </div>
  <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
   <span>{byteLabel(cohort.bytesSent)} transferred</span>
   <span>{byteLabel(cohort.ciphertextBytes)} ciphertext total</span>
  </div>
  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
   {metric("ORIGINAL",byteLabel(cohort.originalBytes),"Source-consistent original bytes",<Database className="h-3.5 w-3.5"/>)}
   {metric("COMPRESSED",byteLabel(cohort.compressedBytes),cohort.codec?"Measured "+cohort.codec:"Codec not reported",<Archive className="h-3.5 w-3.5"/>)}
   {metric("THROUGHPUT",measure.bytesPerSecond===null?"—":byteLabel(Math.round(measure.bytesPerSecond))+"/s","Measured rolling sender rate only",<Activity className="h-3.5 w-3.5"/>)}
   {metric("REMAINING",duration(measure.etaSeconds),"Estimate needs 3+ fresh, monotonic samples",<Timer className="h-3.5 w-3.5"/>)}
  </div>
  <div className="mt-5 border-t border-white/10 pt-4">
   <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-300">
    <span>Native evidence timeline</span><span className="text-[10px] text-slate-500">7 proofs</span>
   </div>
   <Rail cohort={cohort}/>
  </div>
  <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
   <Plot cohort={cohort}/>
   <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
    <span className="text-[11px] text-slate-300"><LockKeyhole className="mr-1 inline h-4 w-4 text-cyan-200"/>
     age: {cohort.ageRecipientFingerprint?clip(cohort.ageRecipientFingerprint):"NOT VERIFIED"}</span>
    <span className="text-[11px] text-slate-300"><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-200"/>
     Readback: {verified?"MATCHED":"UNKNOWN"}</span>
    <span className="text-[11px] text-slate-300"><HardDrive className="mr-1 inline h-4 w-4 text-amber-200"/>
     Isolated restore: {rest?"VERIFIED":"NOT PROVEN"}</span>
    <span className="text-[11px] text-slate-300">Source reclaimed: {cohort.sourceReclaim?.approvedOriginal&&rest?byteLabel(cohort.sourceReclaim.bytes):"—"}</span>
   </div>
  </div>
  <details className="mt-5 rounded-xl border border-white/[.09] bg-black/15 p-3 text-[11px] text-slate-400">
   <summary className="cursor-pointer font-bold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Receipt audit / provenance</summary>
   <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
    <div><dt>Sender sample UTC</dt><dd className="break-all font-mono">{freshness(cohort.sourceObservedAt)}</dd></div>
    <div><dt>Intel acknowledgment UTC</dt><dd className="break-all font-mono">{freshness(cohort.receiverObservedAt)}</dd></div>
    <div><dt>Source receipt SHA</dt><dd className="break-all font-mono">{clip(cohort.receiptDigest)}</dd></div>
    <div><dt>Ciphertext SHA</dt><dd className="break-all font-mono">{clip(cohort.ciphertextSha256)}</dd></div>
    <div><dt>Native receiver bytes</dt><dd className="tabular-nums">{byteLabel(cohort.bytesReadback)}</dd></div>
    <div><dt>Restore failure domain</dt><dd className="break-all">{cohort.independentRestore?.failureDomainId??"UNKNOWN"}</dd></div>
   </dl>
  </details>
 </article>;
}
export default function TransferMissionPanels({model}:{model:TransferReadModel}){
 const [expanded,setExpanded]=useState(false);
 const now=useMemo(()=>new Date(),[model]);
 const active=model.cohorts.some(c=>c.stage.TRANSFER==="ACTIVE");
 return <div className="space-y-5">
  <section className={SURFACE+" overflow-hidden p-5 sm:p-7"} aria-label="Transfer mission control">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><p className="text-[10px] font-black tracking-[.28em] text-cyan-200/75">WAROS / RECOVERY FLEET</p>
     <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Operation control</h2>
     <p className="mt-2 text-xs text-slate-400">Source-encrypted cargo. Receiver proof. Independent restore.</p></div>
    <Badge state={active?"ACTIVE":model.status==="VERIFIED"?"VERIFIED":model.status==="STALE"?"HOLD":"UNKNOWN"}/>
   </div>
   <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
    <div className="rounded-2xl border border-cyan-300/15 bg-cyan-200/[.025] p-4">
     <div className="flex items-center gap-2 text-cyan-200"><Server className="h-5 w-5"/><span className="text-[11px] font-bold tracking-widest">M1 · HEL1</span></div>
     <p className="mt-2 text-xs text-slate-400">Source snapshots · protected originals</p>
    </div>
    <div className="flex flex-col items-center gap-2 text-slate-500">
     <div className={"h-[2px] w-full max-w-24 "+(active?"bg-cyan-300":"border-t border-dashed border-slate-600")} aria-hidden/>
     <span className="text-center text-[9px] font-bold tracking-widest">{active?"RECEIPTED TRANSFER":"NO LIVE FLOW CLAIM"}</span>
    </div>
    <div className="rounded-2xl border border-emerald-300/15 bg-emerald-200/[.025] p-4">
     <div className="flex items-center gap-2 text-emerald-200"><HardDrive className="h-5 w-5"/><span className="text-[11px] font-bold tracking-widest">INTEL · CIPHERTEXT</span></div>
     <p className="mt-2 text-xs text-slate-400">Free {byteLabel(model.intelFreeBytes)} · reserve {byteLabel(model.intelReserveBytes)}</p>
    </div>
   </div>
   <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
    {metric("ARCHIVES VERIFIED",model.verifiedArchives===null?"—":String(model.verifiedArchives),"Receiver ciphertext SHA readback",<ShieldCheck className="h-4 w-4"/>)}
    {metric("SENT",byteLabel(model.transferredBytes),"Unique sender-transmitted bytes; not reclaim",<Waves className="h-4 w-4"/>)}
    {metric("READBACK",byteLabel(model.readbackBytes),"Actual Intel receiver verified bytes",<Radar className="h-4 w-4"/>)}
    {metric("RESTORES",model.independentRestores===null?"—":String(model.independentRestores),"Physically independent restores only",<CheckCircle2 className="h-4 w-4"/>)}
    {metric("RECLAIMED",byteLabel(model.reclaimedBytes),"Real source filesystem recovery; never inferred",<HardDrive className="h-4 w-4"/>)}
   </div>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/15 bg-amber-300/[.035] p-3 text-[11px] text-amber-100/80">
    <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4"/> Original evidence, L3–L5 and financial data remain protected.</span>
    <span className="font-bold tracking-wide">NO AUTOMATIC RECLAIM</span>
   </div>
  </section>
  <section aria-label="Signed cargo manifests" className="space-y-4">
   <div className="flex flex-wrap items-end justify-between gap-3">
    <div><p className="text-[10px] font-bold tracking-[.25em] text-cyan-200/70">MISSION MANIFEST</p>
     <h2 className="mt-1 text-2xl font-bold text-white">Authenticated cargo</h2></div>
    {model.campaignId?<p className="break-all font-mono text-xs text-slate-400">Campaign {model.campaignId}</p>:null}
   </div>
   {model.cohorts.length===0?
    <div className={SURFACE+" flex min-h-52 flex-col items-center justify-center px-5 py-9 text-center"} role="status">
     <LockKeyhole className="h-9 w-9 text-slate-600"/>
     <h3 className="mt-4 text-lg font-semibold text-slate-200">Awaiting authenticated sender and Intel receipts</h3>
     <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">No transfer progress, encryption result, throughput, receiver checksum or independent restore is currently verified. Host storage readings above remain separate.</p>
     <p className="mt-4 text-[11px] font-bold tracking-widest text-amber-200">NO RECEIPT IS NOT A ZERO-BYTE TRANSFER</p>
    </div>:
    <>
     {model.cohorts.slice(0,expanded?24:4).map(c=><CargoCard key={c.id} cohort={c} now={now}/>)}
     {model.cohorts.length>4?<button type="button" onClick={()=>setExpanded(v=>!v)}
      className="w-full rounded-xl border border-cyan-200/20 bg-cyan-200/[.04] px-4 py-3 text-sm font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200">
      {expanded?"Show first four cargo manifests":"Show all "+model.cohorts.length+" authenticated manifests"}
     </button>:null}
    </>}
  </section>
 </div>;
}
