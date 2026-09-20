import type { Prisma } from "@/lib/generated/prisma";
import { resolvePublicCurrentStakedWolo } from "@/lib/mainnetStakingDerivation";

export type LegacyStakingCustodyFinalizeInput = {
  userId: number;
  allocationIds: number[];
  amountWolo: number;
  payoutTxHash: string;
  payoutProofUrl: string | null;
  payoutRequestId: string;
  settlementRunId: string;
  settlementSignerAddress: string;
  stakingCustodyAddress: string;
  paidAt: Date;
};

function accrueWeight(
  accumulatedWeight: bigint,
  currentStakeWolo: number,
  lastWeightUpdateAt: Date,
  now: Date,
) {
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - lastWeightUpdateAt.getTime()) / 1000),
  );
  return accumulatedWeight + BigInt(currentStakeWolo) * BigInt(seconds);
}

export async function finalizeLegacyStakingCustodyCohort(
  tx: Prisma.TransactionClient,
  input: LegacyStakingCustodyFinalizeInput,
) {
  if (!input.allocationIds.length || input.amountWolo <= 0) {
    throw new Error("Legacy staking custody cohort is empty.");
  }
  if (!/^[A-F0-9]{64}$/i.test(input.payoutTxHash.trim())) {
    throw new Error("Legacy staking custody payout tx hash is invalid.");
  }

  const allocations = await tx.stakingRewardAllocation.findMany({
    where: {
      id: { in: input.allocationIds },
      userId: input.userId,
    },
    orderBy: { id: "asc" },
  });

  if (allocations.length !== input.allocationIds.length) {
    throw new Error(
      `Legacy staking custody allocation count mismatch for user ${input.userId}.`,
    );
  }

  const allocationTotal = allocations.reduce(
    (sum, allocation) => sum + allocation.rewardWolo,
    0,
  );
  if (allocationTotal !== input.amountWolo) {
    throw new Error(
      `Legacy staking custody amount mismatch for user ${input.userId}: allocations=${allocationTotal} expected=${input.amountWolo}.`,
    );
  }

  const statuses = new Set(allocations.map((allocation) => allocation.status));
  if (statuses.size === 1 && statuses.has("COMPOUNDED")) {
    return { finalized: false, idempotentReplay: true } as const;
  }
  if (statuses.size !== 1 || !statuses.has("COMPOUND_PENDING")) {
    throw new Error(
      `Legacy staking custody allocation state drift for user ${input.userId}: ${Array.from(statuses).join(",")}.`,
    );
  }

  const position = await tx.stakingPosition.findUnique({
    where: { userId: input.userId },
  });
  if (!position) {
    throw new Error(
      `Legacy staking custody position is missing for user ${input.userId}.`,
    );
  }

  const balanceBefore = resolvePublicCurrentStakedWolo(position);
  const weightBefore = accrueWeight(
    position.accumulatedWeight,
    balanceBefore,
    position.lastWeightUpdateAt,
    input.paidAt,
  );

  const updated = await tx.stakingRewardAllocation.updateMany({
    where: {
      id: { in: input.allocationIds },
      userId: input.userId,
      status: "COMPOUND_PENDING",
    },
    data: { status: "COMPOUNDED" },
  });
  if (updated.count !== input.allocationIds.length) {
    throw new Error(
      `Legacy staking custody allocation update drift for user ${input.userId}: updated=${updated.count} expected=${input.allocationIds.length}.`,
    );
  }

  const compoundPosition = await tx.stakingPosition.update({
    where: { id: position.id },
    data: {
      compoundedRewardsWolo: { increment: input.amountWolo },
      // lifetimeRewardsWolo intentionally stays unchanged: this historical
      // entitlement was already counted when the rewards were earned.
      accumulatedWeight: weightBefore,
      lastWeightUpdateAt: input.paidAt,
      status: "active",
    },
  });

  await tx.stakingEvent.create({
    data: {
      userId: input.userId,
      positionId: position.id,
      walletAddress: position.walletAddress,
      type: "COMPOUND",
      amountWolo: input.amountWolo,
      txHash: input.payoutTxHash.toUpperCase(),
      status: "CONFIRMED",
      weightBefore,
      weightAfter: weightBefore,
      balanceBefore,
      balanceAfter: balanceBefore + input.amountWolo,
      confirmedAt: input.paidAt,
      metadata: {
        chainBackedCompound: true,
        legacySyntheticCustodyReconciliation: true,
        stakingCustodyAddress: input.stakingCustodyAddress,
        allocationIds: input.allocationIds,
        allocationCount: input.allocationIds.length,
        payoutRequestId: input.payoutRequestId,
        payoutProofUrl: input.payoutProofUrl,
        settlementRunId: input.settlementRunId,
        settlementSignerAddress: input.settlementSignerAddress,
      },
    },
  });

  return {
    finalized: true,
    idempotentReplay: false,
    currentStakedWolo:
      compoundPosition.currentStakedWolo +
      compoundPosition.compoundedRewardsWolo,
  } as const;
}
