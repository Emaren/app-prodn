"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Anvil,
  ArrowRight,
  Check,
  ChevronRight,
  Crown,
  Gem,
  Gavel,
  Hammer,
  Landmark,
  LockKeyhole,
  Pickaxe,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";
import type { KingdomForgeSnapshot } from "@/lib/kingdomForge";

const STATUS_TONES: Record<string, string> = {
  gathering: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  authorized: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  building: "border-orange-300/25 bg-orange-300/10 text-orange-100",
  shipped: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  paused: "border-slate-300/20 bg-slate-300/10 text-slate-200",
  closed: "border-rose-300/20 bg-rose-300/10 text-rose-100",
};

function formatWolo(value: number, compact = false) {
  if (!Number.isFinite(value)) return "0 WOLO";
  if (compact && Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}M WOLO`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}K WOLO`;
  }
  return `${Math.trunc(value).toLocaleString()} WOLO`;
}

function formatDate(value: string | null) {
  if (!value) return "Open horizon";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-100/55">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div>
    </div>
  );
}

function DeedMosaic() {
  return (
    <div className="grid grid-cols-10 gap-1" aria-label="10,000 deed charter shown as 100 blocks of 100 deeds">
      {Array.from({ length: 100 }, (_, index) => {
        const tone =
          index < 70
            ? "border-amber-200/30 bg-amber-300/70 shadow-[0_0_12px_rgba(251,191,36,0.16)]"
            : index < 90
              ? "border-orange-200/25 bg-orange-500/65"
              : "border-cyan-200/25 bg-cyan-400/65";
        return <span key={index} className={`aspect-square rounded-[3px] border ${tone}`} />;
      })}
    </div>
  );
}

export default function KingdomForgeClient() {
  const auth = useUserAuth();
  const [snapshot, setSnapshot] = useState<KingdomForgeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [operatorProjectSlug, setOperatorProjectSlug] = useState("");
  const [operatorProjectStatus, setOperatorProjectStatus] = useState("");
  const [operatorMilestoneId, setOperatorMilestoneId] = useState("");
  const [operatorMilestoneStatus, setOperatorMilestoneStatus] = useState("");
  const [deedRecipientUid, setDeedRecipientUid] = useState("");
  const [deedClass, setDeedClass] = useState("patron");
  const [deedQuantity, setDeedQuantity] = useState("");
  const [deedSourceRef, setDeedSourceRef] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/kingdom-forge", { cache: "no-store" });
      const payload = (await response.json()) as KingdomForgeSnapshot & { detail?: string };
      if (!response.ok) throw new Error(payload.detail || "The Forge ledger is unavailable.");
      setSnapshot(payload);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "The Forge ledger is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, auth.uid]);

  async function act(action: string, payload: Record<string, unknown>, key: string) {
    setSending(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/kingdom-forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const next = (await response.json()) as KingdomForgeSnapshot & { detail?: string };
      if (!response.ok) throw new Error(next.detail || "The Forge refused that action.");
      setSnapshot(next);
      const notices: Record<string, string> = {
        withdraw: "Forge Power returned to your unassigned capacity.",
        commit: "Your Forge Power signal is now in the Chronicle.",
        set_project_status: "Project lifecycle and Chronicle advanced together.",
        set_milestone_status: "Milestone state and Chronicle advanced together.",
        grant_deeds: "The finite deed ledger recorded that provenance grant.",
      };
      setNotice(notices[action] || "The Forge Chronicle recorded that action.");
      return true;
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The Forge refused that action.",
      );
      return false;
    } finally {
      setSending(null);
    }
  }

  const summary = snapshot?.summary;
  const viewer = snapshot?.viewer;
  const projects = snapshot?.projects ?? [];
  const selectedOperatorProject =
    projects.find((project) => project.slug === operatorProjectSlug) ??
    projects[0] ??
    null;
  const forgeUtilization = useMemo(() => {
    if (!summary?.totalForgeCapacityWolo) return 0;
    return Math.min(
      100,
      (summary.totalSignalledWolo / summary.totalForgeCapacityWolo) * 100,
    );
  }, [summary]);

  return (
    <main className="relative isolate -mx-3 overflow-hidden bg-[#07080b] text-white sm:-mx-5 lg:-mx-8">
      <section className="relative min-h-[650px] overflow-hidden border-b border-amber-100/10 px-4 pb-10 pt-10 sm:px-8 lg:px-12 lg:pb-14 lg:pt-16">
        <Image
          src="/market/agora-marketplace.webp"
          alt="The lantern-lit streets of the Kingdom Forge"
          fill
          priority
          className="object-cover object-center opacity-60"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,5,8,0.98)_0%,rgba(4,5,8,0.85)_36%,rgba(4,5,8,0.35)_72%,rgba(4,5,8,0.72)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(245,158,11,0.17),transparent_32%),linear-gradient(180deg,transparent_62%,#07080b_100%)]" />

        <div className="relative mx-auto flex min-h-[570px] max-w-[1680px] flex-col justify-between gap-10">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/45 px-4 py-2 text-[10px] font-black uppercase tracking-[0.32em] text-amber-100 backdrop-blur-xl">
              <Hammer className="h-4 w-4" /> Kingdom Development Foundry
            </div>
            <h1 className="mt-7 font-serif text-5xl font-black uppercase leading-[0.88] tracking-[-0.045em] text-[#fff2c7] drop-shadow-[0_8px_30px_rgba(0,0,0,0.7)] sm:text-7xl lg:text-[7.4rem]">
              Kingdom
              <br />
              <span className="text-transparent [-webkit-text-stroke:1px_rgba(253,230,138,0.75)]">Forge</span>
            </h1>
            <p className="mt-6 max-w-2xl text-xl font-semibold leading-8 text-white sm:text-2xl">
              The first million earns. The rest builds.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Choose the wing of AoE2WAR that deserves the next stone. Every campaign has its own target,
              milestones, patrons, provenance, and finite deed charter.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#projects" className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-[#171006] transition hover:bg-amber-200">
                Enter the foundry <ArrowRight className="h-4 w-4" />
              </a>
              <Link href="/round-chamber" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:border-white/30">
                Forge mandates <ScrollText className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Kingdom Stake" value={formatWolo(summary?.totalRewardEligibleWolo ?? 0, true)} detail="Reward-weighted principal after the identity cap" />
            <Stat label="Forge Capacity" value={formatWolo(summary?.totalForgeCapacityWolo ?? 0, true)} detail="Stake above the first-million lane" />
            <Stat label="Power Signalled" value={formatWolo(summary?.totalSignalledWolo ?? 0, true)} detail={`${forgeUtilization.toFixed(1)}% of visible Forge capacity`} />
            <Stat label="Open Projects" value={String(summary?.openProjects ?? 0)} detail={`${summary?.activePatrons ?? 0} patrons at the anvil`} />
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-[1680px] space-y-12 px-4 py-10 sm:px-8 lg:px-12 lg:py-16">
        <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
          <div className="overflow-hidden rounded-[2rem] border border-amber-200/15 bg-[radial-gradient(circle_at_10%_0%,rgba(245,158,11,0.12),transparent_38%),linear-gradient(145deg,rgba(25,18,10,0.96),rgba(7,9,14,0.98))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/60">Your Anvil</div>
                <h2 className="mt-2 text-3xl font-black tracking-tight">{viewer ? viewer.displayName : "Claim your place at the forge"}</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300">
                One linked identity · {snapshot?.stakeLedger.source === "mainnet_reconciled" ? "reconciled mainnet stake" : "app position stake"}
              </div>
            </div>

            {viewer ? (
              <>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <Stat label="Total Staked" value={formatWolo(viewer.stakedWolo, true)} detail="Your visible principal" />
                  <Stat label="Kingdom Stake" value={formatWolo(viewer.kingdomStakeWolo, true)} detail="Ordinary reward weight" />
                  <Stat label="Available Forge" value={formatWolo(viewer.availableForgeWolo, true)} detail={`${formatWolo(viewer.committedWolo, true)} already signalled`} />
                </div>
                <div className="mt-5 overflow-hidden rounded-full border border-white/10 bg-black/45 p-1">
                  <div className="flex h-3 overflow-hidden rounded-full">
                    <div className="bg-[linear-gradient(90deg,#f59e0b,#fde68a)]" style={{ width: `${viewer.stakedWolo ? Math.min(100, (viewer.kingdomStakeWolo / viewer.stakedWolo) * 100) : 0}%` }} />
                    <div className="bg-[linear-gradient(90deg,#fb923c,#ef4444)]" style={{ width: `${viewer.stakedWolo ? Math.min(100, (viewer.forgeCapacityWolo / viewer.stakedWolo) * 100) : 0}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-300" /> First 1M · rewards</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-400" /> Overage · builds</span>
                </div>
              </>
            ) : (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[1.4rem] border border-white/10 bg-black/35 p-5">
                <p className="max-w-xl text-sm leading-6 text-slate-300">Sign in to reveal the split between your capped Kingdom Stake and project-ready Forge capacity.</p>
                <SteamLoginButton className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-200" />
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-cyan-200/15 bg-[radial-gradient(circle_at_90%_0%,rgba(34,211,238,0.13),transparent_45%),linear-gradient(145deg,rgba(7,16,25,0.96),rgba(5,7,13,0.98))] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100"><ShieldCheck className="h-6 w-6" /></div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-200/55">Reward Law</div>
                <h2 className="mt-1 text-2xl font-black">Cap weight, never stake.</h2>
              </div>
            </div>
            <p className="mt-5 text-sm leading-7 text-slate-300">Every warrior may stake without ceiling. The daily betting-fee reward calculation counts at most 1,000,000 WOLO for each linked AoE2WAR identity, closing the obvious wallet-splitting lane.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><Landmark className="h-5 w-5 text-amber-200" /><div className="mt-3 font-bold">Kingdom Stake</div><div className="mt-1 text-xs leading-5 text-slate-400">The first million supports the network and earns the ordinary fee share.</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><Anvil className="h-5 w-5 text-orange-200" /><div className="mt-3 font-bold">Forge Power</div><div className="mt-1 text-xs leading-5 text-slate-400">Excess principal chooses named projects instead of swallowing more of the pool.</div></div>
            </div>
          </div>
        </section>

        {snapshot && snapshot.stakeLedger.health !== "ok" ? <div role="alert" className="rounded-2xl border border-amber-300/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-100"><strong>Forge commitments paused:</strong> {snapshot.stakeLedger.detail}</div> : null}
        {error ? <div role="alert" className="rounded-2xl border border-rose-300/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">{error}</div> : null}
        {notice ? <div role="status" className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">{notice}</div> : null}

        <section id="projects" className="scroll-mt-28">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.35em] text-orange-200/60">The Great Anvils</div>
              <h2 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Choose what gets built.</h2>
            </div>
            <Link href="/workshop" className="inline-flex items-center gap-2 text-sm font-bold text-amber-100 transition hover:text-white">Watch the builders work <ChevronRight className="h-4 w-4" /></Link>
          </div>

          <div className="mt-7 grid gap-5 xl:grid-cols-2">
            {loading && !projects.length
              ? Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[34rem] animate-pulse rounded-[2rem] border border-white/8 bg-white/[0.035]" />)
              : projects.map((project) => {
                  const proposedAmount = Number((amounts[project.slug] || "").replace(/,/g, ""));
                  const busy = sending === project.slug;
                  const commitmentMutable = Boolean(
                    project.viewerCommitment &&
                      project.viewerCommitment.status !== "funded" &&
                      project.viewerCommitment.settlementMode === "app_signal",
                  );
                  return (
                    <article key={project.slug} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(18,18,20,0.98),rgba(6,8,13,0.98))] p-5 shadow-[0_25px_70px_rgba(0,0,0,0.22)] transition hover:border-amber-200/20 sm:p-7">
                      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/8 blur-3xl" />
                      <div className="relative">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500"><Pickaxe className="h-4 w-4 text-orange-300" /> {project.category}</div>
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${STATUS_TONES[project.status] || STATUS_TONES.gathering}`}>{project.status}</span>
                        </div>
                        <h3 className="mt-5 text-3xl font-black tracking-tight text-[#fff5d6]">{project.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-slate-300">{project.summary}</p>

                        <div className="mt-6 grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3"><div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Target</div><div className="mt-1 text-sm font-black">{formatWolo(project.targetWolo, true)}</div></div>
                          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3"><div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Signalled</div><div className="mt-1 text-sm font-black">{formatWolo(project.signalledWolo, true)}</div></div>
                          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3"><div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Target date</div><div className="mt-1 text-sm font-black">{formatDate(project.targetDate)}</div></div>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#f97316,#ef4444)] transition-all" style={{ width: `${project.signalProgressBps / 100}%` }} /></div>
                        <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{project.patrons} patrons</span><span>{(project.signalProgressBps / 100).toFixed(1)}% mandate</span></div>

                        <div className="mt-6 grid gap-2 sm:grid-cols-4">
                          {project.milestones.map((milestone) => (
                            <div key={milestone.id} className={`rounded-xl border p-3 ${milestone.status === "proven" ? "border-emerald-300/20 bg-emerald-300/8" : milestone.status === "building" ? "border-orange-300/20 bg-orange-300/8" : "border-white/8 bg-white/[0.025]"}`}>
                              <div className="flex items-center justify-between"><span className="text-[9px] font-black text-slate-500">0{milestone.sequence}</span>{milestone.status === "proven" ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <LockKeyhole className="h-3.5 w-3.5 text-slate-600" />}</div>
                              <div className="mt-2 text-xs font-bold text-slate-200">{milestone.title}</div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 rounded-[1.35rem] border border-amber-200/12 bg-amber-200/[0.045] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div><div className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-100/55">Forge Power</div><div className="mt-1 text-sm text-slate-300">{project.viewerCommitment ? `${formatWolo(project.viewerCommitment.amountWolo)} currently signalled` : "Declare your build mandate"}</div></div>
                            {commitmentMutable ? <button type="button" disabled={busy} onClick={() => void act("withdraw", { projectSlug: project.slug }, project.slug)} className="rounded-full border border-white/12 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-white/25 hover:text-white disabled:opacity-50">Withdraw signal</button> : null}
                          </div>
                          {viewer ? (
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <input disabled={Boolean(project.viewerCommitment) && !commitmentMutable} inputMode="numeric" aria-label={`Forge Power for ${project.title}`} value={amounts[project.slug] ?? String(project.viewerCommitment?.amountWolo ?? "")} onChange={(event) => setAmounts((current) => ({ ...current, [project.slug]: event.target.value.replace(/[^0-9]/g, "") }))} placeholder="Amount in WOLO" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-sm font-bold outline-none focus:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-55" />
                              <button type="button" disabled={busy || (Boolean(project.viewerCommitment) && !commitmentMutable) || !Number.isFinite(proposedAmount) || proposedAmount <= 0} onClick={() => void act("commit", { projectSlug: project.slug, amountWolo: proposedAmount }, project.slug)} className="rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Striking…" : project.viewerCommitment && !commitmentMutable ? "Funding sealed" : project.viewerCommitment ? "Recast" : "Commit"}</button>
                            </div>
                          ) : (
                            <div className="mt-4"><SteamLoginButton className="rounded-full bg-amber-300 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-200" /></div>
                          )}
                          <div className="mt-3 text-[10px] leading-5 text-slate-500">App signal until a verified project-funding transaction exists. Your current staking principal is not moved by this action.</div>
                        </div>
                      </div>
                    </article>
                  );
                })}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[2rem] border border-amber-200/15 bg-[linear-gradient(145deg,rgba(27,20,9,0.96),rgba(7,8,12,0.98))] p-6 sm:p-8">
            <div className="flex items-center gap-3"><Gem className="h-7 w-7 text-amber-200" /><div><div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/55">Finite by law</div><h2 className="mt-1 text-3xl font-black">10,000 Feature Deeds</h2></div></div>
            <p className="mt-4 text-sm leading-7 text-slate-300">One deed is 0.01%. Every 100 deeds is 1% of a project’s provenance and governance charter. No dust. No infinite mint.</p>
            <div className="mt-6"><DeedMosaic /></div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-amber-200/15 bg-amber-300/8 p-3"><div className="text-xl font-black text-amber-100">7,000</div><div className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/55">Patrons</div></div>
              <div className="rounded-xl border border-orange-200/15 bg-orange-400/8 p-3"><div className="text-xl font-black text-orange-100">2,000</div><div className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-orange-100/55">Builders</div></div>
              <div className="rounded-xl border border-cyan-200/15 bg-cyan-400/8 p-3"><div className="text-xl font-black text-cyan-100">1,000</div><div className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/55">Kingdom</div></div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(12,16,23,0.98),rgba(5,7,12,0.98))] p-6 sm:p-8">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-200/55">Standing through work</div>
            <h2 className="mt-2 text-3xl font-black">Wealth opens the gate. Achievement earns the title.</h2>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { icon: Landmark, title: "Staker", body: "Has WOLO committed to network and product security.", tone: "text-cyan-200" },
                { icon: UsersRound, title: "Patron", body: "Directs excess capacity into a named active Forge campaign.", tone: "text-amber-200" },
                { icon: Crown, title: "Architect", body: "Helped a project cross Forge Seal and ship into real use.", tone: "text-orange-200" },
              ].map((rank) => (
                <div key={rank.title} className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-5"><rank.icon className={`h-6 w-6 ${rank.tone}`} /><div className="mt-4 text-xl font-black">{rank.title}</div><p className="mt-2 text-xs leading-6 text-slate-400">{rank.body}</p></div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/staking" className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2.5 text-sm font-bold hover:border-white/25">Inspect staking truth <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/workshop" className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2.5 text-sm font-bold hover:border-white/25">See what shipped <Sparkles className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>

        {viewer?.isAdmin ? (
          <section className="rounded-[2rem] border border-amber-200/18 bg-[radial-gradient(circle_at_0%_0%,rgba(245,158,11,0.12),transparent_30%),linear-gradient(145deg,rgba(24,17,9,0.96),rgba(6,8,13,0.99))] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/60">
                  <Gavel className="h-4 w-4" /> Operator Foundry
                </div>
                <h2 className="mt-2 text-3xl font-black">Move the work. Seal the provenance.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Every lifecycle change and deed grant commits with its Chronicle entry. Deed source references are idempotent and class supply cannot exceed the 7,000 / 2,000 / 1,000 charter.
                </p>
              </div>
              <span className="rounded-full border border-amber-200/15 bg-amber-300/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
                Steward access
              </span>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
                <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-100/65">Project and milestone lifecycle</div>
                <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Project
                  <select value={selectedOperatorProject?.slug ?? ""} onChange={(event) => { setOperatorProjectSlug(event.target.value); setOperatorMilestoneId(""); }} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm font-bold text-white outline-none focus:border-amber-200/35">
                    {projects.map((project) => <option key={project.slug} value={project.slug}>{project.title}</option>)}
                  </select>
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="sr-only" htmlFor="forge-project-status">Project status</label>
                  <select id="forge-project-status" value={operatorProjectStatus} onChange={(event) => setOperatorProjectStatus(event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm text-white outline-none focus:border-amber-200/35">
                    <option value="">Choose project status</option>
                    {["gathering", "authorized", "building", "shipped", "paused", "closed"].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <button type="button" disabled={Boolean(sending) || !selectedOperatorProject || !operatorProjectStatus} onClick={async () => { if (selectedOperatorProject && await act("set_project_status", { projectSlug: selectedOperatorProject.slug, status: operatorProjectStatus }, "operator-project")) setOperatorProjectStatus(""); }} className="min-h-11 rounded-xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:opacity-40">Publish state</button>
                </div>

                <div className="mt-5 border-t border-white/8 pt-5">
                  <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Milestone
                    <select value={operatorMilestoneId} onChange={(event) => setOperatorMilestoneId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm text-white outline-none focus:border-amber-200/35">
                      <option value="">Choose milestone</option>
                      {(selectedOperatorProject?.milestones ?? []).map((milestone) => <option key={milestone.id} value={milestone.id}>0{milestone.sequence} · {milestone.title} · {milestone.status}</option>)}
                    </select>
                  </label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="sr-only" htmlFor="forge-milestone-status">Milestone status</label>
                    <select id="forge-milestone-status" value={operatorMilestoneStatus} onChange={(event) => setOperatorMilestoneStatus(event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm text-white outline-none focus:border-amber-200/35">
                      <option value="">Choose milestone status</option>
                      {["sealed", "ready", "building", "proven", "failed"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    <button type="button" disabled={Boolean(sending) || !operatorMilestoneId || !operatorMilestoneStatus} onClick={async () => { if (await act("set_milestone_status", { milestoneId: Number(operatorMilestoneId), status: operatorMilestoneStatus }, "operator-milestone")) setOperatorMilestoneStatus(""); }} className="min-h-11 rounded-xl border border-amber-200/20 bg-amber-300/10 px-5 text-sm font-black text-amber-100 transition hover:bg-amber-300/20 disabled:opacity-40">Seal milestone</button>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
                <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/65">Feature Deed grant</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recipient UID<input value={deedRecipientUid} onChange={(event) => setDeedRecipientUid(event.target.value)} placeholder="AoE2WAR user UID" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/30" /></label>
                  <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Deed class<select value={deedClass} onChange={(event) => setDeedClass(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-200/30"><option value="patron">Patron · 7,000</option><option value="builder">Builder · 2,000</option><option value="kingdom">Kingdom · 1,000</option></select></label>
                  <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Quantity<input type="number" min={1} max={10000} step={1} value={deedQuantity} onChange={(event) => setDeedQuantity(event.target.value)} placeholder="100" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/30" /></label>
                  <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Project<select value={selectedOperatorProject?.slug ?? ""} onChange={(event) => setOperatorProjectSlug(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-200/30">{projects.map((project) => <option key={project.slug} value={project.slug}>{project.title}</option>)}</select></label>
                </div>
                <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Idempotent source reference<input value={deedSourceRef} onChange={(event) => setDeedSourceRef(event.target.value)} placeholder="forge:project:grant:v1" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080a0f] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/30" /></label>
                <button type="button" disabled={Boolean(sending) || !selectedOperatorProject || !deedRecipientUid.trim() || !Number.isInteger(Number(deedQuantity)) || Number(deedQuantity) <= 0 || !deedSourceRef.trim()} onClick={async () => { if (selectedOperatorProject && await act("grant_deeds", { projectSlug: selectedOperatorProject.slug, recipientUid: deedRecipientUid, deedClass, quantity: Number(deedQuantity), sourceRef: deedSourceRef }, "operator-deeds")) { setDeedQuantity(""); setDeedSourceRef(""); } }} className="mt-4 min-h-12 w-full rounded-xl bg-cyan-200 px-5 text-sm font-black text-slate-950 transition hover:bg-white disabled:opacity-40">Grant finite deeds</button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Forge Chronicle</div><h2 className="mt-2 text-3xl font-black">Every strike leaves a mark.</h2></div><div className="text-xs text-slate-500">Append-only project trail</div></div>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {(snapshot?.events ?? []).slice(0, 12).map((event) => (
              <div key={event.id} className="flex gap-4 rounded-[1.2rem] border border-white/8 bg-white/[0.025] p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-orange-200/15 bg-orange-300/8 text-orange-100"><Hammer className="h-4 w-4" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-black text-white">{event.project?.title || "Kingdom Forge"}</span>{event.amountWolo ? <span className="text-amber-200">{formatWolo(event.amountWolo, true)}</span> : null}</div><p className="mt-1 text-xs leading-5 text-slate-400">{event.detail}</p><div className="mt-2 text-[10px] text-slate-600">{new Date(event.createdAt).toLocaleString()}</div></div></div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
