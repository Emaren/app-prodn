import { NextRequest, NextResponse } from "next/server";

import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { normalizeLeaderboardLane } from "@/lib/leaderboardLane";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 128;
const MAX_LIMIT = 600;

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
  const lane = normalizeLeaderboardLane(request.nextUrl.searchParams.get("lane"));
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 64) || null;

  const leaderboard = await loadLobbyLeaderboard(getPrisma(), {
    offset,
    limit,
    includePendingClaimed: false,
    lane,
    query,
  });

  // The leaderboard helper may enrich a selection with additional
  // rows. The HTTP pagination contract must remain strict: a request
  // for N rows may advance by at most N rows.
  const entries = leaderboard.entries.slice(0, limit);
  const nextOffset = offset + entries.length;

  return NextResponse.json({
    ok: true,
    ...leaderboard,
    entries,
    nextOffset,
    hasMore:
      entries.length > 0 &&
      nextOffset < leaderboard.trackedPlayers,
    trackedPlayers: leaderboard.trackedPlayers,
    rankedPlayers: leaderboard.rankedPlayers,
  });
}
