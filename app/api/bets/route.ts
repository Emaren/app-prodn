import { NextRequest, NextResponse } from "next/server";

import { loadBetBoardSnapshot } from "@/lib/bets";
import { queueBetMarketEnsure } from "@/lib/betMarketEnsureQueue";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const sessionUid = await getSessionUid(request);
    queueBetMarketEnsure(prisma, 0);
    const payload = await loadBetBoardSnapshot(prisma, sessionUid, {
      ensureMarkets: false,
      settlementSurfaceMode: "fast",
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "CDN-Cache-Control": "no-store",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    console.error("Failed to load bet board:", error);
    return NextResponse.json({ detail: "Bet board unavailable." }, { status: 500 });
  }
}
