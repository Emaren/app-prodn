import { NextRequest, NextResponse } from "next/server";

import { loadLobbyRecentMatches } from "@/lib/lobbyRecentMatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

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

  const rows = await loadLobbyRecentMatches({ offset, limit: limit + 1 });
  const matches = rows.slice(0, limit);

  return NextResponse.json({
    ok: true,
    matches,
    nextOffset: offset + matches.length,
    hasMore: rows.length > limit,
  });
}
