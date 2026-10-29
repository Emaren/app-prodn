"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeft,RefreshCw,Copy,ShieldAlert,ExternalLink,Clock3} from "lucide-react";
type Lane={id:"D"|"G"|"C"|"E"|"F"|"B";label:string;owner:string;mission:string;issueUrl:string;
 prUrl:string|null;prHead:string|null;prBase:string|null;githubObservedAt:string|null;
 sourceAuthority:string;nextBlocker:string;gateStates:Record<string,string>;verifiedNumerator:number;denominator:number};
type Snapshot={schema:string;authority:string;generatedAt:string;
 r0:{referenceSha:string;proof:string};w1:{sourceSha:string|null;buildId:string|null;status:string};
 releaseGates:{name:string;state:string}[];lanes:Lane[];timeline:{id:string;at:string;kind:string;laneId:string;url:string;provenance:string}[];caveat:string};
const GATES=["ASSIGNED","SOURCE_REVIEWED","HEAD_CI_PASSED","MERGED","NATIVE_ACCEPTED","LIVE_VERIFIED"] as const;
const BORDERS:Record<Lane["id"],string>={D:"border-sky-400/40",G:"border-violet-400/40",
 C:"border-cyan-400/40",E:"border-amber-400/40",F:"border-emerald-400/40",B:"border-rose-400/40"};
function short(s:string|null){return s?s.slice(0,12):"UNKNOWN";}
function seen(s:string|null){if(!s)return"UNKNOWN";const d=Date.parse(s);return Number.isFinite(d)?new Date(d).toLocaleString():"UNKNOWN";}
export default function CentralCommandView(){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[copied,setCopied]=useState<string|null>(null);
 const pending=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(pending.current)return;
  const c=new AbortController();pending.current=c;setLoading(true);
  const timeout=window.setTimeout(()=>c.abort(),12000);
  try{
   const response=await fetch("/api/admin/central-command",{cache:"no-store",signal:c.signal,credentials:"same-origin"});
   if(!response.ok)throw Error("Authenticated Central Command snapshot unavailable");
   const value=await response.json() as Snapshot;
   if(value.schema!=="aoe2war.central-command.private.v1"||!Array.isArray(value.lanes)||value.lanes.length!==6)throw Error("Source schema/coverage HOLD");
   if(pending.current===c&&!c.signal.aborted){setData(value);setError(null);}
  }catch(e){if(pending.current===c){setData(null);setError(e instanceof Error?e.message:"UNKNOWN");}}
  finally{window.clearTimeout(timeout);if(pending.current===c){pending.current=null;setLoading(false);}}
 },[]);
 useEffect(()=>{void refresh();return()=>{pending.current?.abort();pending.current=null;};},[refresh]);
 async function copy(lane:Lane){
  const handoff="Resume Session "+lane.id+". Read "+lane.issueUrl+
   ". Reconcile exact GitHub head/CI and independently prove remaining gates. Preserve W1 source freeze, no host/financial mutation or new controller. Return an evidence-bound handoff to Central #934.";
  try{await navigator.clipboard.writeText(handoff);setCopied(lane.id);}
  catch{setCopied(null);}
 }
 return <main className="min-h-screen bg-[#040b17] px-4 py-8 text-white sm:px-7 xl:px-10">
  <div className="mx-auto max-w-[1600px] space-y-7">
   <header className="rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,.15),transparent_35%),linear-gradient(145deg,#111c30,#030712)] p-6 sm:p-9">
    <Link href="/admin/aoe2war-os" className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-cyan-100"><ArrowLeft className="h-4 w-4"/> AoE2WAR OS</Link>
    <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
     <div><p className="text-[11px] font-bold uppercase tracking-[.32em] text-cyan-300">Private command deck · Wave 1</p>
       <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Central Command</h1>
       <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Six engineering lanes. One source-frozen nonfinancial release. Every gate requires evidence, not confidence.</p></div>
     <div className="flex items-center gap-3"><Link href="/admin/storage-os" className="rounded-xl border border-cyan-300/20 px-4 py-2 text-sm hover:bg-white/10">Storage OS</Link>
       <button type="button" onClick={()=>void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"><RefreshCw className="h-4 w-4"/> {loading?"Reading…":"Refresh"}</button></div>
    </div>
    <p className="mt-6 text-xs text-slate-400" role="status">{data?"GitHub metadata observed: "+seen(data.generatedAt)+" · native/runtime states UNKNOWN":loading?"Reading bounded private source…":"No accepted live source"}
     {error&&<span className="ml-2 text-rose-300">{error}</span>}</p>
   </header>
   <section aria-label="W1 release gate" className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
    <div className="rounded-3xl border border-amber-400/35 bg-slate-950/80 p-6">
     <p className="text-[10px] uppercase tracking-[.25em] text-amber-300">W1 · ONE NONFINANCIAL ACTIVATION</p>
     <h2 className="mt-3 text-2xl font-extrabold">HOLD — no independently accepted activation</h2>
     <p className="mt-2 text-sm text-slate-400">Final source SHA, BUILD_ID, signed stage and owner permits are UNKNOWN until F/E prove them.</p>
     <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
      <div><dt className="text-slate-500">W1 source</dt><dd className="mt-1 font-mono">{short(data?.w1.sourceSha??null)}</dd></div>
      <div><dt className="text-slate-500">W1 BUILD_ID</dt><dd className="mt-1 font-mono">{data?.w1.buildId??"UNKNOWN"}</dd></div>
      <div className="col-span-2"><dt className="text-slate-500">Immutable R0 audit reference · not live proof</dt><dd className="mt-1 break-all font-mono text-cyan-200">{data?.r0.referenceSha??"UNKNOWN"}</dd></div>
     </dl>
    </div>
    <div className="rounded-3xl border border-white/10 bg-slate-950/75 p-6">
     <h2 className="text-lg font-bold">W1 release dependencies</h2>
     <div className="mt-4 space-y-3">{(data?.releaseGates??[]).map(g=><div key={g.name} className="flex items-start justify-between gap-3 border-b border-white/10 pb-2 text-xs">
       <span className="text-slate-300">{g.name}</span><span className="shrink-0 font-semibold text-amber-300">{g.state}</span></div>)}
      {!data&&<p className="text-xs text-slate-500">UNKNOWN — source unavailable</p>}</div>
    </div>
   </section>
   <section aria-label="Six source-owned engineering lanes">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-extrabold">Six-lane acceptance</h2><span className="text-xs text-slate-400">Gate numerator / denominator. Not a productivity score.</span></div>
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{(data?.lanes??[]).map(lane=>
     <article key={lane.id} className={"min-w-0 rounded-3xl border bg-slate-950/80 p-5 sm:p-6 "+BORDERS[lane.id]}>
      <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] uppercase tracking-[.2em] text-slate-500">{lane.owner} · {lane.id}</span>
       <h3 className="mt-1 text-xl font-bold">{lane.label}</h3></div>
       <ShieldAlert className="h-5 w-5 shrink-0 text-amber-300" aria-label="Runtime not accepted"/></div>
      <p className="mt-3 min-h-12 text-xs leading-5 text-slate-400">{lane.mission}</p>
      <div className="mt-5 flex items-baseline justify-between text-xs"><span>Evidence gates</span><span className="font-mono">{lane.verifiedNumerator}/{lane.denominator} · assigned only</span></div>
      <div role="progressbar" aria-label={lane.label+" independently evidenced gates"} aria-valuemin={0} aria-valuemax={6} aria-valuenow={lane.verifiedNumerator}
       className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-300" style={{width:lane.verifiedNumerator/6*100+"%"}}/></div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">{GATES.map(k=>
       <div key={k} className="flex items-center justify-between gap-2 border-b border-white/5 py-1 text-[10px]">
        <span className="text-slate-500">{k.replaceAll("_"," ")}</span>
        <span className={lane.gateStates[k]==="ASSIGNED"?"text-cyan-200":"text-amber-300"}>{lane.gateStates[k]??"UNKNOWN"}</span></div>)}</div>
      <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[.03] p-3">
       <p className="text-[10px] font-bold uppercase text-amber-200">Unresolved blocker</p>
       <p className="mt-1 text-xs leading-5 text-slate-300">{lane.nextBlocker}</p></div>
      <div className="mt-4 text-[11px] text-slate-400"><Clock3 className="mr-1 inline h-3 w-3"/> GitHub issue observed: {seen(lane.githubObservedAt)}</div>
      <div className="mt-2 text-[11px] text-slate-400">PR source head <span className="font-mono text-slate-200">{short(lane.prHead)}</span> · base <span className="font-mono">{short(lane.prBase)}</span></div>
      <div className="mt-1 text-[10px] text-slate-500">{lane.sourceAuthority} · no host/production attestation</div>
      <div className="mt-5 flex flex-wrap gap-2">
       <a href={lane.issueUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10">Issue <ExternalLink className="h-3 w-3"/></a>
       {lane.prUrl&&<a href={lane.prUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10">PR</a>}
       {lane.prUrl&&<a href={lane.prUrl+"/checks"} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10">CI checks</a>}
       <button type="button" onClick={()=>void copy(lane)} className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/25 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-300/10 focus-visible:outline-2 focus-visible:outline-white"><Copy className="h-3 w-3"/>{copied===lane.id?"Copied":"Copy handoff"}</button>
      </div>
     </article>)}
     {!data&&<p className="col-span-full rounded-2xl border border-dashed border-white/20 p-6 text-sm text-slate-400">All six lanes UNKNOWN while the admin snapshot is unavailable. No prior green result retained.</p>}
    </div>
   </section>
   <section aria-label="Bounded GitHub evidence timeline" className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 sm:p-7">
    <h2 className="text-xl font-bold">Observed source timeline</h2>
    <p className="mt-2 text-xs text-slate-500">GitHub issue/PR last-updated clocks only. NOT native runs, actual handoff delivery, CI outcomes or deployment events.</p>
    <div className="mt-4 grid gap-2 md:grid-cols-2">{(data?.timeline??[]).map(e=>
     <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 p-3 text-xs hover:border-cyan-300/30">
      <span className="font-semibold text-cyan-200">{e.laneId} · {e.kind}</span>
      <span className="ml-2 text-slate-400">{seen(e.at)}</span>
      <span className="mt-1 block text-[10px] text-slate-500">{e.provenance}</span>
     </a>)}
     {(!data||data.timeline.length===0)&&<p className="text-xs text-slate-500">No independently observed GitHub metadata; timeline UNKNOWN</p>}
    </div>
   </section>
   <footer className="border-t border-white/10 pt-5 text-xs leading-6 text-slate-500">
    {data?.caveat??"No authenticated current source"} Manual GitHub refresh only. No session-tab orchestration, automatic deletion, deploy, signer, scheduler or financial control. <a href="https://github.com/Emaren/app-prodn/issues/934" target="_blank" rel="noopener noreferrer" className="ml-1 text-cyan-200 underline">Central dispatch</a>
   </footer>
  </div>
 </main>;
}
