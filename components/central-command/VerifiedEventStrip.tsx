"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {Activity,GitCommit,GitMerge,GitPullRequest,ShieldCheck,AlertTriangle,RefreshCw} from "lucide-react";
export type EvidenceEvent={id:string;kind:string;laneId:string|null;at:string;repo:string;sourceUrl:string;sha:string|null;state:string|null;authority:string};
export type EvidenceFeed={schema:string;status:"FRESH"|"PARTIAL"|"STALE"|"UNKNOWN";observedAt:string|null;readAt:string;sourceCoverage:{accepted:number;expected:number};history:string;events:EvidenceEvent[]};
const SYMBOLS:Record<string,typeof Activity>={SOURCE_COMMIT_OBSERVED:GitCommit,MERGE_ACCEPTED:GitMerge,PR_OPENED:GitPullRequest,PR_UPDATED:GitPullRequest,HEAD_CI_CONCLUDED:ShieldCheck};
const stamp=(s:string)=>{const d=Date.parse(s);return Number.isFinite(d)?new Date(d).toLocaleString():"UNKNOWN"};
export function useCentralEvidence(){
 const [data,setData]=useState<EvidenceFeed|null>(null),[error,setError]=useState<string|null>(null);
 const pending=useRef<AbortController|null>(null),seen=useRef(new Set<string>());
 const refresh=useCallback(async()=>{
  if(pending.current)return;
  const c=new AbortController();pending.current=c;const t=window.setTimeout(()=>c.abort(),11000);
  try{
   const response=await fetch("/api/admin/central-command/events",{cache:"no-store",credentials:"same-origin",signal:c.signal});
   if(!response.ok)throw Error("Private source feed unavailable");
   const raw:EvidenceFeed=await response.json();
   if(raw.schema!=="aoe2war.central-source-events.v1"||!Array.isArray(raw.events)||raw.events.length>60)throw Error("Source schema HOLD");
   if(pending.current===c&&!c.signal.aborted){
    setData(raw);setError(null);
    // Only authentic unseen GitHub event IDs may pulse, never a repeating timer.
    for(const item of raw.events)seen.current.add(item.id);
   }
  }catch(e){if(pending.current===c){setError(e instanceof Error?e.message:"Source UNKNOWN");setData(null);}}
  finally{window.clearTimeout(t);if(pending.current===c)pending.current=null;}
 },[]);
 useEffect(()=>{void refresh();
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh()};
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},75_000);
  document.addEventListener("visibilitychange",onVisible);
  return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);pending.current?.abort();pending.current=null};
 },[refresh]);
 return{data,error,refresh};
}
export default function VerifiedEventStrip(){
 const {data,error,refresh}=useCentralEvidence();
 const events=data?.events.slice(0,9)??[];
 return <section aria-label="Verified GitHub activity" className="relative overflow-hidden rounded-[1.7rem] border border-cyan-300/20 bg-[radial-gradient(ellipse_at_90%_0%,rgba(56,189,248,.13),transparent_55%),linear-gradient(130deg,#101c31,#060b17)] p-5 sm:p-7">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex items-center gap-3"><span className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-cyan-200"><Activity size={21}/></span><div><p className="text-[10px] uppercase tracking-[.3em] text-cyan-300">Q09 · Evidence wire</p><h2 className="text-xl font-bold text-white">Verified source activity</h2></div></div>
   <div className="flex items-center gap-2"><span className={"rounded-full border px-3 py-1 text-[10px] font-bold tracking-widest "+(data?.status==="FRESH"?"border-emerald-300/30 text-emerald-300":"border-amber-300/30 text-amber-200")}>{data?.status??"UNKNOWN"}</span>
    <button type="button" onClick={()=>void refresh()} className="rounded-xl border border-white/15 p-2 text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white" aria-label="Reload verified GitHub events"><RefreshCw size={16}/></button>
    <Link className="rounded-xl border border-cyan-200/20 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-200/10" href="/admin/central-command/job-board">Job Exchange</Link></div>
  </div>
  <p className="mt-3 text-xs text-slate-400" role="status">{error??(data?"GitHub endpoints "+data.sourceCoverage.accepted+"/"+data.sourceCoverage.expected+" · read "+stamp(data.readAt)+" · bounded history, not deployment proof":"Reading private GitHub sources…")}</p>
  <div className="mt-5 grid gap-2 lg:grid-cols-3">
   {events.map(e=>{const Icon=SYMBOLS[e.kind]??Activity;return <a key={e.id} href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 items-start gap-3 rounded-xl border border-white/10 bg-white/[.025] p-3 hover:border-cyan-300/40 focus-visible:outline-2 focus-visible:outline-white">
    <Icon aria-hidden="true" size={16} className="mt-1 shrink-0 text-cyan-300"/><div className="min-w-0"><p className="text-[11px] font-semibold text-slate-100">{e.kind.replaceAll("_"," ")} <span className="text-cyan-300">{e.laneId??"SOURCE"}</span></p><p className="truncate font-mono text-[10px] text-slate-400">{e.sha?.slice(0,12)??e.repo} · {e.state??"SOURCE"}</p><p className="text-[10px] text-slate-500">{stamp(e.at)}</p></div></a>})}
   {!events.length&&<div className="col-span-full flex items-center gap-3 rounded-xl border border-amber-300/15 p-5 text-sm text-slate-300"><AlertTriangle size={16} className="text-amber-300"/>No source events verified. UNKNOWN is not inactivity.</div>}
  </div><p className="mt-3 text-[10px] text-slate-500">GitHub-sourced, latest bounded window. A dispatch comment does not wake an AI; source CI never certifies a deployed BUILD_ID.</p>
 </section>;
}
