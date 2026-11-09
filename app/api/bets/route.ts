import { NextRequest, NextResponse } from "next/server";

import { loadBetBoardSnapshot } from "@/lib/bets";
import { isRestrictedBetsReadDenied, publicBetsReadHoldPayload } from "@/lib/betsPublicReadHold";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const sessionUid = await getSessionUid(request);
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
    if (isRestrictedBetsReadDenied(error)) {
      // A known protected finance-table read denial is a public HOLD, not a
      // generic 500 or permission to query through the legacy writer.
      return NextResponse.json(publicBetsReadHoldPayload(), {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
          "CDN-Cache-Control": "no-store",
          Vary: "Cookie",
        },
      });
    }
    console.error("Failed to load bet board:", error);
    return NextResponse.json({ detail: "Bet board unavailable." }, { status: 500 });
  }
}
