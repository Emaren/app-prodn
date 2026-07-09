import { NextRequest, NextResponse } from "next/server";

import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 128;

function readIntegerParam(request: NextRequest, name: string, fallback: number) {
  const rawValue = request.nextUrl.searchParams.get(name);
  if (!rawValue) return fallback;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode = modeParam === "all_time" ? "all_time" : "weekly";
  const offset = Math.max(0, readIntegerParam(request, "offset", 0));
  const limit = Math.max(
    8,
    Math.min(MAX_LIMIT, readIntegerParam(request, "limit", DEFAULT_LIMIT)),
  );

  try {
    const prisma = getPrisma();
    const board = await loadLobbyWoloEarnersBoard(prisma, { mode });
    const entries = board.entries.slice(offset, offset + limit);
    const nextOffset = offset + entries.length;
    const hasMore = nextOffset < board.totalParticipants;

    return NextResponse.json(
      {
        ok: true,
        nextOffset,
        hasMore,
        totalParticipants: board.totalParticipants,
        board: {
          ...board,
          entries,
          nextOffset,
          hasMore,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load lazy War Chest earners:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load War Chest earners." },
      { status: 500 },
    );
  }
}
