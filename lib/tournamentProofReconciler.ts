import { PrismaClient } from "@/lib/generated/prisma";
import { inferReplayWinnerEntryId, replayMatchesAssignedPlayers, toReplayCandidate } from "@/lib/replayProof";
import { toLobbyEntrant } from "@/lib/tournamentMatchView";

const RECONCILE_INTERVAL_MS = 15_000;
const MATCH_SCHEDULE_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const MATCH_DEFAULT_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

let lastGlobalReconcileAt = 0;

type ReconcileOptions = {
  force?: boolean;
  tournamentId?: number | null;
};

type PendingMatch = {
  id: number;
  tournamentId: number;
  tournamentCreatedAt: Date;
  tournamentStartsAt: Date | null;
  round: number;
  position: number;
  scheduledAt: Date | null;
  playerOneEntryId: number;
  playerTwoEntryId: number;
};

type ReplayCandidate = ReturnType<typeof toReplayCandidate>;

function shouldSkipReconcile(options?: ReconcileOptions) {
  if (options?.force) return false;
  const now = Date.now();
  if (now - lastGlobalReconcileAt < RECONCILE_INTERVAL_MS) {
    return true;
  }
  lastGlobalReconcileAt = now;
  return false;
}

function getReplayTimestamp(candidate: ReplayCandidate) {
  const value = candidate.playedOn;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function getMatchLowerBound(match: PendingMatch) {
  if (match.scheduledAt) {
    return match.scheduledAt.getTime() - MATCH_SCHEDULE_LOOKBACK_MS;
  }

  if (match.tournamentStartsAt) {
    return match.tournamentStartsAt.getTime() - MATCH_SCHEDULE_LOOKBACK_MS;
  }

  return Math.max(
    match.tournamentCreatedAt.getTime(),
    Date.now() - MATCH_DEFAULT_LOOKBACK_MS
  );
}

export async function reconcileTournamentMatchProofs(
  prisma: PrismaClient,
  options?: ReconcileOptions
) {
  if (shouldSkipReconcile(options)) {
    return {
      skipped: true,
      linkedCount: 0,
      scannedMatchCount: 0,
      scannedReplayCount: 0,
    };
  }

  const tournaments = await prisma.tournament.findMany({
    where: options?.tournamentId
      ? { id: options.tournamentId }
      : {
          OR: [{ featured: true }, { status: { in: ["open", "active"] } }],
        },
    orderBy: [{ featured: "desc" }, { startsAt: "asc" }, { createdAt: "desc" }],
    take: options?.tournamentId ? 1 : 3,
    include: {
      entries: {
        include: {
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
              verificationLevel: true,
              verified: true,
            },
          },
        },
      },
      matches: {
        where: {
          sourceGameStatsId: null,
          playerOneEntryId: { not: null },
          playerTwoEntryId: { not: null },
          OR: [
            { scheduledAt: { not: null } },
            { status: { in: ["ready", "live", "completed"] } },
          ],
        },
        orderBy: [{ round: "asc" }, { position: "asc" }],
      },
    },
  });

  if (tournaments.length === 0) {
    return {
      skipped: false,
      linkedCount: 0,
      scannedMatchCount: 0,
      scannedReplayCount: 0,
    };
  }

  const entrantsByEntryId = new Map<number, ReturnType<typeof toLobbyEntrant>>();
  const pendingMatches: PendingMatch[] = [];
  let earliestReplayBound = Date.now();

  for (const tournament of tournaments) {
    for (const entry of tournament.entries) {
      entrantsByEntryId.set(entry.id, toLobbyEntrant(entry));
    }

    for (const match of tournament.matches) {
      if (
        typeof match.playerOneEntryId !== "number" ||
        typeof match.playerTwoEntryId !== "number"
      ) {
        continue;
      }

      const pendingMatch: PendingMatch = {
        id: match.id,
        tournamentId: tournament.id,
        tournamentCreatedAt: tournament.createdAt,
        tournamentStartsAt: tournament.startsAt,
        round: match.round,
        position: match.position,
        scheduledAt: match.scheduledAt,
        playerOneEntryId: match.playerOneEntryId,
        playerTwoEntryId: match.playerTwoEntryId,
      };

      pendingMatches.push(pendingMatch);
      earliestReplayBound = Math.min(earliestReplayBound, getMatchLowerBound(pendingMatch));
    }
  }

  if (pendingMatches.length === 0) {
    return {
      skipped: false,
      linkedCount: 0,
      scannedMatchCount: 0,
      scannedReplayCount: 0,
    };
  }

  const alreadyLinkedReplayIds = new Set(
    (
      await prisma.tournamentMatch.findMany({
        where: {
          sourceGameStatsId: { not: null },
        },
        select: { sourceGameStatsId: true },
      })
    )
      .map((match) => match.sourceGameStatsId)
      .filter((id): id is number => typeof id === "number")
  );

  const replays = await prisma.gameStats.findMany({
    where: {
      is_final: true,
      OR: [
        { played_on: { gte: new Date(earliestReplayBound) } },
        { timestamp: { gte: new Date(earliestReplayBound) } },
        { createdAt: { gte: new Date(earliestReplayBound) } },
      ],
    },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
    take: 80,
    select: {
      id: true,
      replayHash: true,
      winner: true,
      players: true,
      played_on: true,
      timestamp: true,
      map: true,
      original_filename: true,
    },
  });

  const replayCandidates = replays
    .filter((replay) => !alreadyLinkedReplayIds.has(replay.id))
    .map((replay) => toReplayCandidate(replay, [...entrantsByEntryId.values()]));

  const matchCandidates = new Map<number, ReplayCandidate[]>();
  const replayToMatches = new Map<number, number[]>();

  for (const match of pendingMatches) {
    const playerOne = entrantsByEntryId.get(match.playerOneEntryId) ?? null;
    const playerTwo = entrantsByEntryId.get(match.playerTwoEntryId) ?? null;
    if (!playerOne || !playerTwo) continue;

    const lowerBound = getMatchLowerBound(match);
    const compatible = replayCandidates.filter((candidate) => {
      const replayTimestamp = getReplayTimestamp(candidate);
      if (replayTimestamp != null && replayTimestamp < lowerBound) {
        return false;
      }

      if (!replayMatchesAssignedPlayers(candidate, playerOne, playerTwo)) {
        return false;
      }

      return Boolean(inferReplayWinnerEntryId(candidate, playerOne, playerTwo));
    });

    matchCandidates.set(match.id, compatible);

    for (const candidate of compatible) {
      const current = replayToMatches.get(candidate.gameStatsId) ?? [];
      current.push(match.id);
      replayToMatches.set(candidate.gameStatsId, current);
    }
  }

  const updates: Array<{
    matchId: number;
    sourceGameStatsId: number;
    winnerEntryId: number;
    completedAt: Date;
  }> = [];

  for (const match of pendingMatches) {
    const candidates = matchCandidates.get(match.id) ?? [];
    if (candidates.length !== 1) continue;

    const candidate = candidates[0];
    const replayUsage = replayToMatches.get(candidate.gameStatsId) ?? [];
    if (replayUsage.length !== 1) continue;

    const playerOne = entrantsByEntryId.get(match.playerOneEntryId) ?? null;
    const playerTwo = entrantsByEntryId.get(match.playerTwoEntryId) ?? null;
    const winnerEntryId = inferReplayWinnerEntryId(candidate, playerOne, playerTwo);
    if (!winnerEntryId) continue;

    const completedAt = candidate.playedOn ? new Date(candidate.playedOn) : new Date();
    updates.push({
      matchId: match.id,
      sourceGameStatsId: candidate.gameStatsId,
      winnerEntryId,
      completedAt,
    });
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((update) =>
        prisma.tournamentMatch.update({
          where: { id: update.matchId },
          data: {
            sourceGameStatsId: update.sourceGameStatsId,
            winnerEntryId: update.winnerEntryId,
            status: "completed",
            completedAt: update.completedAt,
          },
        })
      )
    );
  }

  return {
    skipped: false,
    linkedCount: updates.length,
    scannedMatchCount: pendingMatches.length,
    scannedReplayCount: replayCandidates.length,
  };
}
