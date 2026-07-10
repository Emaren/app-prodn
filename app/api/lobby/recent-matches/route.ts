import { NextRequest, NextResponse } from "next/server";

import { loadLobbyRecentMatches } from "@/lib/lobbyRecentMatches";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

function readIntegerParam(request: NextRequest, name: string, fallback: number) {
  const rawValue = request.nextUrl.searchParams.get(name);
  if (!rawValue) return fallback;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNamedPlayerCount(row: unknown) {
  const candidate =
    row && typeof row === "object"
      ? (row as Record<string, unknown>)
      : {};

  let value = candidate.players;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return 0;
    }
  }

  if (!Array.isArray(value)) return 0;

  return value.filter((player) => {
    if (!player || typeof player !== "object" || Array.isArray(player)) {
      return false;
    }

    const name = String(
      (player as Record<string, unknown>).name || ""
    ).trim();

    return Boolean(name) && name.toLowerCase() !== "unknown";
  }).length;
}

function isLobbyWorthyMatch(row: unknown) {
  const candidate =
    row && typeof row === "object"
      ? (row as Record<string, unknown>)
      : {};

  const parseReason = String(
    candidate.parse_reason || candidate.parseReason || ""
  ).toLowerCase();

  // These are failed file-finalization artifacts, not public matches.
  if (
    parseReason === "watcher_final_unparsed" &&
    readNamedPlayerCount(row) < 2
  ) {
    return false;
  }

  return true;
}

export async function GET(request: NextRequest) {
  const offset = Math.max(0, readIntegerParam(request, "offset", 0));
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, readIntegerParam(request, "limit", DEFAULT_LIMIT))
  );

  // Pull a little extra so filtered watcher artifacts do not leave
  // visible holes in the public feed.
  const rows = await loadLobbyRecentMatches({
    offset,
    limit: limit + 13,
  });

  const matches = cleanPublicGameRows(rows, {
    includeReview: true,
    includeLive: false,
  })
    .filter(isLobbyWorthyMatch)
    .slice(0, limit);

  return NextResponse.json(
    {
      ok: true,
      matches,
      nextOffset: offset + matches.length,
      hasMore: rows.length > limit || matches.length === limit,
    },
    {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
