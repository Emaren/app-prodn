import { NextRequest, NextResponse } from "next/server";

import { loadBetBoardSnapshot } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const sessionUid = await getSessionUid(request);
    const payload = await loadBetBoardSnapshot(prisma, sessionUid);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load bet board:", error);
    return NextResponse.json({ detail: "Bet board unavailable." }, { status: 500 });
  }
}
