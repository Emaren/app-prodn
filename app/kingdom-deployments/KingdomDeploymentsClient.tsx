"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, CheckCircle2, ChevronDown, Clock3, GitCommitHorizontal, GitCompareArrows, History, LoaderCircle, Radio, ShieldCheck, Timer, XCircle } from "lucide-react";
import { readFactoryPublicStatus, unknownFactoryStatus, type FactoryFeed, type FactorySignal } from "@/lib/factoryPublicStatus";

const emptyFeed: FactoryFeed = { authority: "unavailable", value: unknownFactoryStatus() };
const elapsed = (ms: number | null | undefined) => ms == null ? "NOT MEASURED" : ms >= 60_000
  ? Math.floor(ms / 60000) + "m " + String(Math.floor(ms / 1000) % 60).padStart(2, "0") + "s"
  : (ms / 1000).toFixed(2) + "s";
const date = (raw: string | null | undefined) => raw && Number.isFinite(Date.parse(raw))
  ? new Date(raw).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "DATE UNKNOWN";
const short = (raw: string | null | undefined) => raw ? raw.slice(0, 12) + "…" + raw.slice(-7) : "UNKNOWN";
const words: Record<FactorySignal, string> = { pass: "ACCEPTED", running: "DEPLOYING", pending: "PENDING", fail: "FAILED", hold: "ON HOLD", stale: "STALE", unknown: "UNKNOWN" };

export default function KingdomDeploymentsClient() {
  const [feed, setFeed] = useState<FactoryFeed>(emptyFeed);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (pending.current || (typeof document !== "undefined" && document.hidden)) return;
    pending.current = true;
    setBusy(true);
    const active = new AbortController();
    controller.current = active;
    const timeout = window.setTimeout(() => active.abort(), 6000);
    try {
      const response = await fetch("/factory/status.json", { cache: "no-store", credentials: "omit",
        signal: active.signal, headers: { Accept: "application/json" } });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("unavailable");
      const body = await response.text();
      if (body.length > 24_000) throw new Error("oversized");
      setFeed(readFactoryPublicStatus(JSON.parse(body)));
    } catch { setFeed(emptyFeed); }
    finally {
      window.clearTimeout(timeout);
      controller.current = null;
      pending.current = false;
      setBusy(false);
      setLastRead(new Date().toISOString());
    }
  }, []);
  useEffect(() => {
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    const interval = window.setInterval(() => { void refresh(); }, 15000);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); controller.current?.abort(); };
  }, [refresh]);

  const status = feed.value;
  const invocation = feed.authority === "fresh" ? status.deploymentInvocation : null;
  const release = feed.authority === "fresh" ? status.releaseOs : null;
  const signals = Object.values(status.pipelineStage.stages);
  const state: FactorySignal = feed.authority === "stale" ? "stale" : feed.authority !== "fresh" ? "unknown" :
    signals.some(s => s === "running") ? "running" : signals.some(s => s === "fail") ? "fail" :
      invocation && invocation.durableAcceptanceMs !== null ? "pass" : "unknown";
  const stateStyle = state === "pass" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" :
    state === "running" ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-200" :
    state === "fail" ? "border-rose-300/30 bg-rose-400/10 text-rose-200" :
      "border-amber-200/30 bg-amber-400/10 text-amber-200";
  return <main className="mx-auto w-full min-w-0 max-w-[96rem] px-2 pb-16 text-slate-100 sm:px-3">
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-sky-300/15 bg-[#060d1d] px-5 py-9 shadow-[0_34px_100px_rgba(0,0,0,.34)] sm:px-9 sm:py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_0%,rgba(14,165,233,.21),transparent_45%),radial-gradient(ellipse_at_93%_5%,rgba(139,92,246,.15),transparent_45%)]" />
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[.23em] text-sky-300">
        <span className="inline-flex items-center gap-2"><GitCompareArrows size={17} /> AOE2WAR / RELEASE CONTROL</span>
        <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/5 px-4 text-slate-100 hover:bg-sky-300/10 disabled:opacity-60"><Radio size={15} /> SCAN LIVE FEED</button>
      </div>
      <h1 className="mt-8 max-w-5xl text-4xl font-black tracking-[-.065em] text-white sm:text-6xl lg:text-7xl">
        KINGDOM <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">DEPLOYMENTS.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">A release should leave a battle record. Track the published source, the actual stopwatch, rollback evidence and the exact point where proof is missing.</p>
      <div className="mt-7 flex flex-wrap items-center gap-3 text-xs">
        <span data-deployment-state={state} className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 font-black tracking-widest " + stateStyle}>
          {state === "pass" ? <CheckCircle2 size={15} /> : state === "fail" ? <XCircle size={15} /> : state === "running" ? <LoaderCircle size={15} className="motion-safe:animate-spin" /> : <Activity size={15} />}
          {words[state]}
        </span>
        <span className="rounded-full border border-white/10 px-4 py-2 text-slate-300">SOURCE {feed.authority.toUpperCase()} · SCAN {date(lastRead)}</span>
        <Link className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 font-bold text-cyan-200 hover:border-cyan-200/40" href="/factory">WAR FACTORY <ArrowUpRight size={14} /></Link>
      </div>
    </section>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <Metric icon={<Timer size={18} />} label="COMMAND → LIVE" value={invocation ? elapsed(invocation.firstVerifiedLiveMs) : "UNKNOWN"} caption="First independently verified public page" />
      <Metric icon={<ShieldCheck size={18} />} label="COMMAND → T10" value={invocation ? elapsed(invocation.durableAcceptanceMs) : "UNKNOWN"} caption="Durable rollback and reactivation" />
      <Metric icon={<GitCommitHorizontal size={18} />} label="ACTIVE SOURCE" value={feed.authority === "fresh" ? short(status.liveRelease.id) : "UNKNOWN"} caption="Actual published source SHA" />
    </div>
    <section className="mt-5 overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#080f20]" aria-label="Deployment history">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-5 py-6 sm:px-8">
        <div><p className="text-[10px] font-bold uppercase tracking-[.25em] text-sky-300">THE RELEASE CHRONICLE</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Latest deployment</h2></div>
        <span className="text-xs text-slate-400">Newest published receipt first</span>
      </header>
      {invocation ? <article className="p-4 sm:p-7" data-release-invocation={invocation.invocationId}>
        <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#0d2c2d] via-[#0b1b2e] to-[#12162d] p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[.22em] text-emerald-300">● RECEIPT-BOUND RELEASE · {invocation.kind.toUpperCase()}</p>
              <h3 className="mt-3 break-all font-mono text-xl font-bold tracking-tight text-white sm:text-2xl">RUN #{invocation.githubRunId}</h3>
              <p className="mt-2 text-sm text-slate-300">Source {short(invocation.sourceSha)} · Build {invocation.buildId}</p>
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400"><Clock3 size={13} /> {date(invocation.startedAt)} — {date(invocation.completedAt)}</p>
            </div>
            <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-center">
              <CheckCircle2 size={20} className="mx-auto text-emerald-300" /><p className="mt-1 text-xs font-black tracking-widest text-emerald-200">{invocation.durableAcceptanceMs !== null ? "T10 SEALED" : "T10 UNKNOWN"}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SmallStat label="LIVE VERIFIED" value={elapsed(invocation.firstVerifiedLiveMs)} />
            <SmallStat label="DURABLE T10" value={elapsed(invocation.durableAcceptanceMs)} />
            <SmallStat label="OBSERVED INVOCATION" value={elapsed(invocation.observedInvocationMs)} />
          </div>
          <details className="group mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-4 open:border-sky-300/25">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-sky-200">INSPECT DEPLOYMENT EVIDENCE <ChevronDown size={18} className="transition-transform group-open:rotate-180" /></summary>
            <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
              <Evidence name="Invocation ID" value={invocation.invocationId} />
              <Evidence name="Previous source" value={invocation.previousSourceSha} />
              <Evidence name="New source" value={invocation.sourceSha} />
              <Evidence name="Root seal SHA256" value={invocation.rootSealSha256} />
              <Evidence name="Receipt SHA256" value={invocation.receiptSha256} />
              <Evidence name="Runtime artifact SHA256" value={invocation.artifactSha256} />
            </dl>
            <div className="mt-5 space-y-2">{invocation.timeline.map((step, index) => <div key={step.phase + index} className="flex flex-wrap justify-between gap-2 rounded-lg border border-white/10 bg-white/[.035] p-3 text-xs"><strong>{step.phase} · {words[step.state]}</strong><span className="text-slate-400">{date(step.at)} · {elapsed(step.elapsedMs)}</span></div>)}</div>
            {invocation.provenanceUrl ? <a href={invocation.provenanceUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-cyan-300 hover:underline">INSPECT ORIGINAL PROVENANCE <ArrowUpRight size={13} /></a> : null}
          </details>
        </div>
      </article> : <div className="p-10 text-center sm:p-14">
        <History className="mx-auto text-slate-500" size={32} /><h3 className="mt-4 text-lg font-bold text-white">No fresh deployment receipt available</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">The source is {feed.authority.toUpperCase()}. No release is called successful or in progress from missing evidence.</p>
      </div>}
      <div className="border-t border-white/10 px-5 py-5 text-xs leading-6 text-slate-400 sm:px-8">
        <strong className="text-amber-200">HISTORY BOUNDARY:</strong> The current public Factory feed publishes the latest admitted invocation, not a full historical journal. Past deployments will appear only after an independently accepted receipt-history publisher exists. No invented entries.
      </div>
    </section>
    <section className="mt-5 rounded-[1.8rem] border border-white/10 bg-[#080f20] px-5 py-6 sm:px-8">
      <h2 className="text-xl font-black text-white">Release milestones</h2>
      {release && release.stages.length ? <ol className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{release.stages.map((step, index) => <li key={step.event + index} className="rounded-xl border border-white/10 bg-white/[.035] p-4"><div className="flex justify-between gap-2 text-xs"><strong>{step.label}</strong><span className={step.state === "pass" ? "text-emerald-300" : step.state === "fail" ? "text-rose-300" : "text-amber-200"}>{words[step.state]}</span></div><p className="mt-2 text-[11px] text-slate-400">{date(step.at)} · {elapsed(step.durationMs)}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">SHA {short(step.proofSha256)}</p></li>)}</ol> : <p className="mt-4 text-sm text-slate-400">No fresh stage timeline published. Status UNKNOWN.</p>}
    </section>
  </main>;
}
function Metric({ icon, label, value, caption }: { icon: React.ReactNode; label: string; value: string; caption: string }) {
  return <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#112037] to-[#080f20] p-5"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-sky-300">{icon}{label}</div><div className="mt-3 break-words font-mono text-2xl font-bold tracking-tight text-white sm:text-3xl">{value}</div><p className="mt-2 text-xs text-slate-400">{caption}</p></div>;
}
function SmallStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] font-bold tracking-widest text-slate-400">{label}</p><p className="mt-1 font-mono text-xl font-bold text-sky-200">{value}</p></div>;
}
function Evidence({ name, value }: { name: string; value: string }) {
  return <div className="min-w-0"><dt className="font-bold uppercase tracking-wider text-slate-400">{name}</dt><dd className="mt-1 break-all font-mono text-slate-100">{value}</dd></div>;
}