import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadStakingSummary, normalizeStakingPeriod, STAKING_PERIODS } from "@/lib/staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const selectedPeriod = normalizeStakingPeriod(request.nextUrl.searchParams.get("period"));
    const periodEntries = await Promise.all(
      STAKING_PERIODS.map(async (period) => [period.key, await loadStakingSummary(prisma, period.key)] as const)
    );

    return NextResponse.json({
      selectedPeriod,
      summary: Object.fromEntries(periodEntries),
    });
  } catch (error) {
    console.error("Failed to load staking summary:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not load staking summary." },
      { status: 500 }
    );
  }
}
