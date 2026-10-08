"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import type { PlayerResultRecoveryPlan, PlayerResultRecoveryTarget } from "@/lib/playerResultRecovery";

const targets: Array<{ key: PlayerResultRecoveryTarget; name: string }> = [
  { key: "all", name: "All three players" }, { key: "zodiac", name: "Zodiac" },
  { key: "vegeta", name: "mYsTikaL_VeGeTa" }, { key: "jiren", name: "mYsTikaL JiReN" },
];

export default function PlayerResultRecovery() {
  const [target, setTarget] = useState<PlayerResultRecoveryTarget>("all");
  const [maxGames, setMaxGames] = useState(3);
  const [plan, setPlan] = useState<PlayerResultRecoveryPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlId, setControlId] = useState("32388");
  const [controlBusy, setControlBusy] = useState(false);
  const [controlMessage, setControlMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function refresh() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/replay-operations/player-recovery", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, dryRun: true, maxGames, concurrency: 1 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Player recovery planning failed.");
      setPlan(body as PlayerResultRecoveryPlan);
    } catch (failure) {
      setPlan(null); setError(failure instanceof Error ? failure.message : "Player recovery unavailable.");
    } finally { setBusy(false); }
  }

  async function runKnownControl() {
    const gameStatsId = Number(controlId);
    if (!/^\d+$/.test(controlId) || !Number.isSafeInteger(gameStatsId) || gameStatsId < 1) { setControlMessage("Enter a canonical positive GameStats ID."); return; }
    setControlBusy(true); setControlMessage(null);
    type Run = { id: string; status: string; error?: string | null; result?: { terminalOutcomeProven?: boolean; trustedControlValidation?: { status?: string } } | null };
    type Dashboard = { activeRun?: Run | null; recentRuns?: Run[] };
    async function dashboard(init?: RequestInit): Promise<Dashboard> {
      const response = await fetch("/api/admin/aoe2war-os", { cache: "no-store", ...init });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Native control could not be queued.");
      return body as Dashboard;
    }
    try {
      const queued = await dashboard({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "replay_native_run", gameStatsId, confirmation: "RUN NATIVE REPLAY" }) });
      const runId = queued.activeRun?.id;
      if (!runId) throw new Error("The queued control run identity is unavailable.");
      if (mounted.current) setControlMessage(`Control #${gameStatsId} · ${runId} · queued for the Mac bridge.`);
      const deadline = Date.now() + 12 * 60 * 1000;
      while (mounted.current && Date.now() < deadline) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 3000));
        if (!mounted.current) return;
        const state = await dashboard();
        const run = state.activeRun?.id === runId ? state.activeRun : state.recentRuns?.find((item) => item.id === runId);
        if (!run) continue;
        if (["queued", "claimed", "running"].includes(run.status)) { setControlMessage(`Control #${gameStatsId} · ${runId} · ${run.status}.`); continue; }
        const referee = run.result?.trustedControlValidation?.status;
        setControlMessage(`Control #${gameStatsId} · ${run.status} · terminal ${run.result?.terminalOutcomeProven === true ? "witness recorded" : "not proven"}${referee ? ` · referee ${referee}` : ""}${run.error ? ` · ${run.error}` : ""}. Unknown execution remains gated.`);
        return;
      }
      if (mounted.current) setControlMessage(`Control #${gameStatsId} · ${runId} remains receipt-tracked in AoE2WAR OS. Refresh OS status to continue observing.`);
    } catch (failure) {
      if (mounted.current) setControlMessage(failure instanceof Error ? failure.message : "Native control unavailable.");
    } finally { if (mounted.current) setControlBusy(false); }
  }

  return <section className="border-t border-white/[0.06] bg-slate-950/80 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/65"><ClipboardCheck className="h-4 w-4" /> Player Result Recovery</div>
        <h3 className="mt-2 text-xl font-semibold text-white">Plan the next evidence recovery</h3>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">Exact Steam identities, canonical logical battles and one job per replay. This census uses the existing public result and roster contracts.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-2 text-xs font-semibold text-cyan-50 disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Build dry-run plan</button>
    </div>
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-xs font-semibold text-slate-200">Known-result control ladder</p>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">Run 32388 first, then trusted 1v1, team and 4v4 controls. The server resolves the exact archive, roster and expected outcome. Unknown results and financial exposure fail closed.</p>
      <div className="mt-2 flex flex-wrap items-center gap-3"><label className="text-xs text-slate-300">Canonical GameStats ID <input value={controlId} inputMode="numeric" onChange={(event) => setControlId(event.target.value)} disabled={controlBusy} className="ml-2 w-24 rounded-lg border border-white/10 bg-slate-900 px-2 py-2" /></label><button type="button" onClick={() => void runKnownControl()} disabled={controlBusy} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-2 text-xs font-semibold text-cyan-50 disabled:opacity-50">{controlBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Run known control</button></div>
      {controlMessage ? <p role="status" className="mt-3 text-xs leading-5 text-cyan-100">{controlMessage}</p> : null}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
      <label>Players <select value={target} onChange={(event) => { setTarget(event.target.value as PlayerResultRecoveryTarget); setPlan(null); }} className="ml-2 rounded-lg border border-white/10 bg-slate-900 px-3 py-2">{targets.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
      <label>Next batch cap <input type="number" min={1} max={10} value={maxGames} onChange={(event) => { setMaxGames(Number(event.target.value)); setPlan(null); }} className="ml-2 w-16 rounded-lg border border-white/10 bg-slate-900 px-2 py-2" /></label>
      <span>Sequential · concurrency 1</span>
    </div>
    {error ? <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p> : null}
    {plan ? <>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Player unknowns · Full Truth", plan.counts.unknownPlayerCount], ["Player result unknowns", plan.counts.unknownResultPlayerCount], ["Distinct logical battles", plan.counts.distinctLogicalBattles], ["Distinct replay jobs", plan.counts.distinctReplayJobs], ["Archive present", plan.counts.artifactPresent], ["Parser / roster recovery", plan.counts.parserRecoverable], ["Native structural candidates", plan.counts.nativeReplayEligible], ["Human review", plan.counts.humanReview], ["Source missing", plan.counts.sourceMissing], ["Recovered by this plan", plan.counts.recoveredDuringCampaign]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>)}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Unknown-result execution is gated until the independent native control ladder passes. Structural eligibility grants no result authority. Commissioner review uses the existing battle verdict rail; bets, claims, settlement and Wolo receive no authority.</p></div>
      <p className="mt-3 text-[11px] text-slate-500">Observed <TimeDisplayText value={plan.generatedAt} /> · Plan {plan.planSha256.slice(0, 16)} · No worker scheduled or database writes.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="pb-2">Player</th><th>Total battles</th><th>Full Truth unknown</th><th>Result unknown</th></tr></thead><tbody>{plan.players.map((player) => <tr key={player.steamId} className="border-t border-white/5 text-slate-300"><td className="py-2">{player.name}<span className="mt-1 block text-[10px] text-slate-500">{player.steamId}</span></td><td>{player.totalBattles}</td><td>{player.unknownFullTruth}</td><td>{player.unknownResults}</td></tr>)}</tbody></table></div>
      <div className="mt-4 flex flex-wrap gap-2">{Object.entries(plan.routeCounts).filter(([, count]) => count > 0).map(([route, count]) => <span key={route} className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-slate-400">{route.replaceAll("_", " ")}: {count}</span>)}</div>
      <div className="mt-4 max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="pb-2">Battle / replay</th><th>Recovery route</th><th>Blocker / review</th></tr></thead><tbody>{plan.cases.map((game) => <tr key={game.replaySha256 || game.logicalBattleIds.join("|")} className="border-t border-white/5 align-top text-slate-300"><td className="py-3 pr-3"><Link href={game.reviewHref} className="font-semibold text-cyan-100">#{game.canonicalGameStatsId}</Link><span className="mt-1 block text-[10px] text-slate-500">{game.replaySha256.slice(0, 16)} · {game.sourceGameStatsIds.length} source rows</span></td><td className="py-3 pr-3">{game.primaryRoute.replaceAll("_", " ")}</td><td className="py-3"><p className="max-w-xl text-[10px] text-slate-500">{game.blockers.join("; ") || "No structural blockers"}</p><Link href={game.reviewHref} className="mt-1 inline-block text-cyan-100">Open existing verdict review</Link></td></tr>)}</tbody></table></div>
    </> : <p className="mt-4 text-xs text-slate-500">Build a fresh plan to inspect player counts, archive coverage and the recovery route for every unresolved battle.</p>}
  </section>;
}
