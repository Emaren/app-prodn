export const UWOLO_PER_WOLO = BigInt(1_000_000);

export type StakingRewardWeightRow = {
  userId: number;
  userWeight: bigint;
};

export type StakingRewardMicroAllocation = StakingRewardWeightRow & {
  rewardUwolo: bigint;
};

function assertNonNegativeBigInt(value: bigint, label: string) {
  if (value < BigInt(0)) {
    throw new Error(`${label} must be non-negative.`);
  }
}

export function splitPoolUwolo(input: {
  poolUwolo: bigint;
  firstShareBps: number;
  bpsDenominator: number;
}) {
  assertNonNegativeBigInt(input.poolUwolo, "Pool");
  if (
    !Number.isInteger(input.firstShareBps) ||
    !Number.isInteger(input.bpsDenominator) ||
    input.bpsDenominator <= 0 ||
    input.firstShareBps < 0 ||
    input.firstShareBps > input.bpsDenominator
  ) {
    throw new Error("Pool split basis points are invalid.");
  }

  const denominator = BigInt(input.bpsDenominator);
  const firstUwolo =
    (input.poolUwolo * BigInt(input.firstShareBps)) / denominator;
  const secondUwolo = input.poolUwolo - firstUwolo;

  return {
    firstUwolo,
    secondUwolo,
  };
}

/**
 * Allocate every minimal unit in the staker pool.
 *
 * Integer division can otherwise strand up to N-1 uwolo per distribution.
 * We allocate the remainder deterministically by exact fractional remainder,
 * then weight, then user id. The returned allocations always sum exactly to
 * poolUwolo whenever the eligible total weight is positive.
 */
export function allocateStakingRewardPoolUwolo(
  poolUwolo: bigint,
  rows: StakingRewardWeightRow[],
): StakingRewardMicroAllocation[] {
  assertNonNegativeBigInt(poolUwolo, "Staker reward pool");

  const eligible = rows
    .map((row, originalIndex) => {
      assertNonNegativeBigInt(row.userWeight, `Staking weight for user ${row.userId}`);
      return { ...row, originalIndex };
    })
    .filter((row) => row.userWeight > BigInt(0));

  const totalWeight = eligible.reduce(
    (sum, row) => sum + row.userWeight,
    BigInt(0),
  );

  if (poolUwolo === BigInt(0) || totalWeight === BigInt(0)) {
    return eligible.map(({ userId, userWeight }) => ({
      userId,
      userWeight,
      rewardUwolo: BigInt(0),
    }));
  }

  const planned = eligible.map((row) => {
    const numerator = poolUwolo * row.userWeight;
    return {
      ...row,
      rewardUwolo: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });

  let remainingUwolo =
    poolUwolo -
    planned.reduce((sum, row) => sum + row.rewardUwolo, BigInt(0));

  for (const row of [...planned].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    if (left.userWeight !== right.userWeight) {
      return left.userWeight > right.userWeight ? -1 : 1;
    }
    return left.userId - right.userId;
  })) {
    if (remainingUwolo <= BigInt(0)) break;
    row.rewardUwolo += BigInt(1);
    remainingUwolo -= BigInt(1);
  }

  if (remainingUwolo !== BigInt(0)) {
    throw new Error(
      `Staking reward micro-allocation drift: ${remainingUwolo.toString()} uwolo remained unallocated.`,
    );
  }

  const result = planned
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map(({ userId, userWeight, rewardUwolo }) => ({
      userId,
      userWeight,
      rewardUwolo,
    }));

  const allocated = result.reduce(
    (sum, row) => sum + row.rewardUwolo,
    BigInt(0),
  );
  if (allocated !== poolUwolo) {
    throw new Error(
      `Staking reward micro-allocation mismatch: allocated=${allocated.toString()} pool=${poolUwolo.toString()}.`,
    );
  }

  return result;
}

export function planStakingRewardCarry(input: {
  earnedUwolo: bigint;
  priorCarryUwolo: bigint;
}) {
  assertNonNegativeBigInt(input.earnedUwolo, "Earned staking reward");
  assertNonNegativeBigInt(input.priorCarryUwolo, "Prior staking reward carry");

  const claimableUwolo = input.earnedUwolo + input.priorCarryUwolo;
  const wholeWolo = claimableUwolo / UWOLO_PER_WOLO;
  if (wholeWolo > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Staking reward carry exceeds safe whole-WOLO range.");
  }

  return {
    earnedUwolo: input.earnedUwolo,
    priorCarryUwolo: input.priorCarryUwolo,
    claimableUwolo,
    releaseWolo: Number(wholeWolo),
    nextCarryUwolo: claimableUwolo % UWOLO_PER_WOLO,
  };
}
