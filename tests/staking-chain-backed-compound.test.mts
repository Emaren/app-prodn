import assert from "node:assert/strict";
import test from "node:test";

import {
  finalizeChainBackedCashAllocation,
  finalizeChainBackedCompoundAllocation,
  loadMainnetRewardSnapshotForUser,
} from "../lib/staking.ts";

const paidAt = new Date("2026-09-09T16:00:00.000Z");

function compoundInput() {
  return {
    allocationId: 501,
    distributionId: 91,
    frozenCompoundCustodyAddress: "wolo1stakingcustody",
    payoutRequestId: "staking-reward-v2-91-501:compound",
    payoutTxHash: "ABCDEF0123456789",
    payoutProofUrl: "https://example.invalid/tx/ABC",
    settlementRunId: "aoe2-staking-v2-2026-09-08-91",
    settlementStatus: "confirmed",
    settlementDetail: "confirmed",
    settlementSignerAddress: "wolo1escrow",
    paidAt,
  };
}
test("COMPOUND_PENDING becomes liability only after a real receipt", async () => {
  const writes: Record<string, unknown>[] = [];
  const allocation = {
    id: 501,
    userId: 18168,
    positionId: 77,
    walletAddress: "wolo1jim",
    rewardWolo: 7,
    status: "COMPOUND_PENDING",
  };
  const position = {
    id: 77,
    walletAddress: "wolo1jim",
    currentStakedWolo: 100,
    compoundedRewardsWolo: 10,
    accumulatedWeight: BigInt(1234),
    lastWeightUpdateAt: paidAt,
  };
  const tx = {
    stakingRewardAllocation: {
      findUnique: async () => allocation,
      updateMany: async (args: unknown) => {
        writes.push({ kind: "allocation.updateMany", args });
        return { count: 1 };
      },
    },
    stakingPosition: {
      findUnique: async () => position,
      update: async (args: unknown) => {
        writes.push({ kind: "position.update", args });
        return { ...position, compoundedRewardsWolo: 17 };
      },
      create: async () => {
        throw new Error("unexpected position create");
      },
    },
    stakingEvent: {
      create: async (args: unknown) => {
        writes.push({ kind: "event.create", args });
        return {};
      },
    },
  };
  const result = await finalizeChainBackedCompoundAllocation(
    tx as never,
    compoundInput(),
  );

  assert.equal(result, true);
  assert.equal(writes.length, 3);

  const positionWrite = writes.find((row) => row.kind === "position.update")!;
  const positionData = (positionWrite.args as { data: Record<string, unknown> }).data;
  assert.deepEqual(positionData.compoundedRewardsWolo, { increment: 7 });
  assert.deepEqual(positionData.lifetimeRewardsWolo, { increment: 7 });
  assert.equal("currentStakedWolo" in positionData, false);

  const allocationWrite = writes.find(
    (row) => row.kind === "allocation.updateMany",
  )!;
  assert.equal(
    (allocationWrite.args as { data: { status: string } }).data.status,
    "COMPOUNDED",
  );
  const eventWrite = writes.find((row) => row.kind === "event.create")!;
  const eventData = (eventWrite.args as { data: Record<string, any> }).data;
  assert.equal(eventData.type, "COMPOUND");
  assert.equal(eventData.status, "CONFIRMED");
  assert.equal(eventData.amountWolo, 7);
  assert.equal(eventData.txHash, "ABCDEF0123456789");
  assert.equal(eventData.balanceBefore, 110);
  assert.equal(eventData.balanceAfter, 117);
  assert.equal(eventData.metadata.chainBackedCompound, true);
  assert.equal(
    eventData.metadata.compoundCustodyAddress,
    "wolo1stakingcustody",
  );
});
test("already COMPOUNDED replay is a no-op", async () => {
  let writes = 0;
  const tx = {
    stakingRewardAllocation: {
      findUnique: async () => ({
        id: 501,
        status: "COMPOUNDED",
      }),
      update: async () => {
        writes += 1;
      },
    },
    stakingPosition: {
      findUnique: async () => {
        writes += 1;
      },
      update: async () => {
        writes += 1;
      },
      create: async () => {
        writes += 1;
      },
    },
    stakingEvent: {
      create: async () => {
        writes += 1;
      },
    },
  };

  const result = await finalizeChainBackedCompoundAllocation(
    tx as never,
    compoundInput(),
  );

  assert.equal(result, true);
  assert.equal(writes, 0);
});

test("non-pending compound allocation cannot finalize", async () => {
  let writes = 0;
  const tx = {
    stakingRewardAllocation: {
      findUnique: async () => ({
        id: 501,
        status: "CREDITED",
      }),
      update: async () => {
        writes += 1;
      },
    },
  };

  const result = await finalizeChainBackedCompoundAllocation(
    tx as never,
    compoundInput(),
  );

  assert.equal(result, false);
  assert.equal(writes, 0);
});
test("already CLAIMED cash reward replay is a no-op", async () => {
  let writes = 0;
  const tx = {
    stakingRewardAllocation: {
      findUnique: async () => ({
        id: 601,
        status: "CLAIMED",
      }),
      update: async () => {
        writes += 1;
      },
    },
  };

  const result = await finalizeChainBackedCashAllocation(
    tx as never,
    {
      allocationId: 601,
      distributionId: 91,
      payoutWalletAddress: "wolo1jim",
      payoutRequestId: "staking-reward-v2-91-601:cash",
      payoutTxHash: "CASH0123456789",
      payoutProofUrl: null,
      settlementRunId: "aoe2-staking-v2-2026-09-08-91",
      settlementStatus: "confirmed",
      settlementDetail: "confirmed",
      paidAt,
    },
  );

  assert.equal(result, true);
  assert.equal(writes, 0);
});
test("concurrent compound finalizer that loses the state claim does not double-credit", async () => {
  let findCount = 0;
  let liabilityWrites = 0;
  const tx = {
    stakingRewardAllocation: {
      findUnique: async () => {
        findCount += 1;
        return findCount === 1
          ? {
              id: 501,
              userId: 18168,
              positionId: 77,
              walletAddress: "wolo1jim",
              rewardWolo: 7,
              status: "COMPOUND_PENDING",
            }
          : { status: "COMPOUNDED" };
      },
      updateMany: async () => ({ count: 0 }),
    },
    stakingPosition: {
      findUnique: async () => {
        liabilityWrites += 1;
      },
      update: async () => {
        liabilityWrites += 1;
      },
      create: async () => {
        liabilityWrites += 1;
      },
    },
    stakingEvent: {
      create: async () => {
        liabilityWrites += 1;
      },
    },
  };

  const result = await finalizeChainBackedCompoundAllocation(
    tx as never,
    compoundInput(),
  );

  assert.equal(result, true);
  assert.equal(liabilityWrites, 0);
});
test("mainnet reward snapshot separates cash pending from compound custody pending", async () => {
  const seenStatuses: unknown[] = [];
  const sums = [5, 7, 11, 30];
  let index = 0;

  const prisma = {
    stakingRewardAllocation: {
      aggregate: async (args: { where: { status?: unknown } }) => {
        seenStatuses.push(args.where.status);
        return {
          _sum: {
            rewardWolo: sums[index++],
          },
        };
      },
    },
  };

  const snapshot = await loadMainnetRewardSnapshotForUser(
    prisma as never,
    18168,
  );

  assert.deepEqual(snapshot, {
    pendingRewardsWolo: 5,
    compoundPendingRewardsWolo: 7,
    lifetimeRewardsWolo: 30,
    claimedRewardsWolo: 11,
  });
  assert.deepEqual(seenStatuses[0], { in: ["CREDITED", "PENDING"] });
  assert.equal(seenStatuses[1], "COMPOUND_PENDING");
  assert.equal(seenStatuses[2], "CLAIMED");
  assert.equal(seenStatuses[3], undefined);
});
