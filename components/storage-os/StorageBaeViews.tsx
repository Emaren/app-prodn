"use client";

import Link from "next/link";
import {Activity,ArrowLeft,ArrowUpRight,Archive,Clock3,Database,HardDrive,Laptop2,LockKeyhole,RefreshCw,Server,ShieldAlert,ShieldCheck} from "lucide-react";
import type {StorageCommandCenter} from "@/lib/storageCommandCenterProjection";
import type {IntelColdView} from "@/lib/intelColdStorageEvidence";
import {TRANSPORT_LANES,TRANSPORT_STEPS} from "./StorageTransportLaneStatus";
import {baeNodes,baeRecentObservations,type BaeMode,type BaeNode} from "./storageBaeEvidence";
import {signedHogInventory} from "@/lib/storageSignedFreshness";

export function BaeModeSwitch({mode,onChange}:{mode:BaeMode;onChange:(mode:BaeMode)=>void}){
  return <div role="group" aria-label="Storage Explorer BAE view mode"
    className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/15 bg-[#101b2c]/90 p-1">
    {(["B","A","E"] as const).map(m=><button key={m} type="button"
      aria-label={m==="B"?"Basic view":m==="A"?"Atlas topology view":"Extreme network view"}
      aria-pressed={mode===m} title={m==="B"?"Basic":m==="A"?"Atlas":"Extreme"} onClick={()=>onChange(m)}
      className={"min-h-8 min-w-8 rounded-full px-2.5 text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 "+
        (mode===m?"bg-cyan-300 text-slate-950":"text-slate-400 hover:bg-white/10 hover:text-white")}>
      {m}
    </button>)}
  </div>;
}
const fmt=(n:number|null)=>{
  if(n===null||!Number.isFinite(n)||n<0)return "UNKNOWN";
  return n>=1024**3?(n/1024**3).toFixed(2)+" GiB":
    n>=1024**2?(n/1024**2).toFixed(1)+" MiB":
    n>=1024?(n/1024).toFixed(1)+" KiB":n+" B";
};
function NodeGlyph({id}:{id:BaeNode["id"]}){
  if(id==="mac")return <Laptop2 className="h-5 w-5"/>;
  if(id==="hel1-root")return <Server className="h-5 w-5"/>;
  if(id==="hel1-volume-105319120")return <Database className="h-5 w-5"/>;
  return <Archive className="h-5 w-5"/>;
}
function Chip({value}:{value:string}){
  return <span className={"inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide "+
    (value==="PASS"?"border-emerald-300/35 bg-emerald-300/10 text-emerald-200":
      value==="STALE"?"border-orange-300/30 bg-orange-300/10 text-orange-200":
      "border-amber-300/25 bg-amber-300/[.06] text-amber-100")}>{value}</span>;
}
function DevicePanel({node,extreme,onInspect}:{node:BaeNode;extreme:boolean;onInspect:(id:BaeNode["id"])=>void}){
  const current=node.status==="PASS";
  return <article aria-label={node.name+" authenticated status"}
    className={"relative h-full overflow-hidden rounded-[22px] border p-4 sm:p-5 "+
      (current?"border-emerald-300/35 bg-[#071d27]/95":"border-white/15 bg-[#0a1424]/95")+
      (extreme?" shadow-[0_0_48px_rgba(34,211,238,.045)]":"")}>
    {current&&extreme?<span className="bae-status-glow pointer-events-none absolute right-2 top-2 h-12 w-12 rounded-full border border-emerald-300/25" aria-hidden="true"/>:null}
    <div className="relative flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-cyan-200"><NodeGlyph id={node.id}/><span className="text-[10px] font-black uppercase tracking-[.14em]">{node.id==="mac"?"M1":node.id==="intel"?"INTEL":node.id==="hel1-root"?"HEL1 ROOT":"HEL1 DATA"}</span></div>
      <Chip value={node.status}/>
    </div>
    <h3 className="relative mt-3 text-base font-bold text-white sm:text-lg">{node.name}</h3>
    <p className="mt-1 text-[11px] leading-5 text-slate-400">{node.role}</p>
    <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
      <div><div className="text-slate-500">Source trust</div><div className="mt-0.5 font-semibold leading-4 text-slate-200">{node.sourceTrust}</div></div>
      <div><div className="text-slate-500">Latest observation</div><div className="mt-0.5 font-semibold text-slate-200">{node.ageLabel}</div></div>
      <div><div className="text-slate-500">Available · {node.capacityEvidence}</div><div className="mt-0.5 font-mono font-bold text-slate-100">{fmt(node.availableBytes)}</div></div>
      <div><div className="text-slate-500">Gross sampled categories</div><div className="mt-0.5 font-mono font-bold text-slate-100">{node.grossCategoryCount??"UNKNOWN"}</div></div>
    </div>
    <div className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-5 text-slate-400">
      <p>Gross reported allocation: {fmt(node.grossReportedBytes)} · overlapping, not unique</p>
      <p>Source signer at read: {node.sourceHmacAtRead}</p>
      <p>Last durable ACK: {node.durableAck}</p>
      <p>Unique recoverable: <strong className="text-amber-100">UNKNOWN</strong></p>
    </div>
    <button type="button" onClick={()=>onInspect(node.id)}
      className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-cyan-300/25 px-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-300/10 focus-visible:outline-2 focus-visible:outline-cyan-200">
      Inspect in Basic <ArrowUpRight className="h-3.5 w-3.5"/>
    </button>
  </article>;
}
function Topology({nodes,extreme,onInspect}:{nodes:BaeNode[];extreme:boolean;onInspect:(id:BaeNode["id"])=>void}){
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const ids=["mac","hel1-root","intel","hel1-volume-105319120"] as const;
  const paths=[
    {d:"M 320 160 L 680 160",id:"m1-to-hel1-operator"},
    {d:"M 210 265 L 210 405",id:"m1-to-intel-factory-v2"},
    {d:"M 730 240 Q 530 333 285 421",id:"hel1-to-intel-old-recovery"},
    {d:"M 790 265 L 790 405",id:"hel1-local-root-volume"},
    {d:"M 705 235 Q 500 281 300 414",id:"hel1-direct-intel"},
  ] as const;
  return <section aria-label="Four-machine storage topology"
    className={"relative overflow-hidden rounded-[30px] border border-white/10 "+
      (extreme?"bg-[#030b17] shadow-[inset_0_0_100px_rgba(8,145,178,.055)]":"bg-[#091525]")}>
    <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true"
      style={{backgroundImage:"linear-gradient(rgba(90,148,170,.07) 1px, transparent 1px),linear-gradient(90deg,rgba(90,148,170,.07) 1px,transparent 1px)",backgroundSize:"30px 30px"}}/>
    <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-7 sm:pt-6">
      <p className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-200">Four hardware nodes / five bounded relationships</p>
      <p className="text-[10px] font-bold text-amber-200">TRANSPORT MOVEMENT: NOT ADMITTED</p>
    </div>
    <div className="relative grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
      {ids.map(id=><DevicePanel key={id} node={byId.get(id)!} extreme={extreme} onInspect={onInspect}/>)}
    </div>
    <div className="relative hidden h-[820px] lg:block xl:h-[720px]">
      <svg viewBox="0 0 1000 630" className="absolute inset-0 h-full w-full" preserveAspectRatio="none"
        role="img" aria-label="Read-only topology connecting M1, HEL1 root, HEL1 volume, and Intel. All transports not admitted.">
        {paths.map((t,i)=><path key={t.id} d={t.d} fill="none" stroke={i===4?"#fb923c":"#22d3ee"}
          strokeOpacity={i===4?0.25:0.34} strokeWidth={i===4?1.5:2} strokeDasharray={i===4?"3 15":"5 12"}
          className={extreme?"bae-illustrative-trace":""}/>)}
        {[["M1 ↔ HEL1",500,147],["M1 → INTEL",218,338],["HEL1 ↔ DATA",790,338],["HISTORICAL RECOVERY",515,362]].map(([label,x,y])=>
          <text key={String(label)} x={Number(x)} y={Number(y)} textAnchor="middle"
            fill="#a6c6d2" opacity=".85" fontSize="11" fontWeight="700" letterSpacing="1">{label}</text>)}
      </svg>
      {ids.map((id,i)=><div key={id} className={"absolute w-[36%] "+(i%2===0?"left-[5%]":"right-[5%]")+
        (i<2?" top-[6%]":" bottom-[4%]")}>
        <DevicePanel node={byId.get(id)!} extreme={extreme} onInspect={onInspect}/>
      </div>)}
    </div>
    <p className="relative px-4 pb-5 text-center text-[11px] leading-5 text-slate-400">
      Lines indicate documented potential relationships, not transfers. Animation is decorative,
      never evidence of bytes moved, destination admission, or a retirement permit.
    </p>
  </section>;
}
function EvidenceStrip({nodes,data,intel,ledgerStatus,error,intelError,extreme}:{
  nodes:BaeNode[];data:StorageCommandCenter|null;intel:IntelColdView|null;
  ledgerStatus:string;error:string|null;intelError:string|null;extreme:boolean;
}){
  const recent=baeRecentObservations(nodes);
  const blocked=nodes.filter(n=>n.status!=="PASS");
  const restores=intel?.source==="SIGNED_PRIVATE_RECEIPT"&&intel.health==="ONLINE"&&intel.objects
    ? intel.objects.filter(o=>o.restore==="HISTORICAL_RESTORE_PROOF_PRESENT").length:null;
  const next=error?"Restore authenticated Storage OS read access before proceeding":
    recent.length===0?"Admit a fresh signed observation through the existing protected source contract":
    ledgerStatus!=="VERIFIED"?"Qualify the separate owner teaching witness before classification writes":
    "Obtain item-specific controller receipts before archive or retirement authorization";
  return <section aria-label="Evidence and blockers control strip" className={"grid gap-3 "+(extreme?"xl:grid-cols-4":"lg:grid-cols-2 xl:grid-cols-4")}>
    <div className="rounded-2xl border border-white/10 bg-[#0c1829] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-100"><Activity className="h-4 w-4"/> Recent signed observations</div>
      {recent.length?recent.slice(0,4).map(n=><p key={n.id} className="mt-2 text-[11px] text-slate-300">{n.name} · {n.ageLabel} · {n.sourceTrust}</p>):
        <p className="mt-3 text-xs text-amber-100">UNKNOWN · no current signed observation</p>}
      <p className="mt-2 text-[10px] text-slate-500">Browser polling is not a new host observation.</p>
    </div>
    <div className="rounded-2xl border border-white/10 bg-[#0c1829] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-100"><ShieldCheck className="h-4 w-4"/> Last transport ACK</div>
      <p className="mt-3 text-sm font-bold text-amber-100">UNKNOWN · NOT VERIFIED</p>
      <p className="mt-2 text-[11px] leading-5 text-slate-400">The browser contract does not certify durable receiver ACK or file transfer. Heartbeat is not ACK.</p>
      <p className="mt-2 text-[10px] text-slate-500">Historical Intel independent restore proofs: {restores??"UNKNOWN"} · not current lane authorization</p>
    </div>
    <div className="rounded-2xl border border-white/10 bg-[#0c1829] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-100"><ShieldAlert className="h-4 w-4"/> Current blockers</div>
      <p className="mt-2 text-[11px] leading-5 text-amber-100">
        {blocked.length?blocked.map(n=>n.name+" "+n.status).join(" · "):"All four observations are source-qualified"}
      </p>
      <p className="mt-2 text-[11px] leading-5 text-slate-400">Five transport lanes NOT ADMITTED · Teaching ledger: {ledgerStatus}
        {error?" · "+error:""}{intelError?" · Intel: "+intelError:""}</p>
    </div>
    <div className="rounded-2xl border border-white/10 bg-[#0c1829] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-100"><Clock3 className="h-4 w-4"/> Next exact action</div>
      <p className="mt-3 text-xs font-semibold leading-5 text-white">{next}</p>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">No archive, copy, delete or reclaim executor in this view.</p>
      <p className="mt-2 text-[10px] text-slate-500">Bridge read status: {data?.bridgeOnline===true?"ONLINE":"UNKNOWN / OFFLINE"}</p>
    </div>
  </section>;
}
export default function StorageBaeViews({mode,onModeChange,data,intel,ledgerStatus,error,intelError,onRefresh,onInspect,now,ownerBinding}:{
  mode:"A"|"E";onModeChange:(mode:BaeMode)=>void;
  data:StorageCommandCenter|null;intel:IntelColdView|null;ledgerStatus:string;error:string|null;intelError:string|null;
  onRefresh:()=>void;onInspect:(id:BaeNode["id"])=>void;now:number;ownerBinding:string|null;
}){
  const extreme=mode==="E";
  const nodes=baeNodes(data,intel,now);
  const mac=signedHogInventory(data?.visual,"mac",now);
  return <main className={"min-h-screen text-slate-100 "+(extreme?"bg-[#020816]":"bg-[#07101e]")}>
    <style>{"@keyframes bae-trace{to{stroke-dashoffset:-340}} @keyframes bae-halo{0%,100%{opacity:.25;transform:scale(.95)}50%{opacity:.65;transform:scale(1.09)}} .bae-illustrative-trace{animation:bae-trace 24s linear infinite}.bae-status-glow{animation:bae-halo 5s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.bae-illustrative-trace,.bae-status-glow{animation:none!important}}"}</style>
    <div className={"relative space-y-5 px-4 py-6 sm:px-7 lg:px-10 "+(extreme?"mx-auto w-full max-w-none":"mx-auto max-w-[1650px]")}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/admin/storage-os" className="inline-flex min-h-8 items-center gap-2 text-xs text-slate-400 hover:text-cyan-200"><ArrowLeft className="h-4 w-4"/> Storage OS command center</Link>
          <p className="mt-4 text-[10px] font-black tracking-[.24em] text-cyan-300">
            BAE / {extreme?"EXTREME":"ATLAS"} · PRIVATE READ-ONLY COMMAND VIEW</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">Storage <span className="text-cyan-200">{extreme?"Signal Room":"Atlas"}</span></h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Four machines. Five source-owned lanes. Seven independent admission gates. Node PASS means an admitted source observation, not disk health or transfer authority.</p>
        </div>
        <div className="flex items-center gap-2">
          <BaeModeSwitch mode={mode} onChange={onModeChange}/>
          <button type="button" onClick={onRefresh} aria-label="Refresh existing storage evidence" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-cyan-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-200"><RefreshCw className="h-4 w-4"/></button>
        </div>
      </header>
      <section className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-400" aria-label="Read-side trust boundaries">
        <span><HardDrive className="mr-1 inline h-3.5 w-3.5"/> Capacity: sampled bytes only</span>
        <span><ShieldCheck className="mr-1 inline h-3.5 w-3.5"/> Signing: source-specific</span>
        <span><LockKeyhole className="mr-1 inline h-3.5 w-3.5"/> Copy and retirement: NOT ADMITTED</span>
        <span>Gross category evidence: {mac.status==="PARTIAL"?"PARTIAL / GROSS":mac.status}</span>
        <span>Owner ledger: {ledgerStatus} {ownerBinding?"· enrolled":"· not owner-proven"}</span>
      </section>
      {error&&<div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-300/[.04] p-4 text-sm text-rose-200">{error} · Source data withheld instead of simulated.</div>}
      <Topology nodes={nodes} extreme={extreme} onInspect={onInspect}/>
      <EvidenceStrip nodes={nodes} data={data} intel={intel} ledgerStatus={ledgerStatus} error={error} intelError={intelError} extreme={extreme}/>
      <section aria-label="Five source-owned transport relationships" className="rounded-[26px] border border-white/10 bg-[#0a1625] p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div>
          <p className="text-[10px] font-black tracking-[.24em] text-cyan-300">TRANSPORT OS / FIVE LANES</p>
          <h2 className="mt-2 text-xl font-black text-white">Evidence before movement</h2></div>
          <span className="text-[10px] font-bold text-amber-100">NO PER-OBJECT TRANSITION RECEIPTS ADMITTED</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {TRANSPORT_LANES.map((lane,i)=><article key={lane.id} className="rounded-xl border border-white/10 bg-white/[.025] p-4">
            <p className="text-[10px] font-black text-cyan-300">LANE 0{i+1}</p>
            <h3 className="mt-2 text-xs font-bold leading-5 text-white">{lane.title}</h3>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">{lane.source} → {lane.destination}</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-300">{lane.controller}</p>
            <div className="mt-3"><Chip value="NOT ADMITTED"/></div>
          </article>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {TRANSPORT_STEPS.map((s,i)=><div key={s.name} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] leading-4 text-slate-300">
            <span className="text-slate-500">{i+1}/7</span> {s.name}<span className="ml-2 font-bold text-amber-200">NOT ADMITTED</span>
          </div>)}
        </div>
      </section>
      <footer className="border-t border-white/10 py-5 text-xs leading-5 text-slate-500">AoE2WAR Storage OS / {extreme?"Extreme":"Atlas"} · Only existing authenticated read-side contracts. Traces, pulses and badges never grant execution authority. Use Basic to classify.</footer>
    </div>
  </main>;
}
