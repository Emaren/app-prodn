import { WOLO_COIN_DECIMALS } from "@/lib/woloChain";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

const UWOLO_PER_WOLO = BigInt(10) ** BigInt(WOLO_COIN_DECIMALS);
const DEFAULT_UNSTAKE_HEADROOM_UWOLO = BigInt(10_000_000);

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

function wholeWoloFloor(value: bigint) {
  return Number(value / UWOLO_PER_WOLO);
}

export async function loadStakingExecutionLimits(currentStakedWolo: number) {
  const runtime = getWoloStakingRuntime();
  const headroomUWolo = readHeadroomUWolo();
  const currentStake = Math.max(0, Math.floor(currentStakedWolo || 0));
  let stakingWalletBalanceUWolo: bigint | null = null;
  let balanceLookupError: string | null = null;

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

  const chainExecutableWolo =
    stakingWalletBalanceUWolo == null
      ? currentStake
      : wholeWoloFloor(
          stakingWalletBalanceUWolo > headroomUWolo
            ? stakingWalletBalanceUWolo - headroomUWolo
            : BigInt(0)
        );
  const maxUnstakeWolo = Math.max(0, Math.min(currentStake, chainExecutableWolo));

  return {
    maxUnstakeWolo,
    stakingWalletBalanceWolo:
      stakingWalletBalanceUWolo == null ? null : woloFromUWolo(stakingWalletBalanceUWolo),
    unstakeHeadroomWolo: woloFromUWolo(headroomUWolo),
    unstakeHeadroomUWolo: headroomUWolo.toString(),
    balanceLookupError,
  };
}
