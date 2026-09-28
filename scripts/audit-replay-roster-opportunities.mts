/** Read-only inventory/audit. No apply mode and no mutation API is imported. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readWorkshopReceiptInventory } from "./census-watcher-receipt-yield.mts";

type Row = Record<string, any>;
const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? String(x) : x);
const hash = (v: unknown) => createHash("sha256").update(json(v)).digest("hex");
export const DISPOSITIONS = ["complete_recovery_candidate", "partial_roster_evidence", "identity_ambiguity", "side_team_ambiguity", "topology_ambiguity", "source_archive_missing", "parser_evidence_disagreement", "disconnected_review_desync", "other"];
export function parseAuditArguments(args: string[]) {
  const opts: Row = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--receipt-dir", "--archive-dir", "--baseline"].includes(args[i]) || !args[i + 1] || opts[args[i]]) throw Error("invalid_audit_argument");
    opts[args[i]] = args[i + 1];
  }
  for (const key of ["--receipt-dir", "--archive-dir", "--baseline"]) if (!isAbsolute(opts[key] || "")) throw Error("absolute_paths_required");
  return { receiptDirectory: opts["--receipt-dir"], archiveDirectory: opts["--archive-dir"], baseline: opts["--baseline"] };
}
export function rosterOpportunities(inventory: Row) {
  const cases = inventory.unresolved.filter((r: Row) => r.resultEligible === true && r.rosterComplete === false);
  if (new Set(cases.map((r: Row) => r.gameStatsId)).size !== cases.length) throw Error("duplicate_logical_battle");
  return cases.sort((a: Row, b: Row) => Number(Boolean(b.registeredPlayerIds.length)) - Number(Boolean(a.registeredPlayerIds.length)) || a.gameStatsId - b.gameStatsId);
}
/** One primary disposition; every original blocker remains in the case packet. */
export function classifyRosterCase(blockers: string[], authoritativeParticipants: number) {
  const first = (pattern: RegExp) => blockers.find((r) => pattern.test(r));
  const choices: [string, RegExp][] = [
    ["disconnected_review_desync", /disconnect|desync|adjudication|linked_markets|linked_claims|existing_roster_promotion|already_applied/],
    ["parser_evidence_disagreement", /mismatch|contradict|conflict|hash_invalid|authority_invalid|authority_changed|winner_flag|duplicate_/],
    ["source_archive_missing", /archive_|exact_current_parser_run_missing|game_missing/],
    ["identity_ambiguity", /steam|player_name|player_number|non_steam|subject/],
    ["side_team_ambiguity", /team_id|multiple_teams|teams_resolution_missing|teams_resolution_status|teams_resolution_low_confidence|unsupported_provenance/],
    ["topology_ambiguity", /format|team_count|team_sizes|player_count|number_sequence|metric_roster_incomplete/],
  ];
  if (!blockers.length) return { disposition: "complete_recovery_candidate", primaryReason: "complete_authoritative_roster_candidate" };
  for (const [disposition, pattern] of choices) { const reason = first(pattern); if (reason) return { disposition, primaryReason: reason }; }
  if (authoritativeParticipants > 0 && first(/missing|incomplete/)) return { disposition: "partial_roster_evidence", primaryReason: blockers[0] };
  return { disposition: "other", primaryReason: blockers[0] };
}
export function auditYield(corpus: Row, cases: Row[]) {
  if (new Set(cases.map((r) => r.logicalIdentity)).size !== cases.length) throw Error("duplicate_logical_battle");
  const candidates = cases.filter((r) => r.disposition === "complete_recovery_candidate" && r.projectedMetricComplete === true && r.resultEligible === true);
  const numerator = corpus.logicalBattleTruthComplete + candidates.length, denominator = corpus.uniqueLogicalBattles;
  return { currentNumerator: corpus.logicalBattleTruthComplete, denominator, currentPercent: 100 * corpus.logicalBattleTruthComplete / denominator,
    additions: candidates.length, projectedNumerator: numerator, projectedPercent: 100 * numerator / denominator,
    percentagePointGain: 100 * candidates.length / denominator,
    playerFirstAdditions: candidates.filter((r) => r.registeredPlayerIds.length).length,
    playerFirstCandidates: candidates.filter((r) => r.registeredPlayerIds.length).map((r) => ({ gameStatsId: r.gameStatsId, users: r.registeredUsers, proposedRoster: r.plan.projection.projectedPlayers, planSha256: r.planSha256 })) };
}
async function persist(directory: string, prefix: string, value: unknown) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error("receipt_directory_not_private");
  const bytes = json(value) + "\n", sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = join(await realpath(directory), `${prefix}-${sha256}.json`), file = await open(path, "wx", 0o400);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  return { path, sha256 };
}
async function archiveState(root: string, artifact: Row, verify: boolean) {
  try {
    if (artifact.storageProvider !== "filesystem") return { artifactId: artifact.id, reason: "archive_provider_unsupported", available: false };
    const base = await realpath(root), path = await realpath(resolve(base, artifact.storageKey));
    if (!path.startsWith(base + sep)) throw Error("archive_path_outside_root");
    const stat = await lstat(path);
    if (!stat.isFile() || BigInt(stat.size) !== BigInt(artifact.byteSize)) throw Error("archive_size_mismatch");
    if (verify) {
      const h = createHash("sha256"); for await (const chunk of createReadStream(path)) h.update(chunk);
      if (h.digest("hex") !== artifact.sha256) throw Error("archive_hash_mismatch");
    }
    return { artifactId: artifact.id, available: true, path, byteSize: stat.size, sha256: artifact.sha256, digestVerified: verify };
  } catch (error) { return { artifactId: artifact.id, available: false, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "archive_missing" : error instanceof Error ? error.message : "archive_unavailable" }; }
}
export async function runRosterAudit(options: ReturnType<typeof parseAuditArguments>) {
  process.env.AOE2WAR_PROD_DB_PREVIEW = "true";
  const [{ getPrisma }, truth, roster, recovery, identity, view, contracts] = await Promise.all([
    import("../lib/prisma.ts"), import("../lib/publicReplayTruth.ts"), import("../lib/publicReplayRosterV2.ts"),
    import("../lib/targetedReplayRosterRecovery.ts"), import("../lib/leaderboardIdentity.ts"), import("../lib/gameStatsView.ts"), import("../lib/replayEngineRoom.ts")]);
  const prisma = getPrisma();
  try {
    const baselineBytes = await readFile(options.baseline), baseline = JSON.parse(baselineBytes.toString());
    const baselineSha256 = createHash("sha256").update(baselineBytes).digest("hex");
    if (baselineSha256 !== "69cd8f66ac7b6206bcef09aeb0d655467c376aee0efebf7b0179a12adc49f524") throw Error("historical_census_hash_mismatch");
    const report = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const inventory = await readWorkshopReceiptInventory(tx), opportunities = rosterOpportunities(inventory);
      const historical = rosterOpportunities(baseline.inventory);
      // All aliases use the SAME public logical identity function, never names or inferred grouping.
      const rows = await tx.gameStats.findMany({ where: { is_final: true }, orderBy: { id: "asc" }, select: {
        id: true, is_final: true, replayHash: true, replay_file: true, original_filename: true, key_events: true, players: true,
        winner: true, parse_source: true, parse_reason: true, event_types: true, disconnect_detected: true,
      } });
      const byId = new Map(rows.map((r) => [r.id, r])), cases: Row[] = [];
      for (const opportunity of opportunities) {
        const game = byId.get(opportunity.gameStatsId); if (!game) throw Error("logical_game_missing");
        const logicalIdentity = truth.publicReplayIdentity(game);
        const aliases = rows.filter((r) => truth.publicReplayIdentity(r) === logicalIdentity), aliasIds = aliases.map((r) => r.id);
        const [runs, attempts, adjudications, desync, promotions, plan] = await Promise.all([
          tx.replayParseRun.findMany({ where: { gameStatsId: { in: aliasIds } }, orderBy: { id: "asc" }, include: {
            artifact: true, observations: { where: { fieldPath: { in: ["player.name", "player.number", "player.steam_id", "player.team_id", "teams.resolution"] } }, orderBy: { id: "asc" } } } }),
          tx.replayParseAttempt.findMany({ where: { gameStatsId: { in: aliasIds } }, orderBy: { id: "asc" } }),
          tx.replayResultAdjudication.findMany({ where: { gameStatsId: { in: aliasIds } }, orderBy: { id: "asc" } }),
          tx.replayDesyncIncident.findMany({ where: { gameStatsId: { in: aliasIds } }, orderBy: { id: "asc" } }),
          tx.replayRosterPromotion.findMany({ where: { gameStatsId: { in: aliasIds } }, orderBy: { id: "asc" } }),
          recovery.planTargetedReplayRosterRecovery(tx, game.id),
        ]);
        const artifacts = [...new Map(runs.map((r) => [r.artifact.id, r.artifact])).values()];
        // Include an archived source even when it has no parser run yet.
        for (const a of await tx.replayArtifact.findMany({ where: { sha256: { in: aliases.map((r) => r.replayHash) } }, orderBy: { id: "asc" } })) if (!artifacts.some((v) => v.id === a.id)) artifacts.push(a);
        const archives = await Promise.all(artifacts.map((a) => archiveState(options.archiveDirectory, a, plan?.eligible === true)));
        const participants = view.parsePlayers(game.players).map((p) => ({ steamId: identity.readLeaderboardSteamId(p), name: p.name, number: p.number, teamId: p.team_id })).filter((p) => p.steamId);
        const blockers = [...(plan?.blockers || ["game_missing"])];
        if (plan && plan.status !== "eligible" && !blockers.length) blockers.push(`planner_status:${plan.status}`);
        if (aliases.some((a) => a.disconnect_detected)) blockers.push("alias_disconnect_detected");
        if (desync.some((d) => d.desyncOccurred)) blockers.push("alias_desync_history_requires_review");
        if (adjudications.length) blockers.push("adjudication_history_requires_review");
        const contract = contracts.HD_REPLAY_PARSER_CONTRACT;
        const exactRuns = runs.filter((r) => r.status === "completed" && r.candidateOnly && !r.affectsPublicAggregates &&
          r.inputHash === r.artifact.sha256 && aliases.some((a) => a.id === r.gameStatsId && a.replayHash === r.inputHash) &&
          (["parserName", "parserVersion", "schemaVersion", "passName", "passVersion"] as const).every((k) => r[k] === contract[k]));
        const completeProjections = exactRuns.map((r) => roster.buildPublicReplayRosterV3Projection({ currentPlayers: [], observations: r.observations, parseRunId: r.id })).filter((p) => p.ok);
        const structures = completeProjections.map((p) => hash(p.projectedPlayers.map((v) => [identity.readLeaderboardSteamId(v), v.team_id]).sort()));
        if (new Set(structures).size > 1) blockers.push("contradictory_exact_parser_rosters");
        const projectedState = roster.publicReplayRosterV2DisplayState(plan?.projection.projectedPlayers || []);
        const afterResult = plan?.projection.resultAuthority as Row | undefined;
        if (plan?.eligible && !projectedState.complete) blockers.push(`metric_roster_incomplete:${projectedState.reason}`);
        if (plan?.eligible && afterResult?.statsEligible !== true) blockers.push("projected_result_authority_invalid");
        if (plan?.eligible) {
          const bound = archives.find((a) => a.artifactId === plan.source?.artifactId);
          if (!bound?.available || !(bound as Row).digestVerified) blockers.push(bound?.reason || "archive_missing");
        }
        const canonicalObservations = exactRuns.flatMap((r) => r.observations.filter((o) => o.fieldPath === "player.steam_id" && o.confidenceBps === 10000 && (o.provenance as Row)?.class === "direct_header" && (o.provenance as Row)?.exact === true && (o.provenance as Row)?.conflict_state === "none").map((o) => ({ parseRunId: r.id, observationId: o.id, value: o.value, provenance: o.provenance })));
        const classification = classifyRosterCase([...new Set(blockers)], canonicalObservations.length);
        const evidence = { aliases, runs, attempts, adjudications, desync, promotions, artifacts, archives };
        cases.push({ ...opportunity, logicalIdentity, currentRosterState: roster.publicReplayRosterV2DisplayState(game.players),
          knownParticipants: participants, directIdentityObservations: canonicalObservations,
          missingRosterPositions: null, missingRosterCount: null,
          missingCountReason: "No inferred expected slot count; exact team observations and current/proposed roster retained in evidence.",
          evidenceFamilies: { archivedArtifacts: artifacts.length, availableArchives: archives.filter((a) => a.available).length, parseRuns: runs.length, exactCurrentRuns: exactRuns.length, parseAttempts: attempts.length, rosterPromotions: promotions.length },
          ...classification, blockers: [...new Set(blockers)], plan, planSha256: hash(plan),
          projectedMetricComplete: plan?.eligible === true && projectedState.complete && afterResult?.statsEligible === true && blockers.length === 0,
          evidence, evidenceSha256: hash(evidence) });
      }
      const dispositionCounts = Object.fromEntries(DISPOSITIONS.map((d) => [d, cases.filter((c) => c.disposition === d).length]));
      const rawReasonCounts: Row = {}, allBlockerCounts: Row = {};
      for (const row of cases) { rawReasonCounts[row.primaryReason] = (rawReasonCounts[row.primaryReason] || 0) + 1; for (const reason of row.blockers) allBlockerCounts[reason] = (allBlockerCounts[reason] || 0) + 1; }
      const ids = new Set(opportunities.map((r: Row) => r.gameStatsId)), oldIds = new Set(historical.map((r: Row) => r.gameStatsId));
      return { schema: "aoe2war-roster-opportunity-audit/v1", observationTimestamp: inventory.generatedAt,
        databaseReadOnly: inventory.databaseReadOnly, sourceHead: process.env.AOE2WAR_AUDIT_SOURCE_HEAD || null,
        productionSourceHead: process.env.AOE2WAR_AUDIT_PRODUCTION_HEAD || null, inventorySourceFingerprint: inventory.sourceFingerprint,
        historical: { observationTimestamp: baseline.observationTimestamp, receiptSha256: baselineSha256, count: historical.length, playerFirstCount: historical.filter((r: Row) => r.registeredPlayerIds.length).length },
        drift: { addedIds: [...ids].filter((id) => !oldIds.has(id)), removedIds: [...oldIds].filter((id) => !ids.has(id)),
          changedSourceIds: opportunities.filter((r: Row) => historical.find((h: Row) => h.gameStatsId === r.gameStatsId)?.caseSourceFingerprint !== r.caseSourceFingerprint).map((r: Row) => r.gameStatsId) },
        corpus: inventory.corpus, inspected: cases.length, playerFirstInspected: cases.filter((r) => r.registeredPlayerIds.length).length,
        dispositionCounts, rawReasonCounts, allBlockerCounts, projectedYield: auditYield(inventory.corpus, cases), cases,
        authority: { candidateOnly: true, databaseWrites: 0, resultWrites: 0, rosterWrites: 0, betting: false, settlement: false, wolo: false, nativeRuns: 0 } };
    }, { timeout: 600_000 });
    const files = ["scripts/audit-replay-roster-opportunities.mts", "scripts/census-watcher-receipt-yield.mts", "lib/targetedReplayRosterRecovery.ts", "lib/publicReplayRosterV2.ts", "lib/publicReplayTruth.ts", "lib/replayAdjudications.ts", "lib/publicBattleArchiveEligibility.ts", "lib/leaderboardIdentity.ts", "lib/gameStatsView.ts", "lib/replayEngineRoom.ts", "prisma/schema.prisma"];
    const sourceFingerprints = Object.fromEntries(await Promise.all(files.map(async (p) => [p, createHash("sha256").update(await readFile(new URL("../" + p, import.meta.url))).digest("hex")])));
    const sealed = { ...report, sourceFingerprints };
    const receipt = await persist(options.receiptDirectory, "roster-audit", sealed);
    const playerFirstReceipt = await persist(options.receiptDirectory, "roster-player-first", { observationTimestamp: report.observationTimestamp, auditReceipt: receipt, cases: report.cases.filter((c) => c.registeredPlayerIds.length) });
    const { cases, ...summary } = sealed;
    return { ...summary, receipt, playerFirstReceipt };
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRosterAudit(parseAuditArguments(process.argv.slice(2))).then((r) => console.log(json(r))).catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
}
