import { NextRequest, NextResponse } from "next/server";

import { loadLobbyRecentMatches } from "@/lib/lobbyRecentMatches";
import { loadPublicReplayGeneration } from "@/lib/publicReplayGeneration";
import { getPrisma } from "@/lib/prisma";
import type {
  LobbyMatchRow,
} from "@/lib/lobby";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 96;

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

  // Pull one canonical visible lookahead row. Filtering happens inside the
  // loader before offset, so this cursor is measured in rendered rows.
  const [rows, generation] = await Promise.all([
    loadLobbyRecentMatches({
      offset,
      limit: limit + 1,
    }),
    loadPublicReplayGeneration(getPrisma()),
  ]);

  const matches = rows.slice(0, limit) as LobbyMatchRow[];

  return NextResponse.json(
    {
      ok: true,
      generation,
      matches,
      nextOffset: offset + matches.length,
      hasMore: rows.length > limit,
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
