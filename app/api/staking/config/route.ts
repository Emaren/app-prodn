import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadStakingExecutionLimits } from "@/lib/stakingExecution";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runtimeConfig = getWoloStakingRuntime();
  try {
    const funding = await loadStakingExecutionLimits(getPrisma(), 0);
    const visibleStakingWalletReserveWolo =
      funding.stakingWalletBalanceWolo == null
        ? null
        : Math.max(0, funding.stakingWalletBalanceWolo - funding.totalConfirmedStakedWolo);
    return NextResponse.json({
      ...runtimeConfig,
      stakingWalletReserveHeadroomWolo: funding.stakingWalletReserveHeadroomWolo,
      operatorFunding: {
        stakingWalletBalanceWolo: funding.stakingWalletBalanceWolo,
        totalConfirmedStakedWolo: funding.totalConfirmedStakedWolo,
        visibleStakingWalletReserveWolo,
        requiredStakingWalletBalanceWolo: funding.requiredStakingWalletBalanceWolo,
        stakingWalletReserveHeadroomWolo: funding.stakingWalletReserveHeadroomWolo,
        operatorTopUpNeededWolo: funding.operatorTopUpNeededWolo,
        walletUnderfunded: funding.walletUnderfunded,
        warning: funding.operatorWarning,
      },
    });
  } catch {
    return NextResponse.json(runtimeConfig);
  }
}
