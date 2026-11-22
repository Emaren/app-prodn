"use client";

import Link from "next/link";
import {Activity,ArrowLeft,Clock3,HardDrive,LockKeyhole,RefreshCw,ShieldAlert,ShieldCheck} from "lucide-react";
import type {StorageCommandCenter} from "@/lib/storageCommandCenterProjection";
import type {IntelColdView} from "@/lib/intelColdStorageEvidence";
import {TRANSPORT_LANES,TRANSPORT_STEPS} from "./StorageTransportLaneStatus";
import {baeNodes,baeRecentObservations,type BaeMode,type BaeNode} from "./storageBaeEvidence";
import {AdvancedTopology,ExtremeTopology,ExtremeEvidenceTimeline} from "./StorageBaeTopologies";
import {signedHogInventory} from "@/lib/storageSignedFreshness";

export function BaeModeSwitch({mode,onChange}:{mode:BaeMode;onChange:(mode:BaeMode)=>void}){
  return <div role="group" aria-label="Storage Explorer BAE view mode"
    className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/15 bg-[#101b2c]/90 p-1">
    {(["B","A","E"] as const).map(m=><button key={m} type="button"
      aria-label={m==="B"?"Basic view":m==="A"?"Advanced relationships view":"Extreme network view"}
      aria-pressed={mode===m} title={m==="B"?"Basic":m==="A"?"Advanced":"Extreme"} onClick={()=>onChange(m)}
      className={"min-h-8 min-w-8 rounded-full px-2.5 text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 "+
        (mode===m?"bg-cyan-300 text-slate-950":"text-slate-400 hover:bg-white/10 hover:text-white")}>
      {m}
    </button>)}
  </div>;
}
function Chip({value}:{value:string}){
  return <span className={"inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide "+
    (value==="PASS"?"border-emerald-300/35 bg-emerald-300/10 text-emerald-200":
      value==="STALE"?"border-orange-300/30 bg-orange-300/10 text-orange-200":
      "border-amber-300/25 bg-amber-300/[.06] text-amber-100")}>{value}</span>;
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
      <p className="mt-2 text-[10px] text-slate-300">Browser polling is not a new host observation.</p>
    </div>
    <div className="rounded-2xl border border-white/10 bg-[#0c1829] p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-100"><ShieldCheck className="h-4 w-4"/> Last transport ACK</div>
      <p className="mt-3 text-sm font-bold text-amber-100">UNKNOWN · NOT VERIFIED</p>
      <p className="mt-2 text-[11px] leading-5 text-slate-400">The browser contract does not certify durable receiver ACK or file transfer. Heartbeat is not ACK.</p>
      <p className="mt-2 text-[10px] text-slate-300">Historical Intel independent restore proofs: {restores??"UNKNOWN"} · not current lane authorization</p>
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
      <p className="mt-2 text-[10px] text-slate-300">Bridge read status: {data?.bridgeOnline===true?"ONLINE":"UNKNOWN / OFFLINE"}</p>
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
    <style>{"@media (prefers-reduced-motion:reduce){.bae-controlled-transition{transition:none!important}} .bae-no-fake-motion{animation:none!important}"}</style>
    <div className={"relative space-y-5 py-6 "+(extreme?"mx-auto w-full max-w-none px-2 sm:px-5 xl:px-8":"mx-auto w-full max-w-[1840px] px-4 sm:px-7 lg:px-10")}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/admin/storage-os" className="inline-flex min-h-8 items-center gap-2 text-xs text-slate-400 hover:text-cyan-200"><ArrowLeft className="h-4 w-4"/> Storage OS command center</Link>
          <p className="mt-4 text-[10px] font-black tracking-[.24em] text-cyan-300">
            BAE / {extreme?"EXTREME":"ADVANCED"} · PRIVATE READ-ONLY COMMAND VIEW</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">Storage <span className="text-cyan-200">{extreme?"Signal Room":"Advanced"}</span></h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Three physical computers, four distinct storage surfaces, five source-owned lanes and seven independent gates. Source PASS never means a healthy disk, file movement or deletion permit.</p>
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
      {extreme?<ExtremeTopology nodes={nodes}/>:<AdvancedTopology nodes={nodes} onInspect={onInspect}/>}
      {extreme?<ExtremeEvidenceTimeline nodes={nodes} intel={intel}/>:null}
      <EvidenceStrip nodes={nodes} data={data} intel={intel} ledgerStatus={ledgerStatus} error={error} intelError={intelError} extreme={extreme}/>
      {extreme?<section aria-label="Five source-owned transport relationships" className="rounded-[26px] border border-white/10 bg-[#0a1625] p-4 sm:p-6">
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
            <span className="text-slate-300">{i+1}/7</span> {s.name}<span className="ml-2 font-bold text-amber-200">NOT ADMITTED</span>
          </div>)}
        </div>
      </section>:null}
      <footer className="border-t border-white/10 py-5 text-xs leading-5 text-slate-300">AoE2WAR Storage OS / {extreme?"Extreme":"Advanced"} · Existing authenticated read-only contracts. Static traces and signed historic evidence do not grant execution authority. Use Basic to classify.</footer>
    </div>
  </main>;
}
