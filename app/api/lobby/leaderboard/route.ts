import { NextRequest, NextResponse } from "next/server";

import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 120;

function readIntegerParam(request: NextRequest, name: string, fallback: number) {
  const rawValue = request.nextUrl.searchParams.get(name);
  if (!rawValue) return fallback;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const offset = Math.max(0, readIntegerParam(request, "offset", 0));
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, readIntegerParam(request, "limit", DEFAULT_LIMIT))
  );

  const leaderboard = await loadLobbyLeaderboard(getPrisma(), {
    offset,
    limit,
    includePendingClaimed: false,
  });

  const nextOffset = offset + leaderboard.entries.length;

  return NextResponse.json({
    ok: true,
    entries: leaderboard.entries,
    nextOffset,
    hasMore: nextOffset < leaderboard.trackedPlayers,
    trackedPlayers: leaderboard.trackedPlayers,
    rankedPlayers: leaderboard.rankedPlayers,
  });
}
