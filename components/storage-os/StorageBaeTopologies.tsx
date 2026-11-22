"use client";

/** Presentation of the same read-only evidence adapter used by Basic.
 * All topological edges represent source-owned potential paths, never motion.
 * No network requests, writable actions or synthesized transport telemetry. */
import {useState} from "react";
import {Archive,ArrowRight,Clock3,Database,HardDrive,Laptop2,LockKeyhole,Server,ShieldCheck} from "lucide-react";
import type {IntelColdView} from "@/lib/intelColdStorageEvidence";
import {TRANSPORT_LANES,TRANSPORT_STEPS} from "./StorageTransportLaneStatus";
import {verifiedFrames,type BaeNode} from "./storageBaeEvidence";

type PlaneId=BaeNode["id"];
const time=(s:string|null)=>{
  if(!s)return "UNKNOWN";
  const d=new Date(s);
  return Number.isFinite(d.getTime())?d.toISOString().replace("T"," · ").replace(/\.\d{3}Z$/," UTC"):"UNKNOWN";
};
const label=(n:BaeNode)=>n.status==="PASS"?"PASS · observation":
  n.status==="STALE"?"STALE · no live admission":n.status==="HOLD"?"HOLD · partial evidence":"UNKNOWN · not admitted";
function StatusTag({node}:{node:BaeNode}){
  return <span className={"rounded-full border px-2.5 py-1 text-[10px] font-black "+
    (node.status==="PASS"?"border-emerald-300/30 text-emerald-200":
      node.status==="STALE"?"border-orange-300/30 text-orange-200":
      "border-amber-300/25 text-amber-100")}>{label(node)}</span>;
}
function SelectedSurface({node,onInspect}:{node:BaeNode;onInspect:(id:PlaneId)=>void}){
  return <section className="rounded-2xl border border-cyan-300/20 bg-[#0b1927] p-5" aria-label="Selected storage surface evidence">
    <p className="text-[10px] font-black tracking-[.19em] text-cyan-200">SURFACE INTELLIGENCE · SELECTED</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-black text-white">{node.name}</h3>
      <StatusTag node={node}/>
    </div>
    <dl className="mt-4 grid gap-x-4 gap-y-3 text-xs text-slate-200 sm:grid-cols-2">
      <div><dt className="text-slate-300">Source binding</dt><dd className="mt-1 font-semibold">{node.sourceTrust}</dd></div>
      <div><dt className="text-slate-300">Observation age</dt><dd className="mt-1 font-semibold">{node.ageLabel}</dd></div>
      <div><dt className="text-slate-300">Gross hog census</dt><dd className="mt-1 font-semibold">{node.inventoryStatus==="NOT SCANNED"?"NOT SCANNED FOR HOGS":node.inventoryStatus}</dd></div>
      <div><dt className="text-slate-300">Certified capacity</dt><dd className="mt-1 font-semibold">{node.capacityEvidence}</dd></div>
      <div><dt className="text-slate-300">Durable transport ACK</dt><dd className="mt-1 font-semibold">UNKNOWN IN THIS CONTRACT</dd></div>
      <div><dt className="text-slate-300">Unique recoverable bytes</dt><dd className="mt-1 font-semibold text-amber-100">UNKNOWN · NOT AUTHORIZED</dd></div>
    </dl>
    <p className="mt-3 break-all text-[11px] leading-5 text-slate-300">Source observed: {time(node.observedAt)}</p>
    <button type="button" onClick={()=>onInspect(node.id)}
      className="mt-4 min-h-10 rounded-xl border border-cyan-300/40 px-4 text-xs font-bold text-cyan-100 hover:bg-cyan-300/10 focus-visible:outline-2 focus-visible:outline-cyan-200">
      Inspect actual storage categories in Basic <ArrowRight className="ml-1 inline h-4 w-4"/>
    </button>
  </section>;
}
function SurfaceChoice({node,active,onSelect}:{node:BaeNode;active:boolean;onSelect:()=>void}){
  return <button type="button" aria-pressed={active} onClick={onSelect}
    className={"flex w-full flex-col items-start rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-200 "+
      (active?"border-cyan-300/50 bg-cyan-300/10":"border-white/15 bg-white/[.03] hover:border-cyan-300/30")}>
    <span className="text-xs font-black text-slate-100">{node.name}</span>
    <span className="mt-1 text-[11px] text-slate-300">{node.ageLabel} · {node.capacityEvidence}</span>
    <span className="mt-2"><StatusTag node={node}/></span>
    {node.inventoryStatus==="NOT SCANNED"?<strong className="mt-2 text-[10px] text-amber-100">HOG CENSUS · NOT SCANNED</strong>:null}
  </button>;
}
/**
 * Advanced is an inspectable dependency map: three physical computers,
 * HEL1's two separately observed filesystems, and a selectable controller
 * relationship. It is NOT a clone of the Basic cards or Extreme diagram.
 */
export function AdvancedTopology({nodes,onInspect}:{
  nodes:BaeNode[];onInspect:(id:PlaneId)=>void;
}){
  const [selected,setSelected]=useState<PlaneId>("hel1-root");
  const [laneId,setLaneId]=useState<string>(TRANSPORT_LANES[0].id);
  const node=(id:PlaneId)=>nodes.find(n=>n.id===id)!;
  const focused=node(selected);
  const lane=TRANSPORT_LANES.find(l=>l.id===laneId)??TRANSPORT_LANES[0];
  return <div className="space-y-4">
    <section aria-label="Advanced topology by physical machine"
      className="rounded-[26px] border border-white/15 bg-[#071624] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200">ADVANCED / HOST DEPENDENCIES</p>
          <h2 className="mt-2 text-xl font-black text-white">Three computers · four measured surfaces</h2></div>
        <span className="rounded-full border border-amber-300/25 px-3 py-2 text-[10px] font-bold text-amber-100">FIVE LANES · ALL TRANSITION GATES NOT ADMITTED</span>
      </div>
      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-[22px] border border-cyan-300/20 bg-[#0b1c2c] p-4">
          <h3 className="flex items-center gap-2 text-base font-black text-white"><Laptop2 className="h-5 w-5 text-cyan-200"/> M1 / Development</h3>
          <p className="mt-1 text-xs text-slate-300">Operator origin, builds and source manifests</p>
          <div className="mt-4"><SurfaceChoice node={node("mac")} active={selected==="mac"} onSelect={()=>setSelected("mac")}/></div>
          <p className="mt-4 text-[11px] leading-5 text-slate-300">Controller-to-server connection is not file-copy authority.</p>
        </div>
        <div className="min-w-0 rounded-[22px] border border-cyan-300/30 bg-[#10243a] p-4">
          <h3 className="flex items-center gap-2 text-base font-black text-white"><Server className="h-5 w-5 text-cyan-200"/> HEL1 / Production server</h3>
          <p className="mt-1 text-xs text-slate-300">ONE computer, TWO independently signed filesystem surfaces</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SurfaceChoice node={node("hel1-root")} active={selected==="hel1-root"} onSelect={()=>setSelected("hel1-root")}/>
            <SurfaceChoice node={node("hel1-volume-105319120")} active={selected==="hel1-volume-105319120"}
              onSelect={()=>setSelected("hel1-volume-105319120")}/>
          </div>
          <p className="mt-3 border-l-2 border-cyan-300/30 pl-3 text-[11px] leading-5 text-slate-300">
            Root ↔ attached data is a same-host dependency, not a verified cross-device transfer.
          </p>
        </div>
        <div className="min-w-0 rounded-[22px] border border-emerald-300/25 bg-[#0d2228] p-4">
          <h3 className="flex items-center gap-2 text-base font-black text-white"><Archive className="h-5 w-5 text-emerald-200"/> Intel / Cold vault</h3>
          <p className="mt-1 text-xs text-slate-300">Distinct source admission, independent encrypted archive custody</p>
          <div className="mt-4"><SurfaceChoice node={node("intel")} active={selected==="intel"} onSelect={()=>setSelected("intel")}/></div>
          <p className="mt-4 text-[11px] leading-5 text-amber-100">Destination admission remains independent of the M1 ↔ HEL1 Bridge.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <SelectedSurface node={focused} onInspect={onInspect}/>
        <section className="rounded-2xl border border-white/15 bg-[#0c1a2a] p-5" aria-label="Selected relationship evidence">
          <p className="text-[10px] font-black tracking-[.19em] text-cyan-200">TRANSPORT OS / RELATIONSHIP INSPECTOR</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Select one of five transport lanes">
            {TRANSPORT_LANES.map((l,i)=><button key={l.id} type="button" aria-pressed={laneId===l.id} onClick={()=>setLaneId(l.id)}
              className={"min-h-9 rounded-xl border px-3 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-cyan-200 "+
                (laneId===l.id?"border-cyan-300/50 bg-cyan-300/10 text-white":"border-white/15 text-slate-200 hover:bg-white/10")}>
              Lane {i+1}
            </button>)}
          </div>
          <h3 className="mt-4 text-base font-bold text-white">{lane.title}</h3>
          <div className="mt-3 grid gap-2 text-xs text-slate-200">
            <p><strong className="text-cyan-200">Source class:</strong> {lane.source}</p>
            <p><strong className="text-cyan-200">Destination class:</strong> {lane.destination}</p>
            <p><strong className="text-cyan-200">Responsible controller:</strong> {lane.controller}</p>
            <p className="rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-3 leading-5 text-amber-100">
              NOT ADMITTED · {lane.hold}
            </p>
          </div>
        </section>
      </div>
    </section>
    <section aria-label="Selected lane seven-stage evidence chain"
      className="rounded-[24px] border border-white/15 bg-[#081728] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">Seven independent admission gates</h2>
        <span className="text-[10px] font-bold text-amber-100">UNVERIFIED TRANSITIONS REMAIN BLOCKED</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {TRANSPORT_STEPS.map((step,i)=><article key={step.name}
          className="min-w-0 rounded-xl border border-white/10 bg-white/[.025] p-3">
          <p className="text-[10px] font-bold text-cyan-200">{String(i+1).padStart(2,"0")} / 07 · NOT ADMITTED</p>
          <h3 className="mt-2 text-xs font-black text-white">{step.name}</h3>
          <p className="mt-2 text-[11px] leading-5 text-slate-300">{step.proof}</p>
        </article>)}
      </div>
    </section>
  </div>;
}

function ExtremeHost({node,kind}:{node:BaeNode;kind:"m1"|"intel"|"root"|"volume"}){
  const Icon=kind==="m1"?Laptop2:kind==="intel"?Archive:kind==="root"?Server:Database;
  const isIntel=kind==="intel";
  return <div className={"min-w-0 rounded-[23px] border p-4 backdrop-blur-[3px] "+
    (isIntel?"border-emerald-300/35 bg-[#09202b]/95 shadow-[inset_0_0_28px_rgba(52,211,153,.065)]":
      "border-cyan-300/25 bg-[#071b2e]/95")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-cyan-100"><Icon className="h-5 w-5"/>
        <span className="text-xs font-black uppercase tracking-wide">{isIntel?"COLD VAULT":kind==="m1"?"DEVELOPMENT":kind==="root"?"ROOT / SYSTEM":"MOUNTED / DATA"}</span></div>
      <StatusTag node={node}/>
    </div>
    <p className="mt-3 text-sm font-bold text-white">{node.name}</p>
    <p className="mt-1 text-[11px] text-slate-300">{node.role}</p>
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px]">
      <div><span className="block text-slate-300">Observed</span><strong className="mt-1 block text-white">{node.ageLabel}</strong></div>
      <div><span className="block text-slate-300">Trust</span><strong className="mt-1 block text-white">{node.status}</strong></div>
    </div>
    <p className="mt-3 text-[11px] font-semibold text-amber-100">
      {node.inventoryStatus==="NOT SCANNED"?"HOG ALLOCATIONS · NOT SCANNED":isIntel?"INDEPENDENT INTEL SIGNING":node.inventoryStatus}
    </p>
  </div>;
}

/** No SVG animation when there is no authenticated live transport event. */
export function ExtremeTopology({nodes}:{nodes:BaeNode[]}){
  const node=(id:PlaneId)=>nodes.find(n=>n.id===id)!;
  return <section aria-label="Extreme three-computer spatial command deck"
    className="relative w-full min-w-0 overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[#020d1d] p-3 sm:p-6 lg:p-8">
    <div className="pointer-events-none absolute inset-0 opacity-45" aria-hidden="true"
      style={{backgroundImage:"linear-gradient(rgba(34,211,238,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.055) 1px,transparent 1px)",backgroundSize:"36px 36px"}}/>
    <div className="relative flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.23em] text-cyan-300">EXTREME / COMMAND DECK / SPATIAL ROUTING</p>
        <h2 className="mt-2 text-xl font-black text-white sm:text-3xl">Fleet signal architecture</h2></div>
      <span className="rounded-full border border-amber-300/25 px-3 py-2 text-[10px] font-black text-amber-100">
        <LockKeyhole className="mr-1 inline h-3 w-3"/> LIVE TRANSFER: NOT ADMITTED
      </span>
    </div>
    <div className="relative mt-6">
      <svg viewBox="0 0 1200 450" className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
        role="img" aria-label="Five static, blocked potential transfer routes; no active movement">
        <defs><linearGradient id="bae-static-transport" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0e7490"/><stop offset="100%" stopColor="#34d399"/></linearGradient></defs>
        <path d="M 200 135 Q 350 80 535 130" fill="none" stroke="url(#bae-static-transport)" strokeWidth="2" strokeDasharray="6 12" opacity=".5"/>
        <path d="M 250 240 Q 600 5 1000 175" fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="5 16" opacity=".32"/>
        <path d="M 690 255 Q 870 340 975 200" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="5 16" opacity=".34"/>
        <path d="M 620 150 L 620 330" fill="none" stroke="#67e8f9" strokeWidth="3" strokeDasharray="3 12" opacity=".42"/>
        <path d="M 690 155 Q 855 110 990 110" fill="none" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="3 15" opacity=".4"/>
      </svg>
      <div className="relative grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1.2fr)] lg:gap-[4%]">
        <div className="min-w-0 self-center">
          <div className="mb-3 text-center text-[10px] font-black tracking-[.18em] text-cyan-200">HOST 01 / SOURCE / M1</div>
          <ExtremeHost node={node("mac")} kind="m1"/>
          <p className="mt-4 text-center text-[11px] text-slate-300">Operator relationship · not file transfer</p>
        </div>
        <div className="min-w-0">
          <div className="mb-3 text-center text-[10px] font-black tracking-[.18em] text-cyan-200">HOST 02 / HEL1 / TWO FILESYSTEMS</div>
          <div className="min-w-0 space-y-3 rounded-[28px] border border-cyan-300/20 bg-cyan-300/[.035] p-3 sm:p-4">
            <ExtremeHost node={node("hel1-root")} kind="root"/>
            <div className="flex items-center justify-center gap-2 text-[10px] font-black tracking-[.14em] text-cyan-200">
              <HardDrive className="h-4 w-4"/> SAME PHYSICAL SERVER / DIFFERENT MOUNTS
            </div>
            <ExtremeHost node={node("hel1-volume-105319120")} kind="volume"/>
          </div>
        </div>
        <div className="min-w-0 self-center">
          <div className="mb-3 text-center text-[10px] font-black tracking-[.18em] text-emerald-200">HOST 03 / ENCRYPTED DESTINATION</div>
          <div className="rounded-[28px] border border-emerald-300/30 bg-emerald-300/[.035] p-3 sm:p-4">
            <ExtremeHost node={node("intel")} kind="intel"/>
            <div className="mt-3 rounded-xl border border-emerald-300/15 p-3 text-[11px] leading-5 text-slate-200">
              <ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-200"/>
              Cold storage is signed independently. Actual archive admission and durable transfer receipts are separate gates.
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="relative mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/10 bg-black/20 p-4 text-[11px]">
      <span className="font-black text-amber-100">STATIC ROUTE TRACE · BLOCKED</span>
      <span className="text-slate-200">Five documented relationships · no current source-to-destination transition proven</span>
      <span className="text-slate-200">Real signal pulses: disabled until source-authorized activity exists</span>
    </div>
  </section>;
}

/**
 * The time scrubber travels only over signed historical observations and
 * independently admitted Intel receipt timestamps. Nothing is inferred
 * between frames. It never draws a live trajectory.
 */
export function ExtremeEvidenceTimeline({nodes,intel}:{nodes:BaeNode[];intel:IntelColdView|null}){
  const [cursor,setCursor]=useState(0);
  const frames=verifiedFrames(nodes,intel);
  const selected=frames[Math.min(cursor,Math.max(0,frames.length-1))];
  return <section aria-label="Authenticated evidence history time scrubber"
    className="rounded-[24px] border border-white/15 bg-[#071a2a] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-[10px] font-black tracking-[.2em] text-cyan-200">EXTREME / VERIFIED HISTORY</p>
        <h2 className="mt-2 text-lg font-black text-white">Historical evidence time scrubber</h2></div>
      <span className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-bold text-slate-200">
        {frames.length} admitted dated frame{frames.length===1?"":"s"}
      </span>
    </div>
    <div className="mt-4 flex items-center gap-3">
      <Clock3 className="h-5 w-5 shrink-0 text-cyan-200"/>
      <div className="min-w-0 flex-1">
        <label htmlFor="bae-evidence-scrub" className="text-[11px] font-semibold text-slate-200">
          Read historical receipt {frames.length?" · most recent to oldest":" · none admitted"}
        </label>
        <input id="bae-evidence-scrub" type="range" min={0} max={Math.max(0,frames.length-1)}
          value={Math.min(cursor,Math.max(0,frames.length-1))} disabled={frames.length===0}
          onChange={e=>setCursor(Number(e.currentTarget.value))}
          className="mt-3 w-full cursor-pointer accent-cyan-300 disabled:cursor-not-allowed"
          aria-valuetext={selected?time(selected.at)+" · "+selected.kind:"No admitted dated evidence"}/>
        <div className="flex justify-between text-[10px] text-slate-300"><span>Most recent admitted</span><span>Older admitted</span></div>
      </div>
    </div>
    <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-cyan-300/15 bg-[#03111f] p-4">
      {selected?<><p className="text-[10px] font-black uppercase tracking-[.17em] text-cyan-200">{selected.kind} · {selected.source}</p>
        <p className="mt-2 text-sm font-bold text-white">{time(selected.at)}</p>
        <p className="mt-2 text-xs leading-5 text-slate-200">{selected.detail}</p></>:
        <p className="text-sm leading-6 text-amber-100">NO VERIFIED HISTORICAL FRAMES. No simulated transfer timeline is generated.</p>}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-300">
      This is dated evidence inspection, not an interpolation of file movement or proof that a lane is presently active.
    </p>
  </section>;
}
