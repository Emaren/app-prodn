import { NextRequest, NextResponse } from "next/server";

import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  const mode = modeParam === "all_time" ? "all_time" : "weekly";
  const rawLimit = Number(url.searchParams.get("limit") || "64");
  const limit = Math.max(
    8,
    Math.min(256, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 64),
  );

  try {
    const prisma = getPrisma();
    const board = await loadLobbyWoloEarnersBoard(prisma, { mode });

    return NextResponse.json(
      {
        ok: true,
        board: {
          ...board,
          entries: board.entries.slice(0, limit),
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
