import type { PrismaClient } from "@/lib/generated/prisma";
import { WOLO_COIN_DECIMALS } from "@/lib/woloChain";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

const UWOLO_PER_WOLO = BigInt(10) ** BigInt(WOLO_COIN_DECIMALS);
const DEFAULT_UNSTAKE_HEADROOM_UWOLO = BigInt(10_000_000);
export const STAKING_WALLET_TOP_UP_DETAIL =
  "Staking wallet needs operator top-up before this unstake can execute.";

type StakingExecutionLimits = {
  maxUnstakeWolo: number;
  totalConfirmedStakedWolo: number;
  activeStakers: number;
  stakingWalletBalanceWolo: number | null;
  stakingWalletBalanceUWolo: string | null;
  stakingWalletReserveHeadroomWolo: number;
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
  const raw =
    process.env.WOLO_STAKING_UNSTAKE_HEADROOM_UWOLO?.trim() ||
    process.env.WOLO_SETTLEMENT_FEE_HEADROOM_UWOLO?.trim() ||
    "";
  if (!raw) return DEFAULT_UNSTAKE_HEADROOM_UWOLO;

  try {
    const parsed = BigInt(raw);
    return parsed > BigInt(0) ? parsed : DEFAULT_UNSTAKE_HEADROOM_UWOLO;
  } catch {
    return DEFAULT_UNSTAKE_HEADROOM_UWOLO;
  }
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
  const positionTotals = await prisma.stakingPosition.aggregate({
    where: {
      status: "active",
      currentStakedWolo: { gt: 0 },
    },
    _count: { _all: true },
    _sum: { currentStakedWolo: true },
  });
  const totalConfirmedStakedWolo = Math.max(
    0,
    positionTotals._sum.currentStakedWolo ?? 0
  );
  const activeStakers = positionTotals._count._all;

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

  const requiredStakingWalletBalanceUWolo =
    wholeWoloToUWolo(totalConfirmedStakedWolo) + headroomUWolo;
  const walletUnderfunded =
    stakingWalletBalanceUWolo == null
      ? false
      : stakingWalletBalanceUWolo < requiredStakingWalletBalanceUWolo;
  const operatorTopUpNeededUWolo =
    stakingWalletBalanceUWolo == null || !walletUnderfunded
      ? BigInt(0)
      : requiredStakingWalletBalanceUWolo - stakingWalletBalanceUWolo;
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
    unstakeHeadroomWolo: woloFromUWolo(headroomUWolo),
    unstakeHeadroomUWolo: headroomUWolo.toString(),
    requiredStakingWalletBalanceWolo: woloFromUWolo(requiredStakingWalletBalanceUWolo),
    operatorTopUpNeededWolo: woloFromUWolo(operatorTopUpNeededUWolo),
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
