import type { PrismaClient } from "@/lib/generated/prisma";
import { loadMainnetStakingPositions } from "@/lib/mainnetStakingPositions";
import { isWoloMainnet } from "@/lib/woloChain";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";
import {
  calculateStakingReservePolicy,
  MIN_STAKING_OPERATING_RESERVE_WOLO,
  resolveStakingReserveTargetUWolo,
  STAKING_UWOLO_PER_WOLO,
} from "@/lib/stakingReservePolicy";

const UWOLO_PER_WOLO = STAKING_UWOLO_PER_WOLO;
export { MIN_STAKING_OPERATING_RESERVE_WOLO };
export const STAKING_WALLET_TOP_UP_DETAIL =
  "Staking wallet reserve top-up needed.";
export const STAKING_WALLET_TOP_UP_HELP =
  "This wallet backs app-side staking withdrawals. Its chain balance must cover confirmed staking liability plus the 10,000 WOLO operating reserve target.";

type StakingExecutionLimits = {
  maxUnstakeWolo: number;
  totalConfirmedStakedWolo: number;
  activeStakers: number;
  stakingWalletBalanceWolo: number | null;
  stakingWalletBalanceUWolo: string | null;
  stakingWalletReserveHeadroomWolo: number;
  stakingWalletOperatingReserveWolo: number | null;
  stakingWalletReserveTargetWolo: number;
  stakingWalletReserveSurplusWolo: number | null;
  operationalReserveHealthy: boolean | null;
  unstakeHeadroomWolo: number;
  unstakeHeadroomUWolo: string;
  requiredStakingWalletBalanceWolo: number;
  operatorTopUpNeededWolo: number;
  walletUnderfunded: boolean;
  currentUnstakeExecutable: boolean;
  currentUnstakeReserveCheck: UnstakeReserveCheck;
  operatorWarning: string | null;
  balanceLookupError: string | null;
};

export type UnstakeReserveCheck = {
  executable: boolean;
  requestedUnstakeWolo: number;
  userConfirmedStakeWolo: number;
  totalConfirmedStakedWolo: number;
  stakingWalletBalanceWolo: number | null;
  operatorReserveWolo: number;
  remainingStakeAfterUnstakeWolo: number;
  requiredBalanceAfterUnstakeWolo: number;
  availableAfterUnstakeWolo: number | null;
  operatorTopUpNeededWolo: number;
};

function readHeadroomUWolo() {
  return resolveStakingReserveTargetUWolo(
    process.env.WOLO_STAKING_UNSTAKE_HEADROOM_UWOLO?.trim() ||
      process.env.WOLO_SETTLEMENT_FEE_HEADROOM_UWOLO?.trim() ||
      ""
  );
}

function woloFromUWolo(value: bigint) {
  return Number(value) / Number(UWOLO_PER_WOLO);
}

function wholeWoloToUWolo(value: number) {
  return BigInt(Math.max(0, Math.floor(value || 0))) * UWOLO_PER_WOLO;
}

export function getStakingWalletReserveHeadroomWolo() {
  return woloFromUWolo(readHeadroomUWolo());
}

export async function loadStakingExecutionLimits(
  prisma: PrismaClient,
  currentStakedWolo: number
): Promise<StakingExecutionLimits> {
  const runtime = getWoloStakingRuntime();
  const headroomUWolo = readHeadroomUWolo();
  const currentStake = Math.max(0, Math.floor(currentStakedWolo || 0));
  let stakingWalletBalanceUWolo: bigint | null = null;
  let balanceLookupError: string | null = null;
  const mainnetPositions = isWoloMainnet()
    ? await loadMainnetStakingPositions(prisma)
    : null;
  const legacyPositionTotals = mainnetPositions
    ? null
    : await prisma.stakingPosition.aggregate({
        where: {
          status: "active",
          currentStakedWolo: { gt: 0 },
        },
        _count: { _all: true },
        _sum: { currentStakedWolo: true },
      });
  const totalConfirmedStakedWolo = mainnetPositions
    ? mainnetPositions.reduce((sum, position) => sum + position.currentStakedWolo, 0)
    : Math.max(0, legacyPositionTotals?._sum.currentStakedWolo ?? 0);
  const activeStakers = mainnetPositions
    ? mainnetPositions.filter((position) => position.currentStakedWolo > 0).length
    : legacyPositionTotals?._count._all ?? 0;

  if (runtime.stakingWalletAddress) {
    try {
      stakingWalletBalanceUWolo = BigInt(
        await fetchWoloBalanceAmount(runtime.stakingWalletAddress)
      );
    } catch (error) {
      balanceLookupError =
        error instanceof Error ? error.message : "Staking wallet balance lookup failed.";
    }
  }

  const reservePolicy = calculateStakingReservePolicy({
    stakingWalletBalanceUWolo,
    totalConfirmedStakedWolo,
    reserveTargetUWolo: headroomUWolo,
  });
  const walletUnderfunded =
    reservePolicy.operationalReserveHealthy === false;
  const currentUnstakeReserveCheck = buildUnstakeReserveCheck({
    requestedUnstakeWolo: currentStake,
    userConfirmedStakeWolo: currentStake,
    totalConfirmedStakedWolo,
    stakingWalletBalanceUWolo,
    operatorReserveUWolo: headroomUWolo,
  });

  return {
    maxUnstakeWolo: currentStake,
    totalConfirmedStakedWolo,
    activeStakers,
    stakingWalletBalanceWolo:
      stakingWalletBalanceUWolo == null ? null : woloFromUWolo(stakingWalletBalanceUWolo),
    stakingWalletBalanceUWolo:
      stakingWalletBalanceUWolo == null ? null : stakingWalletBalanceUWolo.toString(),
    stakingWalletReserveHeadroomWolo: woloFromUWolo(headroomUWolo),
    stakingWalletOperatingReserveWolo:
      reservePolicy.operatingReserveUWolo == null
        ? null
        : woloFromUWolo(reservePolicy.operatingReserveUWolo),
    stakingWalletReserveTargetWolo: woloFromUWolo(
      reservePolicy.reserveTargetUWolo
    ),
    stakingWalletReserveSurplusWolo:
      reservePolicy.reserveSurplusUWolo == null
        ? null
        : woloFromUWolo(reservePolicy.reserveSurplusUWolo),
    operationalReserveHealthy: reservePolicy.operationalReserveHealthy,
    unstakeHeadroomWolo: woloFromUWolo(headroomUWolo),
    unstakeHeadroomUWolo: headroomUWolo.toString(),
    requiredStakingWalletBalanceWolo: woloFromUWolo(
      reservePolicy.requiredBalanceUWolo
    ),
    operatorTopUpNeededWolo: woloFromUWolo(
      reservePolicy.operatorTopUpNeededUWolo
    ),
    walletUnderfunded,
    currentUnstakeExecutable: currentUnstakeReserveCheck.executable,
    currentUnstakeReserveCheck,
    operatorWarning: walletUnderfunded ? STAKING_WALLET_TOP_UP_DETAIL : null,
    balanceLookupError,
  };
}

function buildUnstakeReserveCheck(input: {
  requestedUnstakeWolo: number;
  userConfirmedStakeWolo: number;
  totalConfirmedStakedWolo: number;
  stakingWalletBalanceUWolo: bigint | null;
  operatorReserveUWolo: bigint;
}): UnstakeReserveCheck {
  const requestedUnstakeWolo = Math.max(0, Math.floor(input.requestedUnstakeWolo || 0));
  const userConfirmedStakeWolo = Math.max(0, Math.floor(input.userConfirmedStakeWolo || 0));
  const totalConfirmedStakedWolo = Math.max(
    0,
    Math.floor(input.totalConfirmedStakedWolo || 0)
  );
  const requestedUnstakeUWolo = wholeWoloToUWolo(requestedUnstakeWolo);
  const totalConfirmedStakeUWolo = wholeWoloToUWolo(totalConfirmedStakedWolo);
  const remainingStakeAfterUnstakeUWolo =
    totalConfirmedStakeUWolo > requestedUnstakeUWolo
      ? totalConfirmedStakeUWolo - requestedUnstakeUWolo
      : BigInt(0);
  const requiredBalanceAfterUnstakeUWolo =
    remainingStakeAfterUnstakeUWolo + input.operatorReserveUWolo;
  const availableAfterUnstakeUWolo =
    input.stakingWalletBalanceUWolo == null
      ? null
      : input.stakingWalletBalanceUWolo - requestedUnstakeUWolo;
  const operatorTopUpNeededUWolo =
    availableAfterUnstakeUWolo == null ||
    availableAfterUnstakeUWolo >= requiredBalanceAfterUnstakeUWolo
      ? BigInt(0)
      : requiredBalanceAfterUnstakeUWolo - availableAfterUnstakeUWolo;

  return {
    executable:
      availableAfterUnstakeUWolo == null ||
      availableAfterUnstakeUWolo >= requiredBalanceAfterUnstakeUWolo,
    requestedUnstakeWolo,
    userConfirmedStakeWolo,
    totalConfirmedStakedWolo,
    stakingWalletBalanceWolo:
      input.stakingWalletBalanceUWolo == null
        ? null
        : woloFromUWolo(input.stakingWalletBalanceUWolo),
    operatorReserveWolo: woloFromUWolo(input.operatorReserveUWolo),
    remainingStakeAfterUnstakeWolo: woloFromUWolo(remainingStakeAfterUnstakeUWolo),
    requiredBalanceAfterUnstakeWolo: woloFromUWolo(requiredBalanceAfterUnstakeUWolo),
    availableAfterUnstakeWolo:
      availableAfterUnstakeUWolo == null ? null : woloFromUWolo(availableAfterUnstakeUWolo),
    operatorTopUpNeededWolo: woloFromUWolo(operatorTopUpNeededUWolo),
  };
}

export function getUnstakeReserveCheck(
  limits: StakingExecutionLimits,
  amountWolo: number,
  userConfirmedStakeWolo: number
) {
  return buildUnstakeReserveCheck({
    requestedUnstakeWolo: amountWolo,
    userConfirmedStakeWolo,
    totalConfirmedStakedWolo: limits.totalConfirmedStakedWolo,
    stakingWalletBalanceUWolo:
      limits.stakingWalletBalanceUWolo == null
        ? null
        : BigInt(limits.stakingWalletBalanceUWolo),
    operatorReserveUWolo: BigInt(limits.unstakeHeadroomUWolo),
  });
}
