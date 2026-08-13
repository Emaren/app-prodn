import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import GameStatsHero from "@/components/game-stats/GameStatsHero";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import {
  loadPublicParserObservatory,
  loadViewerParserVault,
} from "@/lib/parserObservatory";
import {
  loadPageHeroChain,
  normalizePageHeroView,
} from "@/lib/pageHeroes";
import { HD_REPLAY_PARSER_CONTRACT } from "@/lib/replayEngineRoom";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

import "./game-stats-polish.css";

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

export default async function GameStatsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const view = normalizePageHeroView(resolvedSearchParams.view);
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const [data, vault, heroChain] = await Promise.all([
    loadPublicParserObservatory(),
    loadViewerParserVault(claims?.uid ?? null),
    loadPageHeroChain("game-stats", view),
  ]);
  const canonicalVersion = data.parser.versions.find(
    (version) =>
      version.parserName === HD_REPLAY_PARSER_CONTRACT.parserName &&
      version.parserVersion === HD_REPLAY_PARSER_CONTRACT.parserVersion
  ) ?? null;
  const fullJob = data.parser.jobs.find((job) => job.latestEvent?.eventType === "completed") ?? data.parser.jobs[0] ?? null;

  return (
    <main
      data-game-stats-view={view}
      className={`mx-auto w-full space-y-7 py-7 text-white transition-[max-width] duration-300 ${
        view === "basic"
          ? "max-w-[72rem]"
          : view === "advanced"
            ? "max-w-[82rem]"
            : "max-w-[90rem]"
      }`}
    >
      <GameStatsHero
        view={view}
        chain={heroChain}
        metrics={[
          { label: "Logical battles", value: data.corpus.uniqueLogicalBattles.toLocaleString() },
          { label: "Full battle truth", value: data.corpus.logicalBattleTruthComplete.toLocaleString() },
          { label: "Need result / roster truth", value: data.corpus.logicalBattleTruthIncomplete.toLocaleString() },
          { label: "Complete rosters", value: data.corpus.logicalRosterComplete.toLocaleString() },
          { label: "Incomplete rosters", value: data.corpus.logicalRosterIncomplete.toLocaleString() },
          { label: "Duplicate / rehost rows", value: data.corpus.duplicateBattleRecords.toLocaleString() },
        ]}
      />

      <section className="rounded-[1.9rem] border border-cyan-100/12 bg-[linear-gradient(145deg,rgba(7,21,34,0.96),rgba(2,6,23,0.92))] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Canonical Corpus Dictionary</div>
            <h2 className="mt-2 text-3xl font-semibold">One archive, three different counting grains.</h2>
          </div>
          <div className="max-w-xl text-sm leading-6 text-slate-400">
            Record counts, physical files, and player identities answer different questions. These labels are deliberately not interchangeable.
            <div className="mt-2 text-xs text-slate-500">
              Snapshot generated{" "}
              <TimeDisplayText value={data.generatedAt} includeYear />
              {" "}· database metrics refresh every 5 minutes; physical archive telemetry refreshes hourly.
            </div>
          </div>
        </div>

        <div className="game-stats-corpus-grid mt-6 grid gap-5 xl:grid-cols-3">
          <CorpusLayer title="Game-record grain" accent="text-cyan-100">
            <DefinitionMetric
              label="Final ingestion records"
              value={data.corpus.finalReplayRecords}
              definition="Final watcher/upload rows in GameStats. Saved sessions, rehosts, and repeated uploads can be valid rows, so this is not a unique logical-game count."
            />
            <DefinitionMetric
              label="Public battle records"
              value={data.corpus.publicBattleRecords}
              definition="Final rows eligible for the War Vault: completed or reviewable battle records after saved checkpoints and empty unparsed shells are excluded."
            />
            <DefinitionMetric
              label="Deduplicated public battle keys"
              value={data.corpus.uniqueLogicalBattles}
              definition={`Public battle rows deduplicated by the app’s current presentation identity. It currently folds ${data.corpus.duplicateBattleRecords.toLocaleString()} redundant row${data.corpus.duplicateBattleRecords === 1 ? "" : "s"} while preserving every source record.`}
            />
            <DefinitionMetric
              label="Duplicate / rehost records"
              value={data.corpus.duplicateBattleRecords}
              definition="Public-eligible ingestion rows folded into an already represented logical battle. They remain preserved as source records."
            />
            <DefinitionMetric
              label="Excluded non-battle records"
              value={data.corpus.excludedFinalRecords}
              definition="Preserved final rows intentionally kept out of the public battle archive, chiefly saved checkpoints and unparsed low-roster shells."
            />
            <DefinitionMetric
              label="Logical result resolved / unresolved"
              value={`${data.corpus.logicalResultResolved.toLocaleString()} / ${data.corpus.logicalResultUnresolved.toLocaleString()}`}
              definition="Outcome truth after public-battle filtering and logical deduplication. Unknown results stay out of resolved win-rate math."
            />
            <DefinitionMetric
              label="Logical roster complete / incomplete"
              value={`${data.corpus.logicalRosterComplete.toLocaleString()} / ${data.corpus.logicalRosterIncomplete.toLocaleString()}`}
              definition="Complete public participant identity plus a defensible 1v1 or balanced 2v2–4v4 team composition."
            />
            <DefinitionMetric
              label="Full battle truth / needs truth"
              value={`${data.corpus.logicalBattleTruthComplete.toLocaleString()} / ${data.corpus.logicalBattleTruthIncomplete.toLocaleString()}`}
              definition="A full-truth logical battle has both a defensible result and a complete public roster/team composition."
            />
          </CorpusLayer>

          <CorpusLayer title="Physical-file grain" accent="text-emerald-100">
            <DefinitionMetric
              label="Physical replay objects"
              value={data.corpus.physicalArchiveObjects ?? "Unavailable"}
              definition={data.corpus.physicalArchiveBytes === null
                ? "The immutable archive filesystem is not visible to this web process. This does not imply that the archive is empty."
                : (
                  <>
                    {bytes(data.corpus.physicalArchiveBytes)} of immutable source bytes:{" "}
                    {data.corpus.physicalRecordedObjects?.toLocaleString()} recorded-game objects and{" "}
                    {data.corpus.physicalSavedCheckpointObjects?.toLocaleString()} saved checkpoints. File objects
                    are not games. Scanned{" "}
                    <TimeDisplayText value={data.corpus.physicalArchiveScannedAt} includeYear />.
                  </>
                )}
              alert={!data.corpus.physicalArchiveAvailable}
            />
            <DefinitionMetric
              label="Engine-indexed artifacts"
              value={data.corpus.archivedArtifacts}
              definition={`Unique content-addressed artifacts represented in the Engine Room index, totaling ${bytes(data.corpus.archivedBytes)}. This is a subset of the physical archive.`}
            />
            <DefinitionMetric
              label="Decoded at some level"
              value={data.corpus.parseableAtAnyLevelArtifacts}
              definition="Engine-indexed artifacts whose latest candidate completed and recovered at least defensible structured evidence. This does not promise a winner or completed battle."
            />
            <DefinitionMetric
              label="Recorded-game / saved-checkpoint files"
              value={`${data.parser.frontier.recordedGameCandidates.toLocaleString()} / ${data.parser.frontier.savedSnapshots.toLocaleString()}`}
              definition="Recorded-game candidates are distinct from HD saved checkpoints, which remain non-final even when their roster, map, and checkpoint state parse."
            />
            <DefinitionMetric
              label="Unindexed / unclassified objects"
              value={data.corpus.unindexedOrUnclassifiedObjects ?? "Unavailable"}
              definition={`Physical paths not referenced by an indexed artifact storage key. They are retained unknowns—not parser failures and never presumed junk. ${data.corpus.indexedStorageKeysPresent?.toLocaleString() ?? "Unknown"} indexed storage keys were found; ${data.corpus.missingIndexedStorageKeys?.toLocaleString() ?? "unknown"} were missing.`}
              alert={(data.corpus.unindexedOrUnclassifiedObjects ?? 0) > 0 || (data.corpus.missingIndexedStorageKeys ?? 0) > 0}
            />
            <DefinitionMetric
              label="Current failures / irrecoverable recorded"
              value={`${data.corpus.recoveryQueueArtifacts.toLocaleString()} / ${data.corpus.confirmedIrrecoverableArtifacts.toLocaleString()}`}
              definition="A current failed candidate belongs in recovery review. Zero artifacts are recorded as irrecoverable, but a terminal junk ledger is not yet established, so the global never-parseable total remains unknown."
              alert={data.corpus.recoveryQueueArtifacts > 0 || data.corpus.confirmedIrrecoverableArtifacts > 0}
            />
          </CorpusLayer>

          <CorpusLayer title="Player-identity grain" accent="text-amber-100">
            <DefinitionMetric
              label="Provisional Warriors"
              value={data.corpus.provisionalWarriors}
              definition="Human/career identity records seeded one-for-one from replay-backed Steam accounts. They remain provisional until reviewed identity links are activated."
            />
            <DefinitionMetric
              label="Replay-backed Steam IDs"
              value={data.corpus.replayBackedSteamAccounts}
              definition="Unique exact SteamID64 accounts recoverable from accepted replay-player evidence. A Steam account is not automatically the same thing as one human."
            />
            <DefinitionMetric
              label="Steam IDs with multiple names"
              value={data.corpus.steamAccountsWithMultipleNames}
              definition="Accounts observed under more than one normalized display name. These aliases fold into one account row while remaining visible as history."
            />
            <DefinitionMetric
              label="Name-only identity buckets"
              value={data.corpus.nameOnlyIdentityBuckets}
              definition="Lower-confidence replay identities with no exact Steam ID. They remain separate and are never auto-merged into Steam accounts."
            />
            <DefinitionMetric
              label="Profile-only Steam accounts"
              value={data.corpus.profileOnlyPlatformAccounts}
              definition="Site-profile Steam IDs with no accepted replay evidence. They do not seed a Warrior and do not enter replay-backed leaderboard totals."
            />
            <DefinitionMetric
              label="Observed names / cross-account collisions"
              value={`${data.corpus.observedDisplayNames.toLocaleString()} / ${data.corpus.namesUsedByMultipleSteamAccounts.toLocaleString()}`}
              definition="Observed names are presentation strings, not people. The collision count shows normalized names used by more than one exact Steam account."
            />
            <DefinitionMetric
              label="Proposed / active links"
              value={`${data.corpus.proposedPlatformLinks.toLocaleString()} / ${data.corpus.activePlatformLinks.toLocaleString()}`}
              definition={`Identity discovery is shadow-safe: ${data.corpus.proposedWarriorClaims.toLocaleString()} site claims are proposed, ${data.corpus.activeWarriorClaims.toLocaleString()} are active, and ${data.corpus.identityPublications.toLocaleString()} identity projections have been published.`}
            />
          </CorpusLayer>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Full Battle Truth</div><h2 className="mt-2 text-3xl font-semibold">{data.corpus.logicalBattleTruthComplete.toLocaleString()} / {data.corpus.uniqueLogicalBattles.toLocaleString()} logical battles have winner + complete roster truth</h2></div><div className="text-2xl font-semibold text-cyan-100">{percent(data.corpus.logicalBattleTruthCoverageBps)}</div></div>
          <Progress value={data.corpus.logicalBattleTruthCoverageBps} />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Mini label="Result truth" value={`${data.corpus.logicalResultResolved.toLocaleString()} · ${percent(data.corpus.logicalResultCoverageBps)}`} />
            <Mini label="Roster truth" value={`${data.corpus.logicalRosterComplete.toLocaleString()} · ${percent(data.corpus.logicalRosterCoverageBps)}`} />
            <Mini label="Need result only" value={data.corpus.logicalNeedsResultOnly.toLocaleString()} />
            <Mini label="Need roster only" value={data.corpus.logicalNeedsRosterOnly.toLocaleString()} />
            <Mini label="Need both" value={data.corpus.logicalNeedsBoth.toLocaleString()} />
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-400">This denominator is the deduplicated public logical-battle corpus. A battle reaches full truth only when the public result is defensible and the participant roster/team composition is complete. Final ingestion records, physical files, parser artifacts, and duplicate/rehost rows remain visible separately above.</p>
        </div>
        <div className="rounded-[1.8rem] border border-amber-200/14 bg-amber-300/[0.055] p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Canonical Parser Contract</div><h2 className="mt-3 text-2xl font-semibold">{HD_REPLAY_PARSER_CONTRACT.parserName} {HD_REPLAY_PARSER_CONTRACT.parserVersion}</h2><div className="mt-4 space-y-2 text-sm text-slate-300">{canonicalVersion ? <><Line label="Evidence pass" value={`${canonicalVersion.passName} v${canonicalVersion.passVersion}`} /><Line label="Schema" value={canonicalVersion.schemaVersion} /><Line label="Latest canonical run" value={canonicalVersion.latestAt ? <TimeDisplayText value={canonicalVersion.latestAt} includeYear /> : "Not recorded"} /></> : <Line label="Catalog" value="No canonical run recorded yet" />}<Line label="Candidate runs" value={data.parser.totalRuns.toLocaleString()} /><Line label="Observations preserved" value={compact(data.parser.observations)} /><Line label="Action packets cataloged" value={compact(data.parser.totalActions)} /></div></div>
      </section>

      {view !== "basic" ? (
<section className="rounded-[1.9rem] border border-emerald-200/18 bg-[radial-gradient(circle_at_12%_0%,rgba(52,211,153,0.14),transparent_34%),rgba(2,6,23,0.82)] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><div className="text-xs uppercase tracking-[0.3em] text-emerald-100/60">The 329 Frontier Is Broken</div><h2 className="mt-2 text-3xl font-semibold">Every archived artifact now has a latest candidate disposition.</h2></div>
          <div className="text-right"><div className="text-3xl font-semibold text-emerald-100">{data.parser.frontier.completed.toLocaleString()} / {data.parser.frontier.artifacts.toLocaleString()}</div><div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-emerald-100/55">latest candidates accounted</div></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Current candidate failures" value={data.parser.frontier.failed.toLocaleString()} alert={data.parser.frontier.failed > 0} />
          <Metric label="Recorded-game candidates" value={data.parser.frontier.recordedGameCandidates.toLocaleString()} />
          <Metric label="Saved checkpoints · non-final" value={data.parser.frontier.savedSnapshots.toLocaleString()} />
          <Metric label="Strict result corrections" value={data.parser.frontier.effectiveResultCorrections.toLocaleString()} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.parser.frontier.modes.map((mode) => <div key={mode.key} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.035] p-4"><div><div className="text-sm font-semibold text-white">{mode.label}</div><code className="mt-1 block break-all text-[10px] text-slate-500">{mode.key}</code></div><span className="text-xl font-semibold text-amber-100">{mode.count.toLocaleString()}</span></div>)}</div>
        <p className="mt-6 text-sm leading-6 text-slate-400">Candidate completion is not automatic public truth. Saved-game snapshots preserve roster, map, and checkpoint evidence but never count as completed battles. Effective corrections require separate review, a content-addressed receipt, and a zero-financial-impact gate.</p>
      </section>
      ) : null}

      {vault ? <section className="rounded-[1.8rem] border border-emerald-200/14 bg-emerald-300/[0.055] p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-emerald-100/60">Your Vault</div><div className="mt-4 grid gap-3 sm:grid-cols-5"><Metric label="Your battles" value={vault.total.toLocaleString()} /><Metric label="Resolved" value={vault.resolved.toLocaleString()} /><Metric label="Unknown" value={vault.unknown.toLocaleString()} alert={vault.unknown > 0} /><Metric label="Teams resolved" value={vault.teamsResolved.toLocaleString()} /><Metric label="Result coverage" value={percent(vault.resultCoverageBps)} /></div></section> : null}

      {view !== "basic" ? (
<section className="grid gap-5 xl:grid-cols-2">
        <RankPanel title="Unknowns by replay owner" rows={data.unknowns.byOwner} />
        <RankPanel title="Unknowns by warrior in roster" rows={data.unknowns.byRosterPlayer} />
        <RankPanel title="Unknowns by result reason" rows={data.unknowns.byReason} />
        <RankPanel title="Unknowns by replay game type" rows={data.unknowns.byGameType} />
      </section>
      ) : null}

      {view === "extreme" ? (
<section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Extraction Coverage</div><h2 className="mt-2 text-3xl font-semibold">Stats currently acquired</h2></div><div className="text-sm text-slate-500">Top {data.parser.fields.length} observed fields</div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.parser.fields.slice(0, 30).map((field) => <div key={field.fieldPath} className="rounded-xl border border-white/8 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><code className="break-all text-xs text-cyan-100">{field.fieldPath}</code><span className="shrink-0 text-xs text-slate-500">{field.observations.toLocaleString()}</span></div><div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">{field.minConfidenceBps === null ? "Experimental / unscored" : field.minConfidenceBps === field.maxConfidenceBps ? `${percent(field.minConfidenceBps)} confidence rubric` : `${percent(field.minConfidenceBps)}–${percent(field.maxConfidenceBps || field.minConfidenceBps)} confidence rubric`}</div></div>)}</div></section>
      ) : null}

      {view === "extreme" ? (
<section className="rounded-[1.8rem] border border-amber-200/13 bg-amber-300/[0.045] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Advanced Evidence Front</div><h2 className="mt-2 text-3xl font-semibold">Captured is not the same as proven.</h2></div><div className="max-w-md text-sm leading-6 text-slate-400">These are structured evidence lanes. Experimental fields stay out of player truth and AI claims until their semantics are scored.</div></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.parser.advancedLanes.map((lane) => <article key={lane.key} className="rounded-2xl border border-white/8 bg-slate-950/55 p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-lg font-semibold">{lane.label}</h3><span className={`rounded-full border px-3 py-1 text-[9px] uppercase tracking-[0.16em] ${lane.maturity === "validated" ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100" : lane.maturity === "mixed" ? "border-amber-200/20 bg-amber-300/10 text-amber-100" : "border-cyan-200/16 bg-cyan-300/[0.07] text-cyan-100"}`}>{lane.maturity}</span></div><div className="mt-4 flex items-end gap-3"><span className="text-3xl font-semibold text-white">{lane.observations.toLocaleString()}</span><span className="pb-1 text-xs text-slate-500">observations</span></div><div className="mt-2 text-xs text-slate-500">{lane.scoredObservations.toLocaleString()} confidence-scored · {lane.supportingFieldsPresent}/{lane.supportingFieldsTotal} supporting fields</div><p className="mt-4 text-sm leading-6 text-slate-400">{lane.truthRule}</p></article>)}</div>
      </section>
      ) : null}

      {view === "extreme" ? (
<section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]"><div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Latest Engine Room Campaign</div>{fullJob ? <><h2 className="mt-3 text-3xl font-semibold">{fullJob.maxArtifacts.toLocaleString()}-artifact bounded manifest</h2><div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Processed" value={(fullJob.latestEvent?.processedCount ?? 0).toLocaleString()} /><Mini label="Full candidates" value={(fullJob.latestEvent?.succeededCount ?? 0).toLocaleString()} /><Mini label="Structured failures" value={(fullJob.latestEvent?.failedCount ?? 0).toLocaleString()} /></div><p className="mt-5 text-sm leading-6 text-slate-400">Status: <span className="text-emerald-100">{fullJob.latestEvent?.eventType || "queued"}</span>. Candidate-only: {fullJob.candidateOnly ? "yes" : "no"}. Public aggregates affected: {fullJob.affectsPublicAggregates ? "yes" : "no"}.</p></> : <div className="mt-4 text-slate-500">No bounded parser campaign is cataloged.</div>}</div><div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-rose-100/55">Historical Candidate Failure Signatures</div><div className="mt-4 space-y-2">{data.parser.failures.map((failure) => <div key={failure.signature} className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><code className="break-all text-[11px] text-slate-300">{failure.signature}</code><span className="shrink-0 text-sm font-semibold text-rose-100">{failure.count}</span></div></div>)}</div></div></section>
      ) : null}

      {view !== "basic" ? (
<section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Battles Remaining in the Fog</div><div className="mt-5 grid gap-4 lg:grid-cols-2">{data.unknowns.latest.map((game) => <article key={game.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Battle #{game.id} · {game.owner}</div><h3 className="mt-2 text-lg font-semibold">{game.players.length ? game.players.join(" · ") : "Roster unavailable"}</h3></div><span className="rounded-full border border-amber-200/15 bg-amber-300/[0.07] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-amber-100">Needs proof</span></div><div className="mt-3 text-sm text-slate-400">{game.mapName} · {game.gameType} · {game.parseReason}</div><div className="mt-3 text-xs leading-5 text-slate-500">Needed: {game.neededEvidence.join(", ") || "human review or stronger final evidence"}</div><Link href={`/game-stats/${game.id}`} className="mt-4 inline-flex rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white">Open battle record</Link></article>)}</div></section>
      ) : null}

      <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Recently Decoded</div><h2 className="mt-2 text-3xl font-semibold">Deep battle records</h2></div><div className="flex gap-2"><Link href="/upload" className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950">Upload history</Link><Link href="/download" className="rounded-full border border-white/12 px-4 py-2 text-xs font-semibold">Download Watcher</Link></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{data.recentDecodes.map((game) => <article key={game.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">Battle #{game.id}</span><div className="flex gap-2"><Pill>{game.teamsResolved ? `Teams ${game.teamConfidence}` : "Teams unresolved"}</Pill><Pill>{game.winner ? `Result ${game.resultConfidence}` : "Result review"}</Pill></div></div><h3 className="mt-3 text-xl font-semibold">{game.players.length ? game.players.join(" · ") : "Replay roster"}</h3><div className="mt-2 text-sm text-slate-400">{game.mapName}{game.winner ? ` · ${game.winner} victorious` : " · winner under review"}</div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{game.teamProvenance}</span><Link href={`/game-stats/${game.id}`} className="text-sm font-semibold text-cyan-100">Open →</Link></div></article>)}</div></section>

      {view !== "basic" ? (
<section className="grid gap-4 md:grid-cols-2"><Roadmap title="Under active research" items={["Postgame tables and exact end-screen statistics", "Validated action-rate and eAPM semantics", "Kills, losses, resource totals, and peak army", "Controlled HD playback and screenshot/OCR evidence"]} /><Roadmap title="Truth law" items={["Explicit replay team IDs only, including valid team 0", "No player-order team assignment", "No uploader-loss or player-one winner fabrication", "Candidate parser output never rewrites public or financial truth"]} /></section>
      ) : null}
    </main>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div className={`rounded-2xl border p-4 ${alert ? "border-amber-200/18 bg-amber-300/[0.07]" : "border-white/10 bg-black/22"}`}><div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div><div className={`mt-2 text-xl font-semibold ${alert ? "text-amber-100" : "text-white"}`}>{value}</div></div>; }
function CorpusLayer({ title, accent, children }: { title: string; accent: string; children: ReactNode }) { return <article className="game-stats-corpus-layer rounded-[1.5rem] border border-white/9 bg-black/20 p-5"><h3 className={`text-sm font-semibold uppercase tracking-[0.22em] ${accent}`}>{title}</h3><div className="mt-4 space-y-3">{children}</div></article>; }
function DefinitionMetric({ label, value, definition, alert = false }: { label: string; value: number | string; definition: ReactNode; alert?: boolean }) { return <div className={`game-stats-definition-metric rounded-xl border p-4 ${alert ? "border-amber-200/18 bg-amber-300/[0.055]" : "border-white/8 bg-white/[0.025]"}`}><div className="flex items-start justify-between gap-4"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div><div className={`shrink-0 text-lg font-semibold tabular-nums ${alert ? "text-amber-100" : "text-white"}`}>{typeof value === "number" ? value.toLocaleString() : value}</div></div><p className="mt-2 text-xs leading-5 text-slate-400">{definition}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value}</div></div>; }
function Line({ label, value }: { label: string; value: ReactNode }) { return <div className="flex items-start justify-between gap-4 border-b border-white/7 pb-2"><span className="text-slate-500">{label}</span><span className="break-all text-right text-slate-200">{value}</span></div>; }
function Progress({ value }: { value: number }) { return <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-amber-300" style={{ width: `${Math.max(0, Math.min(100, value / 100))}%` }} /></div>; }
function RankPanel({ title, rows }: { title: string; rows: Array<{ key: string; count: number }> }) { const max = rows[0]?.count || 1; return <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4 space-y-3">{rows.length ? rows.map((row) => <div key={row.key}><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-slate-300">{row.key}</span><span className="font-semibold text-amber-100">{row.count}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-cyan-300/65" style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} /></div></div>) : <div className="text-sm text-slate-500">No unresolved rows in this category.</div>}</div></section>; }
function Pill({ children }: { children: ReactNode }) { return <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">{children}</span>; }
function Roadmap({ title, items }: { title: string; items: string[] }) { return <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/75 p-6"><h2 className="text-2xl font-semibold">{title}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">{items.map((item) => <li key={item} className="flex gap-3"><span className="text-cyan-200">◆</span><span>{item}</span></li>)}</ul></section>; }
