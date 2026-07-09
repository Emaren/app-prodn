import { NextRequest, NextResponse } from "next/server";

import { ensureBetMarkets, loadBetBoardSnapshot } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let lastBackgroundEnsureAt = 0;
let backgroundEnsurePromise: Promise<void> | null = null;

function queueBetMarketEnsure(prisma: ReturnType<typeof getPrisma>) {
  const now = Date.now();
  if (backgroundEnsurePromise || now - lastBackgroundEnsureAt < 15_000) {
    return;
  }

  lastBackgroundEnsureAt = now;

  setTimeout(() => {
    if (backgroundEnsurePromise) return;

    backgroundEnsurePromise = ensureBetMarkets(prisma)
      .catch((error) => {
        console.warn("Background bet-market ensure failed:", error);
      })
      .finally(() => {
        backgroundEnsurePromise = null;
      });
  }, 5_000);
}

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const sessionUid = await getSessionUid(request);
    queueBetMarketEnsure(prisma);
    const payload = await loadBetBoardSnapshot(prisma, sessionUid, {
      ensureMarkets: false,
      settlementSurfaceMode: "fast",
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load bet board:", error);
    return NextResponse.json({ detail: "Bet board unavailable." }, { status: 500 });
  }
}
