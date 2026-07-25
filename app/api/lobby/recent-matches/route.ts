import { NextRequest, NextResponse } from "next/server";

import { loadLobbyRecentMatches } from "@/lib/lobbyRecentMatches";
import {
  hydrateLobbyHumanEvidenceMarkers,
} from "@/lib/lobbyHumanEvidence";
import type {
  LobbyMatchRow,
} from "@/lib/lobby";
import {
  getPrisma,
} from "@/lib/prisma";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import {
  isPublicBattleArchiveRow,
} from "@/lib/publicBattleArchiveEligibility";

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

  const visibleMatches =
    cleanPublicGameRows(
      rows,
      {
        includeReview:
          true,

        includeLive:
          false,
      }
    )
      .filter(
        isPublicBattleArchiveRow
      )
      .slice(
        0,
        limit
      ) as LobbyMatchRow[];

  const matches =
    await hydrateLobbyHumanEvidenceMarkers(
      getPrisma(),
      visibleMatches
    );

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
