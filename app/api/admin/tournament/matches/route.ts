import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { PrismaClient } from "@/lib/generated/prisma";
import {
  normalizeTournamentMatchStatus,
  type AdminReplayCandidate,
  type LobbyTournamentEntrant,
} from "@/lib/lobby";
import {
  inferReplayWinnerEntryId,
  replayMatchesAssignedPlayers,
  toReplayCandidate,
} from "@/lib/replayProof";
import { reconcileTournamentMatchProofs } from "@/lib/tournamentProofReconciler";
import { toLobbyEntrant, toLobbyTournamentMatch } from "@/lib/tournamentMatchView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchInput = {
  id?: number | null;
  round?: number;
  position?: number;
  label?: string | null;
  status?: string;
  playerOneEntryId?: number | null;
  playerTwoEntryId?: number | null;
  winnerEntryId?: number | null;
  sourceGameStatsId?: number | null;
  scheduledAt?: string | null;
};

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

async function getEditableTournament(
  prisma: PrismaClient
) {
  return prisma.tournament.findFirst({
    where: {
      OR: [{ featured: true }, { status: { in: ["planning", "open", "active"] } }],
    },
    orderBy: [{ featured: "desc" }, { startsAt: "asc" }, { createdAt: "desc" }],
    include: {
      entries: {
        orderBy: { joinedAt: "asc" },
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
        orderBy: [{ round: "asc" }, { position: "asc" }],
        include: {
          sourceGameStats: {
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
          },
          playerOne: { include: { user: true } },
          playerTwo: { include: { user: true } },
        },
      },
    },
  });
}

async function loadReplayCandidates(
  prisma: PrismaClient,
  entrants: LobbyTournamentEntrant[]
): Promise<AdminReplayCandidate[]> {
  if (entrants.length === 0) return [];

  const replays = await prisma.gameStats.findMany({
    where: {
      is_final: true,
    },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
    take: 30,
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

  return replays
    .map((replay) => toReplayCandidate(replay, entrants))
    .filter((candidate) => candidate.matchedEntryIds.length > 0)
    .sort((left, right) => {
      if (right.matchedEntryIds.length !== left.matchedEntryIds.length) {
        return right.matchedEntryIds.length - left.matchedEntryIds.length;
      }

      return (right.playedOn || "").localeCompare(left.playedOn || "");
    });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  await reconcileTournamentMatchProofs(admin.prisma);
  const tournament = await getEditableTournament(admin.prisma);
  if (!tournament) {
    return NextResponse.json({
      tournamentId: null,
      entrants: [],
      matches: [],
      replayCandidates: [],
    });
  }

  const entrants = tournament.entries.map(toLobbyEntrant);
  const replayCandidates = await loadReplayCandidates(admin.prisma, entrants);

  return NextResponse.json({
    tournamentId: tournament.id,
    entrants,
    matches: tournament.matches.map(toLobbyTournamentMatch),
    replayCandidates,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const tournamentId =
    typeof body.tournamentId === "number"
      ? body.tournamentId
      : typeof body.tournamentId === "string"
        ? Number(body.tournamentId)
        : NaN;
  const matches = Array.isArray(body.matches) ? (body.matches as MatchInput[]) : [];

  if (!Number.isFinite(tournamentId) || tournamentId < 1) {
    return NextResponse.json({ detail: "Invalid tournament id." }, { status: 400 });
  }

  const tournament = await admin.prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true },
  });

  if (!tournament) {
    return NextResponse.json({ detail: "Tournament not found." }, { status: 404 });
  }

  const entries = await admin.prisma.tournamentEntry.findMany({
    where: { tournamentId },
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
  });
  const validEntryIds = new Set(entries.map((entry) => entry.id));
  const entrants = entries.map(toLobbyEntrant);
  const entrantsById = new Map(
    entrants
      .filter((entrant): entrant is LobbyTournamentEntrant & { entryId: number } =>
        typeof entrant.entryId === "number"
      )
      .map((entrant) => [entrant.entryId, entrant])
  );
  const requestedReplayIds = matches
    .map((match) => (typeof match.sourceGameStatsId === "number" ? match.sourceGameStatsId : null))
    .filter((id): id is number => typeof id === "number");
  const duplicateReplayIds = requestedReplayIds.filter(
    (id, index) => requestedReplayIds.indexOf(id) !== index
  );
  if (duplicateReplayIds.length > 0) {
    return NextResponse.json(
      { detail: "A parsed replay cannot be linked to more than one bracket match." },
      { status: 400 }
    );
  }
  const existingReplayAssignments = requestedReplayIds.length
    ? await admin.prisma.tournamentMatch.findMany({
        where: {
          sourceGameStatsId: { in: requestedReplayIds },
          ...(matches.some((match) => typeof match.id === "number" && match.id > 0)
            ? {
                id: {
                  notIn: matches
                    .map((match) => (typeof match.id === "number" ? match.id : null))
                    .filter((id): id is number => typeof id === "number" && id > 0),
                },
              }
            : {}),
        },
        select: { id: true, sourceGameStatsId: true },
      })
    : [];
  const existingReplayAssignmentIds = new Set(
    existingReplayAssignments
      .map((match) => match.sourceGameStatsId)
      .filter((id): id is number => typeof id === "number")
  );
  const replays = requestedReplayIds.length
    ? await admin.prisma.gameStats.findMany({
        where: { id: { in: requestedReplayIds } },
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
      })
    : [];
  const replayCandidatesById = new Map(replays.map((replay) => [replay.id, toReplayCandidate(replay, entrants)]));

  for (const match of matches) {
    const round = Number(match.round ?? 1);
    const position = Number(match.position ?? 1);
    if (!Number.isFinite(round) || round < 1 || !Number.isFinite(position) || position < 1) {
      return NextResponse.json({ detail: "Round and position must be positive numbers." }, { status: 400 });
    }

    for (const entryId of [match.playerOneEntryId, match.playerTwoEntryId, match.winnerEntryId]) {
      if (entryId == null) continue;
      if (!validEntryIds.has(Number(entryId))) {
        return NextResponse.json({ detail: "Bracket contains an entrant outside this tournament." }, { status: 400 });
      }
    }

    const playerIds = [match.playerOneEntryId, match.playerTwoEntryId].filter(
      (value): value is number => typeof value === "number"
    );
    if (
      typeof match.winnerEntryId === "number" &&
      playerIds.length > 0 &&
      !playerIds.includes(match.winnerEntryId)
    ) {
      return NextResponse.json({ detail: "Winner must be one of the assigned players." }, { status: 400 });
    }

    if (
      typeof match.playerOneEntryId === "number" &&
      typeof match.playerTwoEntryId === "number" &&
      match.playerOneEntryId === match.playerTwoEntryId
    ) {
      return NextResponse.json({ detail: "A match cannot assign the same entrant twice." }, { status: 400 });
    }

    if (typeof match.sourceGameStatsId === "number") {
      if (existingReplayAssignmentIds.has(match.sourceGameStatsId)) {
        return NextResponse.json(
          { detail: "A parsed replay can only be linked to one bracket match." },
          { status: 400 }
        );
      }

      if (
        typeof match.playerOneEntryId !== "number" ||
        typeof match.playerTwoEntryId !== "number"
      ) {
        return NextResponse.json(
          { detail: "Assign both players before linking a parsed replay." },
          { status: 400 }
        );
      }

      const replay = replayCandidatesById.get(match.sourceGameStatsId);
      if (!replay) {
        return NextResponse.json({ detail: "Linked parsed replay was not found." }, { status: 400 });
      }

      const playerOne = entrantsById.get(match.playerOneEntryId) ?? null;
      const playerTwo = entrantsById.get(match.playerTwoEntryId) ?? null;

      if (!replayMatchesAssignedPlayers(replay, playerOne, playerTwo)) {
        return NextResponse.json(
          {
            detail:
              "Linked replay does not contain both assigned entrants. Use the correct parsed match or update the bracket slots.",
          },
          { status: 400 }
        );
      }

      const inferredWinnerEntryId = inferReplayWinnerEntryId(replay, playerOne, playerTwo);
      if (!inferredWinnerEntryId) {
        return NextResponse.json(
          { detail: "Linked replay does not resolve a winner between the assigned entrants." },
          { status: 400 }
        );
      }

      if (
        typeof match.winnerEntryId === "number" &&
        match.winnerEntryId !== inferredWinnerEntryId
      ) {
        return NextResponse.json(
          { detail: "Manual winner selection does not match the linked parsed replay." },
          { status: 400 }
        );
      }
    }
  }

  const persistedIds: number[] = [];

  try {
    await admin.prisma.$transaction(async (tx) => {
      for (const input of matches) {
        const scheduledAt = parseDate(input.scheduledAt);
        if (scheduledAt === "invalid") {
          throw new Error("Invalid scheduled date.");
        }

        const status = normalizeTournamentMatchStatus(input.status);
        const replay =
          typeof input.sourceGameStatsId === "number"
            ? replayCandidatesById.get(input.sourceGameStatsId) ?? null
            : null;
        const playerOne =
          typeof input.playerOneEntryId === "number"
            ? entrantsById.get(input.playerOneEntryId) ?? null
            : null;
        const playerTwo =
          typeof input.playerTwoEntryId === "number"
            ? entrantsById.get(input.playerTwoEntryId) ?? null
            : null;
        const inferredWinnerEntryId =
          replay && playerOne && playerTwo
            ? inferReplayWinnerEntryId(replay, playerOne, playerTwo)
            : null;
        const completedAt = replay?.playedOn
          ? new Date(replay.playedOn)
          : status === "completed"
            ? new Date()
            : null;
        const payload = {
          round: Number(input.round ?? 1),
          position: Number(input.position ?? 1),
          label: typeof input.label === "string" ? input.label.trim().slice(0, 80) || null : null,
          status: replay ? "completed" : status,
          sourceGameStatsId:
            typeof input.sourceGameStatsId === "number" ? input.sourceGameStatsId : null,
          playerOneEntryId:
            typeof input.playerOneEntryId === "number" ? input.playerOneEntryId : null,
          playerTwoEntryId:
            typeof input.playerTwoEntryId === "number" ? input.playerTwoEntryId : null,
          winnerEntryId:
            replay && inferredWinnerEntryId
              ? inferredWinnerEntryId
              : typeof input.winnerEntryId === "number"
                ? input.winnerEntryId
                : null,
          scheduledAt: scheduledAt || null,
          completedAt,
        };

        if (typeof input.id === "number" && input.id > 0) {
          const updated = await tx.tournamentMatch.update({
            where: { id: input.id },
            data: payload,
            select: { id: true },
          });
          persistedIds.push(updated.id);
        } else {
          const created = await tx.tournamentMatch.create({
            data: {
              tournamentId,
              ...payload,
            },
            select: { id: true },
          });
          persistedIds.push(created.id);
        }
      }

      await tx.tournamentMatch.deleteMany({
        where: {
          tournamentId,
          ...(persistedIds.length ? { id: { notIn: persistedIds } } : {}),
        },
      });
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to save bracket.";
    return NextResponse.json({ detail }, { status: 400 });
  }

  await reconcileTournamentMatchProofs(admin.prisma, { force: true, tournamentId });
  const refreshed = await getEditableTournament(admin.prisma);
  const replayCandidates = await loadReplayCandidates(admin.prisma, entrants);
  return NextResponse.json({
    ok: true,
    tournamentId,
    entrants: refreshed?.entries.map(toLobbyEntrant) ?? [],
    matches: refreshed?.matches.map(toLobbyTournamentMatch) ?? [],
    replayCandidates,
  });
}
