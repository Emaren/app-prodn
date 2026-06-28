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
      funding.stakingWalletOperatingReserveWolo == null
        ? null
        : Math.max(0, funding.stakingWalletOperatingReserveWolo);
    return NextResponse.json({
      ...runtimeConfig,
      stakingWalletReserveHeadroomWolo: funding.stakingWalletReserveHeadroomWolo,
      operatorFunding: {
        stakingWalletBalanceWolo: funding.stakingWalletBalanceWolo,
        totalConfirmedStakedWolo: funding.totalConfirmedStakedWolo,
        visibleStakingWalletReserveWolo,
        stakingWalletOperatingReserveWolo:
          funding.stakingWalletOperatingReserveWolo,
        stakingWalletReserveTargetWolo:
          funding.stakingWalletReserveTargetWolo,
        stakingWalletReserveSurplusWolo:
          funding.stakingWalletReserveSurplusWolo,
        requiredStakingWalletBalanceWolo: funding.requiredStakingWalletBalanceWolo,
        stakingWalletReserveHeadroomWolo: funding.stakingWalletReserveHeadroomWolo,
        operatorTopUpNeededWolo: funding.operatorTopUpNeededWolo,
        walletUnderfunded: funding.walletUnderfunded,
        operationalReserveHealthy: funding.operationalReserveHealthy,
        warning: funding.operatorWarning,
      },
    });
  } catch {
    return NextResponse.json(runtimeConfig);
  }
}
