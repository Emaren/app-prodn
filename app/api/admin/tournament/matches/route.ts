import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { PrismaClient } from "@/lib/generated/prisma";
import {
  normalizeTournamentMatchStatus,
  type LobbyTournamentEntrant,
  type LobbyTournamentMatch,
} from "@/lib/lobby";

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
          playerOne: { include: { user: true } },
          playerTwo: { include: { user: true } },
        },
      },
    },
  });
}

function toEntrant(entry: {
  id: number;
  joinedAt: Date;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
    verificationLevel: number;
    verified: boolean;
  };
}): LobbyTournamentEntrant {
  return {
    entryId: entry.id,
    uid: entry.user.uid,
    inGameName: entry.user.inGameName,
    steamPersonaName: entry.user.steamPersonaName,
    verificationLevel: entry.user.verificationLevel,
    verified: entry.user.verified,
    joinedAt: entry.joinedAt.toISOString(),
  };
}

function toMatch(match: {
  id: number;
  round: number;
  position: number;
  label: string | null;
  status: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  winnerEntryId: number | null;
  playerOne: {
    id: number;
    joinedAt: Date;
    user: {
      uid: string;
      inGameName: string | null;
      steamPersonaName: string | null;
      verificationLevel: number;
      verified: boolean;
    };
  } | null;
  playerTwo: {
    id: number;
    joinedAt: Date;
    user: {
      uid: string;
      inGameName: string | null;
      steamPersonaName: string | null;
      verificationLevel: number;
      verified: boolean;
    };
  } | null;
}): LobbyTournamentMatch {
  return {
    id: match.id,
    round: match.round,
    position: match.position,
    label: match.label,
    status: normalizeTournamentMatchStatus(match.status),
    scheduledAt: match.scheduledAt ? match.scheduledAt.toISOString() : null,
    completedAt: match.completedAt ? match.completedAt.toISOString() : null,
    winnerEntryId: match.winnerEntryId,
    playerOne: match.playerOne ? toEntrant(match.playerOne) : null,
    playerTwo: match.playerTwo ? toEntrant(match.playerTwo) : null,
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const tournament = await getEditableTournament(admin.prisma);
  if (!tournament) {
    return NextResponse.json({
      tournamentId: null,
      entrants: [],
      matches: [],
    });
  }

  return NextResponse.json({
    tournamentId: tournament.id,
    entrants: tournament.entries.map(toEntrant),
    matches: tournament.matches.map(toMatch),
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
    select: { id: true },
  });
  const validEntryIds = new Set(entries.map((entry) => entry.id));

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
        const payload = {
          round: Number(input.round ?? 1),
          position: Number(input.position ?? 1),
          label: typeof input.label === "string" ? input.label.trim().slice(0, 80) || null : null,
          status,
          playerOneEntryId:
            typeof input.playerOneEntryId === "number" ? input.playerOneEntryId : null,
          playerTwoEntryId:
            typeof input.playerTwoEntryId === "number" ? input.playerTwoEntryId : null,
          winnerEntryId: typeof input.winnerEntryId === "number" ? input.winnerEntryId : null,
          scheduledAt: scheduledAt || null,
          completedAt: status === "completed" ? new Date() : null,
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

  const refreshed = await getEditableTournament(admin.prisma);
  return NextResponse.json({
    ok: true,
    tournamentId,
    entrants: refreshed?.entries.map(toEntrant) ?? [],
    matches: refreshed?.matches.map(toMatch) ?? [],
  });
}
