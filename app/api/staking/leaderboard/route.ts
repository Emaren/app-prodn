import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadStakingLeaderboard, normalizeStakingBoard } from "@/lib/staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const board = normalizeStakingBoard(request.nextUrl.searchParams.get("board"));
    const leaderboard = await loadStakingLeaderboard(prisma, board);
    return NextResponse.json(leaderboard);
  } catch (error) {
    console.error("Failed to load staking leaderboard:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not load staking leaderboard." },
      { status: 500 }
    );
  }
}
