import type { PublicParserObservatory } from "@/lib/parserObservatory";

type Cohort = { key: string; count: number };
type PublicUnknown = PublicParserObservatory["unknowns"]["latest"][number];

export type ReplayEngineCase = {
  id: number;
  owner: string;
  players: string[];
  mapName: string;
  gameType: string;
  gameVersion: string;
  reason: string;
  playedAt: string | null;
  neededEvidence: string[];
  gates: {
    intake: true;
    participantsObserved: boolean;
    sidesVerified: boolean;
    resultVerified: false;
  };
  gatesPassed: number;
};

export type ReplayEngineSnapshot = ReturnType<typeof projectHdReplayEngine>;

function sanitizeLabel(value: unknown, fallback: string, length = 80) {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  return clean ? clean.slice(0, length) : fallback;
}

function cohort(rows: Cohort[], limit = 12) {
  return rows
    .filter((row) => Number.isFinite(row.count) && row.count > 0)
    .slice(0, limit)
    .map(({ key, count }) => ({
      label: sanitizeLabel(key, "Unspecified"),
      count,
    }));
}

function toCase(game: PublicUnknown): ReplayEngineCase {
  const players = game.players
    .filter((name): name is string =>
      typeof name === "string" && Boolean(name.trim()) && name !== "Roster unresolved")
    .slice(0, 8)
    .map((name) => sanitizeLabel(name, "Unknown player", 48));
  const participantsObserved = players.length >= 2 && game.observedPlayers >= 2;
  const sidesVerified = game.teamsResolved === true;
  return {
    id: game.id,
    owner: sanitizeLabel(game.owner, "Owner not captured", 64),
    players,
    mapName: sanitizeLabel(game.mapName, "Unknown map", 56),
    gameType: sanitizeLabel(game.gameType, "Unknown format", 72),
    gameVersion: sanitizeLabel(game.gameVersion, "Version unavailable", 56),
    reason: sanitizeLabel(game.parseReason, "Unspecified"),
    playedAt: game.playedAt,
    neededEvidence: game.neededEvidence.map((name) =>
      sanitizeLabel(name, "Evidence required", 90)
    ).slice(0, 6),
    gates: {
      intake: true,
      participantsObserved,
      sidesVerified,
      resultVerified: false,
    },
    gatesPassed: 1 + Number(participantsObserved) + Number(sidesVerified),
  };
}

/**
 * A deliberately small public projection of the EXISTING five-minute
 * Parser Observatory cache. All counters retain their source grain; the
 * progress tiles show discrete evidence gates, never outcome probabilities.
 * No Codex worktree, raw bytes, private hashes, filenames or wallet facts.
 */
export function projectHdReplayEngine(data: PublicParserObservatory) {
  const { corpus, parser, unknowns } = data;
  return {
    schema: 1 as const,
    generatedAt: data.generatedAt,
    grain: "final-ingestion-records" as const,
    counts: {
      final: corpus.finalReplayRecords,
      verifiedResult: corpus.resolvedResults,
      unknownResult: corpus.unresolvedResults,
      teamsVerified: corpus.resolvedTeams,
      teamsUnknown: corpus.unresolvedTeams,
      resultCoverageBps: corpus.resultCoverageBps,
      teamCoverageBps: corpus.teamCoverageBps,
      publicBattleRecords: corpus.publicBattleRecords,
      uniqueLogicalBattles: corpus.uniqueLogicalBattles,
      logicalFullTruth: corpus.logicalBattleTruthComplete,
      logicalTruthUnknown: corpus.logicalBattleTruthIncomplete,
      logicalFullCoverageBps: corpus.logicalBattleTruthCoverageBps,
      logicalNeedsResultOnly: corpus.logicalNeedsResultOnly,
      logicalNeedsRosterOnly: corpus.logicalNeedsRosterOnly,
      logicalNeedsBoth: corpus.logicalNeedsBoth,
      indexedArtifacts: parser.frontier.artifacts,
      indexedParsed: parser.frontier.completed,
      indexedFailed: parser.frontier.failed,
      checkpointArtifacts: parser.frontier.savedSnapshots,
      parserRuns: parser.totalRuns,
      parserObservations: parser.observations,
      knownIrrecoverable: corpus.confirmedIrrecoverableArtifacts,
    },
    unknown: {
      reasons: cohort(unknowns.byReason),
      owners: cohort(unknowns.byOwner),
      participants: cohort(unknowns.byRosterPlayer),
      formats: cohort(unknowns.byGameType),
      maps: cohort(unknowns.byMap),
      cases: unknowns.latest.slice(0, 24).map(toCase),
    },
    parser: {
      modes: parser.frontier.modes.slice(0, 9).map((row) => ({
        label: sanitizeLabel(row.label, "Unknown parsing mode", 64),
        count: row.count,
      })),
      failureLanes: parser.failureRecovery.lanes.slice(0, 9).map((row) => ({
        label: sanitizeLabel(row.label, "Review", 64),
        count: row.count,
      })),
      failureTotal: parser.failureRecovery.total,
      latestJobs: parser.jobs.slice(0, 6).map((job) => ({
        id: String(job.id),
        createdAt: job.createdAt,
        status: job.candidateOnly ? "Candidate-only" : "Recorded",
        lastEvent: sanitizeLabel(job.latestEvent?.eventType, "No events", 48),
      })),
    },
  };
}
