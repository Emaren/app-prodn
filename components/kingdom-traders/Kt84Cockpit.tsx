"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowLeft, Bot, CheckCircle2,
  Coins, DatabaseZap, Eye, LockKeyhole, RefreshCw, ShieldAlert,
  WalletCards, Waves, Workflow,
} from "lucide-react";
import type { Kt84SafeView } from "@/lib/kt84ReadonlyProjection";

const PROVIDERS = [
  {id:"stellar-classic",name:"Stellar Classic DEX",type:"Native order book",source:"Historical Horizon book",role:"DIRECT"},
  {id:"soroswap-amm",name:"Soroswap AMM",type:"Soroban pool",source:"Historical pool RPC",role:"DIRECT"},
  {id:"aquarius",name:"Aquarius",type:"AMM candidate",source:"Direct pair unknown",role:"UNKNOWN"},
  {id:"sushi",name:"Sushi on Stellar",type:"AMM candidate",source:"Direct pair unknown",role:"UNKNOWN"},
  {id:"comet",name:"Comet",type:"AMM candidate",source:"Direct pair unknown",role:"UNKNOWN"},
  {id:"soroswap-aggregator",name:"Soroswap Aggregator",type:"Router · five venues",source:"No original executable quote",role:"ROUTER"},
] as const;

type SourceState = "LOADING" | "SIGNED_HISTORICAL" | "HOLD";
function smallPin(value: string | null | undefined) {
  if (!value || !/^[0-9a-f]{64}$/.test(value)) return "UNKNOWN";
  return value.slice(0, 10) + "…" + value.slice(-8);
}
function observedAge(ts: string | null | undefined) {
  if (!ts) return "UNKNOWN";
  const age = Math.floor((Date.now() - Date.parse(ts)) / 1000);
  if (!Number.isFinite(age) || age < 0) return "UNKNOWN";
  if (age < 60) return age + " seconds";
  if (age < 3600) return Math.floor(age / 60) + " minutes";
  if (age < 86400) return Math.floor(age / 3600) + " hours";
  return Math.floor(age / 86400) + " days";
}

export default function Kt84Cockpit() {
  const [projection,setProjection] = useState<Kt84SafeView|null>(null);
  const [sourceState,setSourceState] = useState<SourceState>("LOADING");
  const [page,setPage] = useState(1);
  const [view,setView] = useState<"cards"|"terminal">("cards");
  const refresh = useCallback(async () => {
    setSourceState("LOADING");
    setProjection(null);
    try {
      const response = await fetch("/api/kingdom-traders/paper-readonly", {
        method:"GET", credentials:"same-origin", cache:"no-store",
        headers:{"Accept":"application/json"},
      });
      if (!response.ok || response.status !== 200) throw Error("NOT_ADMITTED");
      const data:unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          (data as Record<string,unknown>).schema !== "aoe2war.kt84.we2-projected-history.v1" ||
          (data as Record<string,unknown>).sourceKind !== "SIGNED_WE3_HISTORICAL_ONLY") throw Error("BAD_SOURCE");
      setProjection(data as Kt84SafeView);
      setSourceState("SIGNED_HISTORICAL");
    } catch {
      setSourceState("HOLD");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const signed = sourceState === "SIGNED_HISTORICAL" && projection !== null;
  const visibleSlots = Array.from({length:10},(_,index)=>(page-1)*10+index+1);

  return (
    <main className="space-y-6 py-3 text-white sm:space-y-9 sm:py-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-200/20 bg-[radial-gradient(ellipse_at_85%_0%,rgba(34,211,238,0.2),transparent_48%),radial-gradient(ellipse_at_0%_100%,rgba(234,179,8,0.09),transparent_55%),linear-gradient(145deg,#07121d,#020611_84%)] p-6 shadow-[0_28px_85px_rgba(0,0,0,0.4)] sm:p-10">
        <div className="absolute right-5 top-5 hidden h-28 w-28 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/[0.035] lg:flex" aria-hidden="true">
          <Waves className="h-12 w-12 text-cyan-200/35" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/kingdom-traders" className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-100/80 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Trading gateway
          </Link>
          <span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-100">
            <LockKeyhole className="mr-1 inline h-3.5 w-3.5" /> Owner-authenticated · no trading authority
          </span>
        </div>
        <p className="mt-10 text-xs font-bold uppercase tracking-[0.32em] text-cyan-200/70">Kingdom Traders · KT84 observation deck</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">A fleet worth trusting.</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
          Six Stellar provider roles. Original PAPER provenance. One deliberately silent trading switch.
          Historical research is not a live worker, a wallet balance or permission to spend.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className={"inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold "+
            (signed ? "border-cyan-200/35 bg-cyan-200/10 text-cyan-100" : "border-amber-200/30 bg-amber-200/[0.08] text-amber-100")} role="status">
            {signed?<CheckCircle2 className="h-4 w-4"/>:<ShieldAlert className="h-4 w-4"/>}
            {signed ? "SIGNED HISTORICAL RECORD · NOT LIVE" : sourceState === "LOADING" ? "Checking signed WE3 source…" : "SIGNED WE3 PROJECTION NOT ADMITTED"}
          </span>
          <button type="button" onClick={() => void refresh()} disabled={sourceState==="LOADING"}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white hover:border-cyan-100/40 disabled:opacity-40">
            <RefreshCw className="h-3.5 w-3.5"/> Recheck receipt
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          WE3 source contract KT84 · <code>ad376120dd01…</code> · observer does not own exchange keys, trading control or original SQLite.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label="PAPER source safety statuses">
        {[
          {name:"Historical original bot",icon:Bot,status:"HALTED",detail:signed?"Signed historical journal projection":"WE3 documented history · unsigned at website"},
          {name:"New KT83 account",icon:DatabaseZap,status:"NOT WEB-VERIFIED",detail:"WE3 reports a local PAUSED journal. Independent account receipt not admitted."},
          {name:"Verified worker heartbeat",icon:Activity,status:"NOT RUNNING",detail:"No signed RESUME or independently witnessed continuous worker"},
        ].map(box=>{
          const Icon=box.icon;
          return <article key={box.name} className="rounded-2xl border border-white/10 bg-[#07111f] p-5">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"><Icon className="h-4 w-4 text-cyan-200/70"/>{box.name}</p>
            <p className="mt-3 text-lg font-black text-amber-100">{box.status}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{box.detail}</p>
          </article>;
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
        <article className="rounded-[1.7rem] border border-white/10 bg-[#07101d] p-6">
          <h2 className="flex items-center gap-2 text-xl font-black"><Coins className="h-5 w-5 text-amber-200"/> Original PAPER ledger</h2>
          <p className="mt-2 text-sm text-slate-400">Only separately signed WE3 historical receipts can populate values. No live USD account balance is inferred.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["Historical modeled cash", signed ? projection.historicalBot.cashUSDC + " USDC" : "UNKNOWN"],
              ["Original XLM inventory", signed ? projection.historicalBot.inventoryXLM + " XLM" : "UNKNOWN"],
              ["Historical fees", signed ? projection.historicalBot.feesUSDC + " USDC" : "UNKNOWN"],
              ["Realized modeled P&L", signed ? projection.historicalBot.realizedPaperPnLUSDC + " USDC" : "UNKNOWN"],
            ].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-white">{value}</p>
            </div>)}
          </div>
          <div className="mt-5 space-y-1 rounded-xl border border-cyan-200/10 bg-cyan-200/[0.035] p-3 font-mono text-xs text-slate-300">
            <p>Original finance head: {smallPin(signed?projection.historicalBot.financeHead:null)}</p>
            <p>Original operator head: {smallPin(signed?projection.historicalBot.operatorHead:null)}</p>
            <p>Study receipt: {smallPin(signed?projection.studyReceiptSHA256:null)}</p>
            <p className="pt-1 text-amber-100">Original source age: {signed?observedAge(projection.sourceObservedAtUTC):"UNKNOWN"}</p>
          </div>
        </article>
        <article className="rounded-[1.7rem] border border-white/10 bg-[#07101d] p-6">
          <h2 className="flex items-center gap-2 text-xl font-black"><WalletCards className="h-5 w-5 text-cyan-200"/> Freighter wallet dock</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Watch-only identity and public Stellar network reads only, after a separately audited official wallet SDK is admitted.</p>
          <div className="mt-5 rounded-xl border border-amber-200/20 bg-amber-200/[0.045] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-100">Wallet not connected</p>
            <p className="mt-2 text-sm text-slate-300">Address: UNKNOWN · Network: not verified · XLM reserves: UNKNOWN</p>
            <button type="button" disabled className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-400 opacity-50" title="Official SDK and owner-consent source gate not yet admitted">
              Connect (SDK admission required)
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200/20 bg-[linear-gradient(125deg,rgba(251,191,36,0.08),rgba(10,17,31,0.5))] p-4">
            <p className="flex items-center gap-2 text-lg font-black text-amber-100"><ShieldAlert className="h-5 w-5"/> US$10 total-exposure gate</p>
            <p className="mt-2 text-sm text-slate-300">HOLD. Reserve, trustline eligibility, network/Soroban fees, XLM/USD conversion and signing authority are unverified. US$10 is the account total, not per bot.</p>
          </div>
        </article>
      </section>

      <section className="space-y-4" aria-labelledby="providers-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200/65">Research sources</p>
            <h2 id="providers-title" className="mt-1 text-3xl font-black">Six roles. Five venues. One router.</h2>
          </div>
          <p className="text-xs text-slate-400">Router liquidity is never counted twice</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((provider,index)=>{
            const source = signed ? projection.providers.find(row=>row.id===provider.id) : null;
            return <article key={provider.id} className="rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(15,30,45,.92),rgba(4,10,21,.98))] p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">0{index+1} · {provider.type}</span>
                <span className="rounded-full border border-white/15 px-2 py-1 text-[10px] font-black text-slate-300">{provider.role}</span>
              </div>
              <h3 className="mt-4 text-lg font-black">{provider.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{provider.source}</p>
              <div className="mt-5 border-t border-white/10 pt-3 text-xs text-slate-300">
                <p>Verified current quote: <span className="font-bold text-amber-100">NONE</span></p>
                <p className="mt-1">Historical ledger: <span className="font-mono">{source?.sourceLedger??"UNKNOWN"}</span></p>
                <p className="mt-1">Source status: <span className="text-slate-400">{source?.sourceStatus??"UNADMITTED"}</span></p>
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="rounded-[1.65rem] border border-white/10 bg-[#07101d] p-6" aria-label="PAPER research rejection evidence">
        <h2 className="flex items-center gap-2 text-xl font-black"><Workflow className="h-5 w-5 text-cyan-200"/> Research decision board</h2>
        <p className="mt-2 text-sm text-slate-400">{signed ? "Ten original research decisions · none executable" : "Ten original rejections reported by WE3; the website cannot independently display decision rows until the signed bridge is admitted."}</p>
        {signed ? <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {projection.opportunities.map((decision,i)=><div key={i} className="rounded-xl border border-amber-200/15 bg-amber-200/[0.035] p-3">
            <p className="text-xs font-black text-amber-100">{String(i+1).padStart(2,"0")} · {decision.decision}</p>
            <p className="mt-1 text-xs text-slate-200">{decision.route}</p>
            <p className="mt-2 text-xs text-slate-400">{decision.reason}</p>
          </div>)}
        </div> : <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-amber-100">No live opportunity, execution or order-fill stream is connected.</p>}
      </section>

      <section className="rounded-[1.65rem] border border-white/10 bg-[#07101d] p-6" aria-labelledby="fleet-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200/70">PAPER fleet</p><h2 id="fleet-title" className="mt-2 text-2xl font-black">One hundred positions. No fictitious workers.</h2></div>
          <div className="flex gap-2" role="group" aria-label="Fleet display">
            <button type="button" aria-pressed={view==="cards"} onClick={()=>setView("cards")} className={"rounded-lg border px-3 py-2 text-xs font-bold "+(view==="cards"?"border-cyan-200/60 bg-cyan-200/15":"border-white/20")}>Cards</button>
            <button type="button" aria-pressed={view==="terminal"} onClick={()=>setView("terminal")} className={"rounded-lg border px-3 py-2 text-xs font-bold "+(view==="terminal"?"border-cyan-200/60 bg-cyan-200/15":"border-white/20")}>Terminal</button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-slate-300">Page {page}/10 · Slots {visibleSlots[0]}–{visibleSlots[9]}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-30">Previous</button>
            <label htmlFor="kt84-fleet-page" className="sr-only">PAPER fleet page</label>
            <select id="kt84-fleet-page" value={page} onChange={e=>setPage(Number(e.target.value))} className="rounded-lg border border-white/20 bg-[#111d2e] p-2 text-sm">
              {Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1} / 10</option>)}
            </select>
            <button type="button" disabled={page===10} onClick={()=>setPage(p=>Math.min(10,p+1))} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-30">Next</button>
          </div>
        </div>
        <div className={view==="cards"?"mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5":"mt-5 space-y-1 rounded-xl border border-white/10 bg-[#030a10] p-3 font-mono text-xs"} role="list" aria-label="PAPER fleet slots">
          {visibleSlots.map(slot=>{
            const status = signed ? projection.fleet.entries[slot-1].status :
              slot===1 ? "SOURCE NOT ADMITTED" : "UNCOMMISSIONED";
            return <div role="listitem" key={slot} className={view==="cards"?"rounded-xl border border-white/10 bg-white/[0.025] p-4":"flex justify-between gap-4 border-b border-white/5 py-1.5 last:border-0"}>
              <p className="font-mono text-xs text-cyan-100">#{String(slot).padStart(3,"0")}</p>
              <p className="mt-1 text-xs font-semibold text-amber-100">{status.replaceAll("_"," ")}</p>
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.025] p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Eye className="h-5 w-5 text-cyan-200"/> Evidence over promises</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
          This observer never signs commands, places orders, starts workers, reads original SQLite or stores wallet keys.
          An absent signed source stays UNKNOWN. The historical HALT does not stand in for a new PAUSED journal,
          an unsigned source is not a verified heartbeat, and none of these cards represent a funded transaction.
        </p>
      </section>
    </main>
  );
}
