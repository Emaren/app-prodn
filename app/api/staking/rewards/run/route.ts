import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  calculateDailyStakingRewardDistribution,
  executeDailyStakingRewardPayouts,
  StakingActionError,
} from "@/lib/staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRunToken() {
  return (
    process.env.STAKING_REWARD_RUN_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get("x-staking-reward-token")?.trim() || "";
}

function parseUtcDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new StakingActionError("Use date=YYYY-MM-DD for staking reward backfills.", 400);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new StakingActionError("Use date=YYYY-MM-DD for staking reward backfills.", 400);
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  const configuredToken = getRunToken();
  if (!configuredToken) {
    return NextResponse.json(
      { detail: "STAKING_REWARD_RUN_TOKEN is not configured." },
      { status: 503 }
    );
  }

  if (bearerToken(request) !== configuredToken) {
    return NextResponse.json({ detail: "Unauthorized staking reward run." }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    const distributionDate = parseUtcDate(request.nextUrl.searchParams.get("date"));
    const distribution = await calculateDailyStakingRewardDistribution(
      prisma,
      distributionDate ?? undefined
    );
    const payout = await executeDailyStakingRewardPayouts(
      prisma,
      distribution.distributionId
    );

    return NextResponse.json({
      distribution,
      payout,
    });
  } catch (error) {
    if (error instanceof StakingActionError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    console.error("Failed to run staking reward distribution:", error);
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not run staking reward distribution.",
      },
      { status: 500 }
    );
  }
}
