import { NextRequest, NextResponse } from "next/server";

import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { normalizeLeaderboardLane } from "@/lib/leaderboardLane";
import { normalizeLeaderboardScope } from "@/lib/leaderboardScope";
import {
  normalizeLeaderboardSortDirection,
  normalizeLeaderboardSortKey,
} from "@/lib/leaderboardSort";
import { getPrisma } from "@/lib/prisma";
import { buildPreviewDataUrl } from "@/lib/previewDataSource";

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
  const previewUrl =
    buildPreviewDataUrl(
      "/api/lobby/leaderboard",
      request.nextUrl.searchParams,
    );

  if (previewUrl) {
    const response =
      await fetch(
        previewUrl,
        {
          cache: "no-store",
          headers: {
            Accept:
              "application/json",
            "Cache-Control":
              "no-cache",
          },
        },
      );

    const body =
      await response.text();

    return new NextResponse(
      body,
      {
        status:
          response.status,
        headers: {
          "Content-Type":
            response.headers.get(
              "content-type",
            ) ??
            "application/json; charset=utf-8",
          "Cache-Control":
            "no-store",
          "X-AoE2WAR-Preview-Data":
            "production-read-through",
        },
      },
    );
  }

  const offset = Math.max(0, readIntegerParam(request, "offset", 0));
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, readIntegerParam(request, "limit", DEFAULT_LIMIT))
  );
  const lane = normalizeLeaderboardLane(request.nextUrl.searchParams.get("lane"));
  const scope = normalizeLeaderboardScope(
    request.nextUrl.searchParams.get(
      "scope",
    ),
  );
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 64) || null;
  const sortKey = normalizeLeaderboardSortKey(
    request.nextUrl.searchParams.get("sort")
  );
  const sortDirection = sortKey
    ? normalizeLeaderboardSortDirection(
        request.nextUrl.searchParams.get("dir")
      )
    : null;

  const leaderboard = await loadLobbyLeaderboard(getPrisma(), {
    offset,
    limit,
    includePendingClaimed: false,
    includeFeaturedClaimed: false,
    lane,
    scope,
    query,
    sortKey,
    sortDirection,
  });

  // This route is always strict even if a future caller accidentally
  // enables a lobby-only enrichment option: N requested rows advance
  // by at most N rows.
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
