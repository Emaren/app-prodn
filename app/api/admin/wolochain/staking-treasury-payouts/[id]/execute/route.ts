import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  StakingTreasuryPayoutError,
  executeStakingTreasuryPayout,
} from "@/lib/stakingTreasuryPayouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { id } = await context.params;
    const distributionId = Number.parseInt(id, 10);
    if (!Number.isFinite(distributionId) || distributionId < 1) {
      return NextResponse.json(
        { detail: "Staking reward distribution id is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await executeStakingTreasuryPayout(gate.prisma, distributionId);

    return NextResponse.json(result, {
      status: result.ok ? 200 : 409,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof StakingTreasuryPayoutError) {
      return NextResponse.json(
        {
          detail: error.message,
          code: error.code,
        },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }

    console.error("Failed to execute staking Treasury payout:", error);
    return NextResponse.json(
      { detail: "Staking Treasury payout execution failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
