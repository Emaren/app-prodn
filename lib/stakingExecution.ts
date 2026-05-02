import type { PrismaClient } from "@/lib/generated/prisma";
import { WOLO_COIN_DECIMALS } from "@/lib/woloChain";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

const UWOLO_PER_WOLO = BigInt(10) ** BigInt(WOLO_COIN_DECIMALS);
const DEFAULT_UNSTAKE_HEADROOM_UWOLO = BigInt(10_000_000);
export const STAKING_WALLET_TOP_UP_DETAIL =
  "Staking wallet needs operator top-up before this unstake can execute.";

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
) {
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
  const currentUnstakeRequiredUWolo = wholeWoloToUWolo(currentStake) + headroomUWolo;
  const walletUnderfunded =
    stakingWalletBalanceUWolo == null
      ? false
      : stakingWalletBalanceUWolo < requiredStakingWalletBalanceUWolo;
  const currentUnstakeExecutable =
    stakingWalletBalanceUWolo == null
      ? true
      : stakingWalletBalanceUWolo >= currentUnstakeRequiredUWolo;
  const operatorTopUpNeededUWolo =
    stakingWalletBalanceUWolo == null || !walletUnderfunded
      ? BigInt(0)
      : requiredStakingWalletBalanceUWolo - stakingWalletBalanceUWolo;

  return {
    maxUnstakeWolo: currentStake,
    totalConfirmedStakedWolo,
    activeStakers,
    stakingWalletBalanceWolo:
      stakingWalletBalanceUWolo == null ? null : woloFromUWolo(stakingWalletBalanceUWolo),
    stakingWalletReserveHeadroomWolo: woloFromUWolo(headroomUWolo),
    unstakeHeadroomWolo: woloFromUWolo(headroomUWolo),
    unstakeHeadroomUWolo: headroomUWolo.toString(),
    requiredStakingWalletBalanceWolo: woloFromUWolo(requiredStakingWalletBalanceUWolo),
    operatorTopUpNeededWolo: woloFromUWolo(operatorTopUpNeededUWolo),
    walletUnderfunded,
    currentUnstakeExecutable,
    operatorWarning: walletUnderfunded ? STAKING_WALLET_TOP_UP_DETAIL : null,
    balanceLookupError,
  };
}

export function canExecuteUnstakeWithReserve(
  limits: Awaited<ReturnType<typeof loadStakingExecutionLimits>>,
  amountWolo: number
) {
  if (limits.stakingWalletBalanceWolo == null) return true;
  return (
    limits.stakingWalletBalanceWolo >=
    Math.max(0, Math.floor(amountWolo || 0)) + limits.stakingWalletReserveHeadroomWolo
  );
}
