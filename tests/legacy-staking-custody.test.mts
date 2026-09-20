import assert from "node:assert/strict";
import test from "node:test";

import { finalizeLegacyStakingCustodyCohort } from "../lib/legacyStakingCustody.ts";

type FinalizerTx = Parameters<typeof finalizeLegacyStakingCustodyCohort>[0];
type PositionUpdateArgs = {
  data: {
    compoundedRewardsWolo: { increment: number };
    [key: string]: unknown;
  };
};
type RecordedCall = { kind: string; args: unknown };

function fakeTx(overrides: Record<string, unknown> = {}) {
  const calls: RecordedCall[] = [];
  const allocationRows = [
    { id: 1, userId: 18168, rewardWolo: 30_000, status: "COMPOUND_PENDING" },
    { id: 2, userId: 18168, rewardWolo: 38_662, status: "COMPOUND_PENDING" },
  ];
  const position = {
    id: 4,
    userId: 18168,
    walletAddress: "wolo1user",
    currentStakedWolo: 4_991_050,
    compoundedRewardsWolo: 0,
    lifetimeRewardsWolo: 68_662,
    accumulatedWeight: 1000n,
    lastWeightUpdateAt: new Date("2026-09-20T00:00:00Z"),
    status: "active",
  };
  const tx = {
    stakingRewardAllocation: {
      findMany: async () => allocationRows,
      updateMany: async (args: unknown) => {
        calls.push({ kind: "allocation-update", args });
        return { count: 2 };
      },
    },
    stakingPosition: {
      findUnique: async () => position,
      update: async (args: PositionUpdateArgs) => {
        calls.push({ kind: "position-update", args });
        return {
          ...position,
          compoundedRewardsWolo:
            position.compoundedRewardsWolo +
            Number(args.data.compoundedRewardsWolo.increment),
        };
      },
    },
    stakingEvent: {
      create: async (args: unknown) => {
        calls.push({ kind: "event-create", args });
        return { id: 1 };
      },
    },
    ...overrides,
  };
  return { tx: tx as unknown as FinalizerTx, calls, position };
}

test("legacy custody finalization restores chain-backed compound without double-counting lifetime rewards", async () => {
  const { tx, calls } = fakeTx();
  const result = await finalizeLegacyStakingCustodyCohort(tx, {
    userId: 18168,
    allocationIds: [1, 2],
    amountWolo: 68_662,
    payoutTxHash: "A".repeat(64),
    payoutProofUrl: "https://example.invalid/tx",
    payoutRequestId: "legacy-staking-custody-v1-u18168",
    settlementRunId: "legacy-staking-custody-v1-109-92285",
    settlementSignerAddress: "wolo1escrow",
    stakingCustodyAddress: "wolo1staking",
    paidAt: new Date("2026-09-20T01:00:00Z"),
  });

  assert.equal(result.finalized, true);
  assert.equal(result.currentStakedWolo, 5_059_712);

  const positionUpdate = calls.find((call) => call.kind === "position-update");
  assert.ok(positionUpdate);
  const positionArgs = positionUpdate.args as PositionUpdateArgs;
  assert.equal(positionArgs.data.compoundedRewardsWolo.increment, 68_662);
  assert.equal("lifetimeRewardsWolo" in positionArgs.data, false);

  const event = calls.find((call) => call.kind === "event-create");
  assert.ok(event);
  const eventArgs = event.args as {
    data: {
      amountWolo: number;
      metadata: {
        chainBackedCompound: boolean;
        legacySyntheticCustodyReconciliation: boolean;
        allocationIds: number[];
      };
    };
  };
  assert.equal(eventArgs.data.amountWolo, 68_662);
  assert.equal(eventArgs.data.metadata.chainBackedCompound, true);
  assert.equal(eventArgs.data.metadata.legacySyntheticCustodyReconciliation, true);
  assert.deepEqual(eventArgs.data.metadata.allocationIds, [1, 2]);
});

test("legacy custody finalization is idempotent once the exact allocation cohort is compounded", async () => {
  const { tx, calls } = fakeTx({
    stakingRewardAllocation: {
      findMany: async () => [
        { id: 1, userId: 18168, rewardWolo: 30_000, status: "COMPOUNDED" },
        { id: 2, userId: 18168, rewardWolo: 38_662, status: "COMPOUNDED" },
      ],
      updateMany: async () => {
        throw new Error("must not update");
      },
    },
  });

  const result = await finalizeLegacyStakingCustodyCohort(tx, {
    userId: 18168,
    allocationIds: [1, 2],
    amountWolo: 68_662,
    payoutTxHash: "A".repeat(64),
    payoutProofUrl: null,
    payoutRequestId: "legacy-staking-custody-v1-u18168",
    settlementRunId: "legacy-staking-custody-v1-109-92285",
    settlementSignerAddress: "wolo1escrow",
    stakingCustodyAddress: "wolo1staking",
    paidAt: new Date("2026-09-20T01:00:00Z"),
  });

  assert.equal(result.idempotentReplay, true);
  assert.equal(calls.length, 0);
});
