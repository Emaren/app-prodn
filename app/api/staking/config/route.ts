import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  loadStakingExecutionLimits,
  STAKING_STAKE_SAFETY_DETAIL,
  STAKING_STAKE_SAFETY_PAUSED,
  STAKING_UNSTAKE_SAFETY_DETAIL,
  STAKING_UNSTAKE_SAFETY_PAUSED,
} from "@/lib/stakingExecution";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runtimeConfig = getWoloStakingRuntime();
  const safetyConfig = {
    ...runtimeConfig,
    stakeReady: STAKING_STAKE_SAFETY_PAUSED ? false : runtimeConfig.stakeReady,
    stakeReadyDetail: STAKING_STAKE_SAFETY_PAUSED
      ? STAKING_STAKE_SAFETY_DETAIL
      : null,
    unstakeReady: STAKING_UNSTAKE_SAFETY_PAUSED ? false : runtimeConfig.unstakeReady,
    unstakeReadyDetail: STAKING_UNSTAKE_SAFETY_PAUSED
      ? STAKING_UNSTAKE_SAFETY_DETAIL
      : runtimeConfig.unstakeReadyDetail,
  };
  try {
    const funding = await loadStakingExecutionLimits(getPrisma(), 0);
    const visibleStakingWalletReserveWolo =
      funding.stakingWalletOperatingReserveWolo == null
        ? null
        : Math.max(0, funding.stakingWalletOperatingReserveWolo);
    return NextResponse.json({
      ...safetyConfig,
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
    return NextResponse.json(safetyConfig);
  }
}
