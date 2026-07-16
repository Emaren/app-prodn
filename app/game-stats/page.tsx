import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  loadPublicParserObservatory,
  loadViewerParserVault,
} from "@/lib/parserObservatory";
import { HD_REPLAY_PARSER_CONTRACT } from "@/lib/replayEngineRoom";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

function percent(bps: number) {
  return `${(bps / 100).toFixed(1)}%`;
}

function bytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(value / 1024).toLocaleString()} KB`;
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export default async function GameStatsPage() {
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const [data, vault] = await Promise.all([
    loadPublicParserObservatory(),
    loadViewerParserVault(claims?.uid ?? null),
  ]);
  const canonicalVersion = data.parser.versions.find(
    (version) =>
      version.parserName === HD_REPLAY_PARSER_CONTRACT.parserName &&
      version.parserVersion === HD_REPLAY_PARSER_CONTRACT.parserVersion
  ) ?? null;
  const fullJob = data.parser.jobs.find((job) => job.latestEvent?.eventType === "completed") ?? data.parser.jobs[0] ?? null;

  return (
    <main className="space-y-7 py-7 text-white">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-cyan-100/12 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.16),transparent_31%),radial-gradient(circle_at_88%_14%,rgba(251,191,36,0.15),transparent_29%),linear-gradient(145deg,#071522,#05070d_62%)] p-7 sm:p-11">
        <div className="text-xs font-bold uppercase tracking-[0.42em] text-cyan-100/62">Public Parser Observatory</div>
        <h1 className="mt-4 max-w-5xl font-serif text-5xl leading-none sm:text-7xl">Recovering the lost war record.</h1>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Logical battles" value={data.corpus.logicalGames.toLocaleString()} />
          <Metric label="Results resolved" value={data.corpus.resolvedResults.toLocaleString()} />
          <Metric label="Battles in the fog" value={data.corpus.unresolvedResults.toLocaleString()} alert={data.corpus.unresolvedResults > 0} />
          <Metric label="Warriors represented" value={data.corpus.playersRepresented.toLocaleString()} />
          <Metric label="Replay vault" value={bytes(data.corpus.archivedBytes)} />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Replay Truth Progress</div><h2 className="mt-2 text-3xl font-semibold">{data.corpus.resolvedResults.toLocaleString()} / {data.corpus.logicalGames.toLocaleString()} results resolved</h2></div><div className="text-2xl font-semibold text-cyan-100">{percent(data.corpus.resultCoverageBps)}</div></div>
          <Progress value={data.corpus.resultCoverageBps} />
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Team-resolved" value={`${data.corpus.resolvedTeams.toLocaleString()} · ${percent(data.corpus.teamCoverageBps)}`} /><Mini label="Needs result/team review" value={data.corpus.reviewRequired.toLocaleString()} /><Mini label="Archived source files" value={data.corpus.archivedArtifacts.toLocaleString()} /></div>
          <p className="mt-5 text-sm leading-6 text-slate-400">Unknowns stay visible here. They are excluded from resolved-result statistics until replay evidence or append-only adjudication establishes a defensible winner.</p>
        </div>
        <div className="rounded-[1.8rem] border border-amber-200/14 bg-amber-300/[0.055] p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Canonical Parser Contract</div><h2 className="mt-3 text-2xl font-semibold">{HD_REPLAY_PARSER_CONTRACT.parserName} {HD_REPLAY_PARSER_CONTRACT.parserVersion}</h2><div className="mt-4 space-y-2 text-sm text-slate-300">{canonicalVersion ? <><Line label="Evidence pass" value={`${canonicalVersion.passName} v${canonicalVersion.passVersion}`} /><Line label="Schema" value={canonicalVersion.schemaVersion} /><Line label="Latest canonical run" value={canonicalVersion.latestAt ? new Date(canonicalVersion.latestAt).toLocaleString() : "Not recorded"} /></> : <Line label="Catalog" value="No canonical run recorded yet" />}<Line label="Candidate runs" value={data.parser.totalRuns.toLocaleString()} /><Line label="Observations preserved" value={compact(data.parser.observations)} /><Line label="Action packets cataloged" value={compact(data.parser.totalActions)} /></div></div>
      </section>

      {vault ? <section className="rounded-[1.8rem] border border-emerald-200/14 bg-emerald-300/[0.055] p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-emerald-100/60">Your Vault</div><div className="mt-4 grid gap-3 sm:grid-cols-5"><Metric label="Your battles" value={vault.total.toLocaleString()} /><Metric label="Resolved" value={vault.resolved.toLocaleString()} /><Metric label="Unknown" value={vault.unknown.toLocaleString()} alert={vault.unknown > 0} /><Metric label="Teams resolved" value={vault.teamsResolved.toLocaleString()} /><Metric label="Result coverage" value={percent(vault.resultCoverageBps)} /></div></section> : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <RankPanel title="Unknowns by replay owner" rows={data.unknowns.byOwner} />
        <RankPanel title="Unknowns by warrior in roster" rows={data.unknowns.byRosterPlayer} />
        <RankPanel title="Unknowns by result reason" rows={data.unknowns.byReason} />
        <RankPanel title="Unknowns by replay game type" rows={data.unknowns.byGameType} />
      </section>

      <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Extraction Coverage</div><h2 className="mt-2 text-3xl font-semibold">Stats currently acquired</h2></div><div className="text-sm text-slate-500">Top {data.parser.fields.length} observed fields</div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.parser.fields.slice(0, 30).map((field) => <div key={field.fieldPath} className="rounded-xl border border-white/8 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><code className="break-all text-xs text-cyan-100">{field.fieldPath}</code><span className="shrink-0 text-xs text-slate-500">{field.observations.toLocaleString()}</span></div><div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">{field.minConfidenceBps === null ? "Experimental / unscored" : field.minConfidenceBps === field.maxConfidenceBps ? `${percent(field.minConfidenceBps)} confidence rubric` : `${percent(field.minConfidenceBps)}–${percent(field.maxConfidenceBps || field.minConfidenceBps)} confidence rubric`}</div></div>)}</div></section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]"><div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Latest Engine Room Campaign</div>{fullJob ? <><h2 className="mt-3 text-3xl font-semibold">{fullJob.maxArtifacts.toLocaleString()}-artifact bounded manifest</h2><div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Processed" value={(fullJob.latestEvent?.processedCount ?? 0).toLocaleString()} /><Mini label="Full candidates" value={(fullJob.latestEvent?.succeededCount ?? 0).toLocaleString()} /><Mini label="Structured failures" value={(fullJob.latestEvent?.failedCount ?? 0).toLocaleString()} /></div><p className="mt-5 text-sm leading-6 text-slate-400">Status: <span className="text-emerald-100">{fullJob.latestEvent?.eventType || "queued"}</span>. Candidate-only: {fullJob.candidateOnly ? "yes" : "no"}. Public aggregates affected: {fullJob.affectsPublicAggregates ? "yes" : "no"}.</p></> : <div className="mt-4 text-slate-500">No bounded parser campaign is cataloged.</div>}</div><div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-rose-100/55">Historical Candidate Failure Signatures</div><div className="mt-4 space-y-2">{data.parser.failures.map((failure) => <div key={failure.signature} className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><code className="break-all text-[11px] text-slate-300">{failure.signature}</code><span className="shrink-0 text-sm font-semibold text-rose-100">{failure.count}</span></div></div>)}</div></div></section>

      <section className="rounded-[1.8rem] border border-cyan-100/12 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.10),transparent_35%),rgba(2,6,23,0.76)] p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">{data.parser.failureRecovery.total.toLocaleString()}-Failure Recovery Map</div><h2 className="mt-2 text-3xl font-semibold">Every current failure has a lane.</h2></div><div className="text-right"><div className="text-2xl font-semibold text-cyan-100">{data.parser.failureRecovery.classified.toLocaleString()} / {data.parser.failureRecovery.total.toLocaleString()}</div><div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">classified · not promoted</div></div></div><div className="mt-6 grid gap-4 lg:grid-cols-3">{data.parser.failureRecovery.lanes.map((lane) => <article key={lane.key} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"><div className="text-3xl font-semibold text-amber-100">{lane.count.toLocaleString()}</div><h3 className="mt-3 text-lg font-semibold">{lane.label}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{lane.disposition}</p></article>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Mini label="Formats" value={data.parser.failureRecovery.extensions.map((row) => `${row.key} ${row.count}`).join(" · ")} /><Mini label="Largest size cohorts" value={data.parser.failureRecovery.sizes.map((row) => `${row.key} ${row.count}`).join(" · ")} /></div><p className="mt-5 text-sm leading-6 text-slate-400">This map uses the latest immutable candidate run per artifact, so a later compatibility success retires an older failure without rewriting it. All {data.parser.failureRecovery.total.toLocaleString()} current failures remain outside effective public truth. Saved-game <code className="text-cyan-100">.aoe2mpgame</code> files stay in a format-specific playback lane.</p></section>

      <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Battles Remaining in the Fog</div><div className="mt-5 grid gap-4 lg:grid-cols-2">{data.unknowns.latest.map((game) => <article key={game.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Battle #{game.id} · {game.owner}</div><h3 className="mt-2 text-lg font-semibold">{game.players.length ? game.players.join(" · ") : "Roster unavailable"}</h3></div><span className="rounded-full border border-amber-200/15 bg-amber-300/[0.07] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-amber-100">Needs proof</span></div><div className="mt-3 text-sm text-slate-400">{game.mapName} · {game.gameType} · {game.parseReason}</div><div className="mt-3 text-xs leading-5 text-slate-500">Needed: {game.neededEvidence.join(", ") || "human review or stronger final evidence"}</div><Link href={`/game-stats/${game.id}`} className="mt-4 inline-flex rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white">Open battle record</Link></article>)}</div></section>

      <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Recently Decoded</div><h2 className="mt-2 text-3xl font-semibold">Deep battle records</h2></div><div className="flex gap-2"><Link href="/upload" className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950">Upload history</Link><Link href="/download" className="rounded-full border border-white/12 px-4 py-2 text-xs font-semibold">Download Watcher</Link></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{data.recentDecodes.map((game) => <article key={game.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">Battle #{game.id}</span><div className="flex gap-2"><Pill>{game.teamsResolved ? `Teams ${game.teamConfidence}` : "Teams unresolved"}</Pill><Pill>{game.winner ? `Result ${game.resultConfidence}` : "Result review"}</Pill></div></div><h3 className="mt-3 text-xl font-semibold">{game.players.length ? game.players.join(" · ") : "Replay roster"}</h3><div className="mt-2 text-sm text-slate-400">{game.mapName}{game.winner ? ` · ${game.winner} victorious` : " · winner under review"}</div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{game.teamProvenance}</span><Link href={`/game-stats/${game.id}`} className="text-sm font-semibold text-cyan-100">Open →</Link></div></article>)}</div></section>

      <section className="grid gap-4 md:grid-cols-2"><Roadmap title="Under active research" items={["Postgame tables and exact end-screen statistics", "Validated action-rate and eAPM semantics", "Kills, losses, resource totals, and peak army", "Controlled HD playback and screenshot/OCR evidence"]} /><Roadmap title="Truth law" items={["Explicit replay team IDs only, including valid team 0", "No player-order team assignment", "No uploader-loss or player-one winner fabrication", "Candidate parser output never rewrites public or financial truth"]} /></section>
    </main>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div className={`rounded-2xl border p-4 ${alert ? "border-amber-200/18 bg-amber-300/[0.07]" : "border-white/10 bg-black/22"}`}><div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div><div className={`mt-2 text-xl font-semibold ${alert ? "text-amber-100" : "text-white"}`}>{value}</div></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value}</div></div>; }
function Line({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-white/7 pb-2"><span className="text-slate-500">{label}</span><span className="break-all text-right text-slate-200">{value}</span></div>; }
function Progress({ value }: { value: number }) { return <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-amber-300" style={{ width: `${Math.max(0, Math.min(100, value / 100))}%` }} /></div>; }
function RankPanel({ title, rows }: { title: string; rows: Array<{ key: string; count: number }> }) { const max = rows[0]?.count || 1; return <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4 space-y-3">{rows.length ? rows.map((row) => <div key={row.key}><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-slate-300">{row.key}</span><span className="font-semibold text-amber-100">{row.count}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-cyan-300/65" style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} /></div></div>) : <div className="text-sm text-slate-500">No unresolved rows in this category.</div>}</div></section>; }
function Pill({ children }: { children: ReactNode }) { return <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">{children}</span>; }
function Roadmap({ title, items }: { title: string; items: string[] }) { return <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/75 p-6"><h2 className="text-2xl font-semibold">{title}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">{items.map((item) => <li key={item} className="flex gap-3"><span className="text-cyan-200">◆</span><span>{item}</span></li>)}</ul></section>; }
