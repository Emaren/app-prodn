import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "./generated/prisma/index.js";
import { applyReplayAdjudicationToGameStats, EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION } from "./replayAdjudications.ts";
import { isPublicBattleArchiveRow } from "./publicBattleArchiveEligibility.ts";
import { cleanPublicGameRows, publicReplayIdentity, publicReplayWinnerTruth, type PublicGameStatsLike } from "./publicReplayTruth.ts";
import { publicReplayRosterV2DisplayState } from "./publicReplayRosterV2.ts";
import { resolveReplayResultForPlayer } from "./replayPlayerResult.ts";
import { normalizeReplayPlayers } from "./teamResolution.ts";
import { HD_REPLAY_PARSER_CONTRACT } from "./replayEngineRoom.ts";
import { planTargetedReplayRosterRecovery } from "./targetedReplayRosterRecovery.ts";

export const PLAYER_RESULT_RECOVERY_TARGETS = [
  { key: "zodiac", name: "Zodiac", steamId: "76561198103810510" },
  { key: "vegeta", name: "mYsTikaL_VeGeTa", steamId: "76561199849204394" },
  { key: "jiren", name: "mYsTikaL JiReN", steamId: "76561198754754435" },
] as const;
export type PlayerResultRecoveryTarget = "all" | (typeof PLAYER_RESULT_RECOVERY_TARGETS)[number]["key"];
export type PlayerResultRecoveryRequest = { target: PlayerResultRecoveryTarget; dryRun: true; maxGames: number; concurrency: 1 };
export const PLAYER_RESULT_RECOVERY_MAX_GAMES = 10;
export const PLAYER_RESULT_RECOVERY_ROUTES = [
  "already_resolvable", "roster_recovery_eligible", "current_parser_reparse_eligible",
  "parser_research_required", "result_evidence_required", "native_replay_eligible",
  "source_artifact_missing", "human_review_only",
] as const;
export type PlayerResultRecoveryRoute = (typeof PLAYER_RESULT_RECOVERY_ROUTES)[number];

export function parsePlayerResultRecoveryRequest(value: unknown): PlayerResultRecoveryRequest {
  const source = record(value);
  const permitted = new Set(["target", "dryRun", "maxGames", "concurrency"]);
  if (Object.keys(source).some((key) => !permitted.has(key))) throw new Error("Player recovery planning accepts only target, dryRun, maxGames and concurrency.");
  if (source.dryRun !== true) throw new Error("Player recovery is dry-run only; send dryRun: true.");
  const target = source.target ?? "all";
  if (target !== "all" && !PLAYER_RESULT_RECOVERY_TARGETS.some((player) => player.key === target)) throw new Error("Select zodiac, vegeta, jiren or all.");
  const maxGames = source.maxGames ?? 3;
  if (typeof maxGames !== "number" || !Number.isSafeInteger(maxGames) || maxGames < 1 || maxGames > PLAYER_RESULT_RECOVERY_MAX_GAMES) throw new Error("maxGames must be an integer between 1 and 10.");
  if (source.concurrency !== undefined && source.concurrency !== 1) throw new Error("Player recovery concurrency must be exactly 1.");
  return { target: target as PlayerResultRecoveryTarget, dryRun: true, maxGames, concurrency: 1 };
}

type RecoveryRun = {
  id: number; inputHash: string; parserName: string; parserVersion: string;
  passName: string; passVersion: string; schemaVersion: string; status: string;
  candidateOutputHash: string | null; candidateOutputStorageKey: string | null;
};
export type PlayerRecoveryArchive = { present: boolean; byteSize: number | null; reason: string | null };
export type PlayerRecoveryExposure = { marketIds: number[]; wagers: number; stakeIntents: number; claims: number; settlementRecorded: boolean; scheduledMatchIds?: number[]; scheduledSettlements?: number; trophyChallengeIds?: number[]; marketCounts?: Array<{ id: number; wagers: number; stakeIntents: number }>; claimIds?: number[] };
type RosterPlan = { status: string; blockers: string[]; decisionHash: string | null };
export type PlayerResultRecoveryFacts = {
  rows: PublicGameStatsLike[]; runs: RecoveryRun[];
  archives: Map<string, PlayerRecoveryArchive>; exposures: Map<number, PlayerRecoveryExposure>;
  rosterPlans: Map<number, RosterPlan>;
  candidateOutputs?: Map<number, boolean>;
};
export type PlayerResultRecoveryCase = {
  canonicalGameStatsId: number; logicalBattleIds: string[]; sourceGameStatsIds: number[];
  sourceHashes: string[]; replaySha256: string; targetSteamIds: string[];
  map: string | null; playedOn: string | null; resultUnknown: boolean; rosterComplete: boolean;
  parseIteration: number; parseSource: string; parseReason: string;
  roster: Array<{ name: string; steamId: string | null; slot: number | null; teamId: string | null; result: string }>;
  rawWinner: unknown; rawPlayerWinnerFlags: unknown[]; currentResultProjection: string | null;
  parserLineage: RecoveryRun[]; currentParserAttempted: boolean; candidateOutputPresent: boolean;
  candidateOutputAvailability: "presence_verified" | "missing" | "catalog_only";
  archive: PlayerRecoveryArchive; acceptedAdjudicationIds: number[];
  financialExposure: PlayerRecoveryExposure; disconnectedReview: boolean; confirmedDesync: boolean;
  rosterPlan: RosterPlan | null; primaryRoute: PlayerResultRecoveryRoute;
  nativeStructurallyEligible: boolean; blockers: string[];
  reviewHref: string;
};
export type PlayerResultRecoveryPlan = {
  schema: "aoe2war-player-result-recovery/v1"; generatedAt: string; request: PlayerResultRecoveryRequest;
  grain: string; planSha256: string;
  players: Array<{ key: string; name: string; steamId: string; totalBattles: number; unknownFullTruth: number; unknownResults: number }>;
  counts: { unknownPlayerCount: number; unknownResultPlayerCount: number; distinctLogicalBattles: number; distinctReplayJobs: number; artifactPresent: number; parserRecoverable: number; nativeReplayEligible: number; humanReview: number; sourceMissing: number; recoveredDuringCampaign: 0; irrecoverableProven: 0 };
  routeCounts: Record<PlayerResultRecoveryRoute, number>; cases: PlayerResultRecoveryCase[];
  selectedGameStatsIds: number[];
  nativeGate: { controlsGreen: false; executionEnabled: false; reason: "control_ladder_incomplete" };
  authorityBoundary: { databaseWrites: 0; candidateOnly: true; affectsStats: false; affectsBets: false; settlementAuthority: false; woloAuthority: false };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function rawPlayers(value: unknown): Record<string, unknown>[] {
  if (typeof value === "string") { try { return rawPlayers(JSON.parse(value)); } catch { return []; } }
  return Array.isArray(value) ? value.map(record) : [];
}
function gameId(game: PublicGameStatsLike) { return Number(game.id); }
function replayHash(game: PublicGameStatsLike) { return String(game.replayHash ?? game.replay_hash ?? "").trim().toLowerCase(); }
function dateText(value: unknown) { return value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null; }
function isCurrent(run: RecoveryRun) {
  return (["parserName", "parserVersion", "passName", "passVersion", "schemaVersion"] as const).every((key) => run[key] === HD_REPLAY_PARSER_CONTRACT[key]);
}
function participantTruthComplete(game: PublicGameStatsLike) {
  const players = normalizeReplayPlayers(game.players);
  const results = players.map((player) => resolveReplayResultForPlayer(game, (member) => member.stablePlayerKey === player.stablePlayerKey));
  return players.length >= 2 && !results.includes("unknown") && results.includes("win") && results.includes("loss") && Boolean(publicReplayWinnerTruth(game).winner);
}
function emptyExposure(): PlayerRecoveryExposure { return { marketIds: [], wagers: 0, stakeIntents: 0, claims: 0, settlementRecorded: false, scheduledMatchIds: [], scheduledSettlements: 0, trophyChallengeIds: [] }; }
export function playerRecoverySessionKeys(game: PublicGameStatsLike) {
  const events = record(game.key_events);
  const upload = record(events.watcher_upload);
  return [...new Set([game.original_filename, game.replay_file, publicReplayIdentity(game), events.platform_match_id, upload.watcher_session_id].filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}
function nativeRosterExact(game: PublicGameStatsLike) {
  const raw = rawPlayers(game.players);
  const players = normalizeReplayPlayers(game.players);
  const slots = raw.map((player) => player.number ?? player.player_number ?? player.playerNumber);
  const validSlot = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8) || (typeof value === "string" && /^[1-8]$/.test(value));
  return players.length >= 2 && players.length <= 8 && raw.length === players.length &&
    slots.every(validSlot) && new Set(slots.map(Number)).size === players.length &&
    players.every((player) => player.steamId !== null && /^\d{17}$/.test(player.steamId) && player.teamId !== null && /^(?:team:)?\d+$/.test(player.teamId)) &&
    new Set(players.map((player) => player.steamId)).size === players.length && new Set(players.map((player) => player.teamId)).size === 2;
}

/** Read existing public projection and evidence only. A route is not promotion authority. */
export function buildPlayerResultRecoveryPlan(facts: PlayerResultRecoveryFacts, request: PlayerResultRecoveryRequest, generatedAt = new Date().toISOString()): PlayerResultRecoveryPlan {
  const targets = PLAYER_RESULT_RECOVERY_TARGETS.filter((target) => request.target === "all" || target.key === request.target);
  const effective = facts.rows.map(applyReplayAdjudicationToGameStats);
  const logical = cleanPublicGameRows(effective.filter((game) => game.is_final === true && isPublicBattleArchiveRow(game)), { includeReview: true, includeLive: false });
  const matches = (game: PublicGameStatsLike, steamId: string) => normalizeReplayPlayers(game.players).some((player) => player.steamId === steamId);
  const players = targets.map((target) => {
    const own = logical.filter((game) => matches(game, target.steamId));
    return { ...target, totalBattles: own.length,
      unknownFullTruth: own.filter((game) => !participantTruthComplete(game) || !publicReplayRosterV2DisplayState(game.players).complete).length,
      unknownResults: own.filter((game) => resolveReplayResultForPlayer(game, (player) => player.steamId === target.steamId) === "unknown").length };
  });
  const incomplete = logical.filter((game) => targets.some((target) => matches(game, target.steamId)) && (!participantTruthComplete(game) || !publicReplayRosterV2DisplayState(game.players).complete));
  const byReplay = new Map<string, PublicGameStatsLike[]>();
  for (const game of incomplete) {
    const key = replayHash(game) || publicReplayIdentity(game);
    byReplay.set(key, [...(byReplay.get(key) ?? []), game]);
  }
  const cases = [...byReplay.values()].map((group): PlayerResultRecoveryCase => {
    const game = group[0];
    const sha = replayHash(game);
    const canonicalSha = /^[a-f0-9]{64}$/.test(sha);
    const identities = [...new Set(group.map(publicReplayIdentity))].sort();
    const sourceRows = facts.rows.filter((row) => identities.includes(publicReplayIdentity(row)) || (canonicalSha && replayHash(row) === sha));
    const sourceIds = [...new Set(sourceRows.map(gameId))].sort((a, b) => a - b);
    const archive = canonicalSha ? facts.archives.get(sha) ?? { present: false, byteSize: null, reason: "archive_unchecked" } : { present: false, byteSize: null, reason: "invalid_replay_sha256" };
    const lineage = facts.runs.filter((run) => sourceRows.some((row) => replayHash(row) === run.inputHash));
    const current = lineage.filter((run) => run.inputHash === sha && isCurrent(run));
    const exactRoster = nativeRosterExact(game);
    const rosterPlan = facts.rosterPlans.get(gameId(game)) ?? null;
    const financialExposure = emptyExposure();
    const marketCounts = new Map<number, { id: number; wagers: number; stakeIntents: number }>();
    const claimIds = new Set<number>();
    for (const id of sourceIds) {
      const exposure = facts.exposures.get(id);
      if (!exposure) continue;
      // Exposures may span duplicate source rows. Market presence alone fences native admission.
      financialExposure.marketIds.push(...exposure.marketIds);
      financialExposure.wagers = Math.max(financialExposure.wagers, exposure.wagers);
      financialExposure.stakeIntents = Math.max(financialExposure.stakeIntents, exposure.stakeIntents);
      financialExposure.claims = Math.max(financialExposure.claims, exposure.claims);
      financialExposure.settlementRecorded ||= exposure.settlementRecorded;
      financialExposure.scheduledMatchIds!.push(...(exposure.scheduledMatchIds ?? []));
      financialExposure.scheduledSettlements = Math.max(financialExposure.scheduledSettlements!, exposure.scheduledSettlements ?? 0);
      financialExposure.trophyChallengeIds!.push(...(exposure.trophyChallengeIds ?? []));
      for (const market of exposure.marketCounts ?? []) marketCounts.set(market.id, market);
      for (const claimId of exposure.claimIds ?? []) claimIds.add(claimId);
    }
    financialExposure.marketIds = [...new Set(financialExposure.marketIds)].sort((a, b) => a - b);
    financialExposure.scheduledMatchIds = [...new Set(financialExposure.scheduledMatchIds)].sort((a, b) => a - b);
    financialExposure.trophyChallengeIds = [...new Set(financialExposure.trophyChallengeIds)].sort((a, b) => a - b);
    if (marketCounts.size === financialExposure.marketIds.length && marketCounts.size > 0) {
      financialExposure.wagers = [...marketCounts.values()].reduce((sum, market) => sum + market.wagers, 0);
      financialExposure.stakeIntents = [...marketCounts.values()].reduce((sum, market) => sum + market.stakeIntents, 0);
      financialExposure.marketCounts = [...marketCounts.values()].sort((a, b) => a.id - b.id);
    }
    if (claimIds.size > 0) { financialExposure.claims = claimIds.size; financialExposure.claimIds = [...claimIds].sort((a, b) => a - b); }
    const acceptedAdjudicationIds = sourceRows.flatMap((row) => {
      const projected = applyReplayAdjudicationToGameStats(row);
      const adjudication = record(projected.replayResultAdjudication);
      const id = adjudication.adjudication_id ?? adjudication.id;
      return (adjudication.decision_status ?? adjudication.decisionStatus) === "accepted" && (adjudication.affects_stats ?? adjudication.affectsStats) === true && typeof id === "number" ? [id] : [];
    });
    const confirmedDesync = sourceRows.some((row) => row.currentDesyncOccurred === true);
    const financial = financialExposure.marketIds.length > 0 || financialExposure.claims > 0 || financialExposure.scheduledMatchIds.length > 0 || financialExposure.trophyChallengeIds.length > 0 || financialExposure.settlementRecorded;
    const logicalConflict = identities.length !== 1;
    const resultUnknown = group.some((row) => !participantTruthComplete(row));
    const rosterComplete = publicReplayRosterV2DisplayState(game.players).complete;
    const blockers = [
      ...(archive.present ? [] : [archive.reason ?? "source_artifact_missing"]),
      ...(exactRoster ? [] : ["canonical_roster_slot_team_binding_incomplete"]),
      ...(financial ? ["financial_exposure_requires_commissioner_review"] : []),
      ...(confirmedDesync ? ["confirmed_desync"] : []),
      ...(logicalConflict ? ["replay_sha_maps_to_multiple_logical_battles"] : []),
      ...(resultUnknown ? ["unknown_result"] : []),
      ...(rosterComplete ? [] : ["workshop_roster_incomplete"]),
      ...(current.length ? [] : ["stale_or_missing_current_parser"]),
      ...(rosterPlan?.blockers ?? []),
    ];
    const nativeStructurallyEligible = resultUnknown && archive.present && exactRoster && !financial && !confirmedDesync && !logicalConflict && current.some((run) => ["completed", "recovered"].includes(run.status)) && rosterPlan?.status !== "eligible";
    const primaryRoute: PlayerResultRecoveryRoute = !archive.present ? "source_artifact_missing"
      : financial || confirmedDesync || logicalConflict ? "human_review_only"
      : rosterPlan?.status === "eligible" ? "roster_recovery_eligible"
      : current.length === 0 ? "current_parser_reparse_eligible"
      : nativeStructurallyEligible ? "native_replay_eligible"
      : !exactRoster || !current.some((run) => ["completed", "recovered"].includes(run.status)) ? "parser_research_required"
      : !resultUnknown ? "already_resolvable" : "result_evidence_required";
    return {
      canonicalGameStatsId: gameId(game), logicalBattleIds: identities, sourceGameStatsIds: sourceIds,
      sourceHashes: [...new Set(sourceRows.map(replayHash))].sort(), replaySha256: sha,
      targetSteamIds: targets.filter((target) => group.some((row) => matches(row, target.steamId))).map((target) => target.steamId),
      map: typeof record(game.map).name === "string" ? String(record(game.map).name) : null,
      playedOn: dateText(game.played_on ?? game.timestamp), resultUnknown, rosterComplete,
      parseIteration: Number(game.parse_iteration ?? 0), parseSource: String(game.parse_source ?? "unknown"), parseReason: String(game.parse_reason ?? "unknown"),
      roster: normalizeReplayPlayers(game.players).map((player) => ({ name: player.name, steamId: player.steamId, slot: player.playerNumber, teamId: player.teamId, result: resolveReplayResultForPlayer(game, (member) => member.stablePlayerKey === player.stablePlayerKey) })),
      rawWinner: sourceRows.find((row) => gameId(row) === gameId(game))?.winner ?? null,
      rawPlayerWinnerFlags: rawPlayers(sourceRows.find((row) => gameId(row) === gameId(game))?.players).map((player) => player.winner ?? null),
      currentResultProjection: publicReplayWinnerTruth(game).winner,
      parserLineage: lineage, currentParserAttempted: current.length > 0,
      candidateOutputPresent: current.some((run) => Boolean(run.candidateOutputHash && run.candidateOutputStorageKey) && facts.candidateOutputs?.get(run.id) === true),
      candidateOutputAvailability: current.some((run) => facts.candidateOutputs?.get(run.id) === true) ? "presence_verified" : facts.candidateOutputs ? "missing" : "catalog_only",
      archive, acceptedAdjudicationIds: [...new Set(acceptedAdjudicationIds)], financialExposure,
      disconnectedReview: sourceRows.some((row) => row.disconnect_detected === true), confirmedDesync,
      rosterPlan, primaryRoute, nativeStructurallyEligible, blockers: [...new Set(blockers)].sort(),
      reviewHref: `/game-stats/${gameId(game)}`,
    };
  }).sort((a, b) => a.canonicalGameStatsId - b.canonicalGameStatsId);
  const routeCounts = Object.fromEntries(PLAYER_RESULT_RECOVERY_ROUTES.map((route) => [route, cases.filter((row) => row.primaryRoute === route).length])) as Record<PlayerResultRecoveryRoute, number>;
  const selectedGameStatsIds = cases.filter((row) => row.nativeStructurallyEligible).slice(0, request.maxGames).map((row) => row.canonicalGameStatsId);
  const content = {
    schema: "aoe2war-player-result-recovery/v1" as const, generatedAt, request,
    grain: "canonical public archive logical battles; player unknown Full Truth and unknown result are separate; execution deduplicated by immutable replay SHA",
    players, counts: {
      unknownPlayerCount: players.reduce((total, player) => total + player.unknownFullTruth, 0),
      unknownResultPlayerCount: players.reduce((total, player) => total + player.unknownResults, 0),
      distinctLogicalBattles: incomplete.length, distinctReplayJobs: cases.length,
      artifactPresent: cases.filter((row) => row.archive.present).length,
      parserRecoverable: routeCounts.current_parser_reparse_eligible + routeCounts.roster_recovery_eligible,
      nativeReplayEligible: routeCounts.native_replay_eligible, humanReview: routeCounts.human_review_only,
      sourceMissing: routeCounts.source_artifact_missing, recoveredDuringCampaign: 0 as const, irrecoverableProven: 0 as const,
    }, routeCounts, cases, selectedGameStatsIds,
    nativeGate: { controlsGreen: false as const, executionEnabled: false as const, reason: "control_ladder_incomplete" as const },
    authorityBoundary: { databaseWrites: 0 as const, candidateOnly: true as const, affectsStats: false as const, affectsBets: false as const, settlementAuthority: false as const, woloAuthority: false as const },
  };
  const { generatedAt: observationTime, ...stableContent } = content;
  void observationTime;
  return { ...content, planSha256: createHash("sha256").update(JSON.stringify(stableContent)).digest("hex") };
}

const ARCHIVE_ROOT = "/mnt/HC_Volume_105319120/aoe2-replay-archive";
const CANDIDATE_ROOT = "/mnt/HC_Volume_105319120/aoe2-parser-engine/";
export async function inspectPlayerRecoveryArchive(sha256: string): Promise<PlayerRecoveryArchive> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return { present: false, byteSize: null, reason: "invalid_replay_sha256" };
  const path = join(ARCHIVE_ROOT, sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.aoe2record`);
  try {
    const stat = await fs.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (await fs.realpath(path)) !== path || stat.size < 1 || stat.size > 64 * 1024 * 1024) return { present: false, byteSize: null, reason: "archive_object_outside_native_contract" };
    return { present: true, byteSize: stat.size, reason: "presence_checked_sha256_revalidated_at_execution" };
  } catch { return { present: false, byteSize: null, reason: "canonical_record_archive_missing" }; }
}

/** Uses existing roster planner and public result contracts; never invokes any writer/reconciler. */
export async function loadPlayerResultRecoveryPlan(prisma: PrismaClient, request: PlayerResultRecoveryRequest): Promise<PlayerResultRecoveryPlan> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const finalRows = await tx.gameStats.findMany({ where: { is_final: true }, orderBy: { id: "asc" }, select: {
      id: true, replayHash: true, replay_file: true, original_filename: true, is_final: true,
      winner: true, players: true, map: true, played_on: true, timestamp: true, createdAt: true,
      key_events: true, event_types: true, parse_source: true, parse_reason: true, parse_iteration: true,
      disconnect_detected: true, replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      replayDesyncIncidents: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { desyncOccurred: true } },
    } });
    const rows = finalRows.map((row) => ({ ...row, currentDesyncOccurred: row.replayDesyncIncidents[0]?.desyncOccurred === true }));
    const initial = buildPlayerResultRecoveryPlan({ rows, runs: [], archives: new Map(), exposures: new Map(), rosterPlans: new Map() }, request);
    const hashes = [...new Set(initial.cases.flatMap((row) => row.sourceHashes))];
    const nonfinalRows = hashes.length ? await tx.gameStats.findMany({ where: { is_final: false, replayHash: { in: hashes } } }) : [];
    const scopedRows = [...rows, ...nonfinalRows];
    const ids = [...new Set(initial.cases.flatMap((row) => row.sourceGameStatsIds).concat(nonfinalRows.map((row) => row.id)))];
    const names = [...new Set(scopedRows.filter((row) => ids.includes(row.id)).flatMap(playerRecoverySessionKeys))];
    const runs = hashes.length ? await tx.replayParseRun.findMany({ where: { inputHash: { in: hashes } }, orderBy: { id: "desc" }, select: {
      id: true, inputHash: true, parserName: true, parserVersion: true, passName: true, passVersion: true,
      schemaVersion: true, status: true, candidateOutputHash: true, candidateOutputStorageKey: true,
    } }) : [];
    const markets = ids.length ? await tx.betMarket.findMany({ where: { OR: [{ linkedGameStatsId: { in: ids } }, { lateFinalGameStatsId: { in: ids } }, { linkedSessionKey: { in: names } }, { battle: { identityKey: { in: names } } }] }, select: {
      id: true, linkedGameStatsId: true, lateFinalGameStatsId: true, linkedSessionKey: true, battle: { select: { identityKey: true } }, settlementStatus: true, settlementRunId: true, settlementExecutedAt: true,
      _count: { select: { wagers: true, stakeIntents: true } },
    } }) : [];
    const claims = ids.length ? await tx.pendingWoloClaim.findMany({ where: { OR: [{ sourceGameStatsId: { in: ids } }, { sourceMarketId: { in: markets.map((market) => market.id) } }] }, select: { id: true, sourceGameStatsId: true, sourceMarketId: true } }) : [];
    const scheduled = ids.length ? await tx.scheduledMatch.findMany({ where: { OR: [{ linkedSessionKey: { in: names } }, { replayClaims: { some: { gameStatsId: { in: ids } } } }] }, select: { id: true, linkedSessionKey: true, replayClaims: { select: { gameStatsId: true } }, _count: { select: { settlements: true } } } }) : [];
    const trophies = ids.length ? await tx.trophyChallenge.findMany({ where: { OR: [{ replayId: { in: ids } }, { scheduledMatchId: { in: scheduled.map((match) => match.id) } }, { watcherSessionId: { in: names } }] }, select: { id: true, replayId: true, scheduledMatchId: true, watcherSessionId: true } }) : [];
    const exposures = new Map<number, PlayerRecoveryExposure>();
    for (const row of scopedRows.filter((game) => ids.includes(game.id))) {
      const keys = playerRecoverySessionKeys(row);
      const linked = markets.filter((market) => market.linkedGameStatsId === row.id || market.lateFinalGameStatsId === row.id || Boolean(market.linkedSessionKey && keys.includes(market.linkedSessionKey)) || Boolean(market.battle && keys.includes(market.battle.identityKey)));
      const linkedScheduled = scheduled.filter((match) => match.replayClaims.some((claim) => claim.gameStatsId === row.id) || Boolean(match.linkedSessionKey && keys.includes(match.linkedSessionKey)));
      const linkedTrophies = trophies.filter((challenge) => challenge.replayId === row.id || linkedScheduled.some((match) => match.id === challenge.scheduledMatchId) || Boolean(challenge.watcherSessionId && keys.includes(challenge.watcherSessionId)));
      const linkedClaims = claims.filter((claim) => claim.sourceGameStatsId === row.id || linked.some((market) => market.id === claim.sourceMarketId));
      exposures.set(row.id, { marketIds: linked.map((market) => market.id), wagers: linked.reduce((sum, market) => sum + market._count.wagers, 0), stakeIntents: linked.reduce((sum, market) => sum + market._count.stakeIntents, 0), claims: linkedClaims.length, settlementRecorded: linked.some((market) => Boolean(market.settlementRunId || market.settlementExecutedAt || market.settlementStatus)), scheduledMatchIds: linkedScheduled.map((match) => match.id), scheduledSettlements: linkedScheduled.reduce((sum, match) => sum + match._count.settlements, 0), trophyChallengeIds: linkedTrophies.map((challenge) => challenge.id), marketCounts: linked.map((market) => ({ id: market.id, wagers: market._count.wagers, stakeIntents: market._count.stakeIntents })), claimIds: linkedClaims.map((claim) => claim.id) });
    }
    const archives = new Map<string, PlayerRecoveryArchive>();
    // Bounded to this exact three-player cohort; no full archive scan or body hashing in the web request.
    for (const hash of hashes) archives.set(hash, await inspectPlayerRecoveryArchive(hash));
    const candidateOutputs = new Map<number, boolean>();
    for (const run of runs.filter(isCurrent)) {
      const path = run.candidateOutputStorageKey;
      let present = false;
      if (path?.startsWith(CANDIDATE_ROOT) && /^[a-f0-9]{64}$/.test(run.candidateOutputHash ?? "")) {
        try {
          const stat = await fs.lstat(path);
          present = stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && (await fs.realpath(path)) === path;
        } catch { /* Missing candidate output remains missing; the indexed run is still preserved. */ }
      }
      candidateOutputs.set(run.id, present);
    }
    const rosterPlans = new Map<number, RosterPlan>();
    for (const row of initial.cases.filter((game) => !game.rosterComplete)) {
      const plan = await planTargetedReplayRosterRecovery(tx as unknown as PrismaClient, row.canonicalGameStatsId);
      if (plan) rosterPlans.set(row.canonicalGameStatsId, { status: plan.status, blockers: plan.blockers, decisionHash: plan.decisionHash });
    }
    return buildPlayerResultRecoveryPlan({ rows: scopedRows, runs, archives, exposures, rosterPlans, candidateOutputs }, request);
  }, { isolationLevel: "RepeatableRead", timeout: 90_000, maxWait: 5_000 });
}
