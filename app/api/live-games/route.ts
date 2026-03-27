import { NextRequest, NextResponse } from "next/server";

import { loadLiveGamesSnapshot } from "@/lib/liveGames";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const snapshot = await loadLiveGamesSnapshot(getPrisma());

    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({
        liveCount: snapshot.liveCount,
        readyCount: snapshot.readyCount,
        updatedAt: snapshot.updatedAt,
      });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Failed to load live games:", error);
    return NextResponse.json({ detail: "Live games unavailable." }, { status: 500 });
  }
}

