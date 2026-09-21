import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateStakingRewardPoolUwolo,
  planStakingRewardCarry,
} from "../lib/stakingRewardPrecision.ts";

test("micro reward allocation conserves every uwolo deterministically", () => {
  const allocations = allocateStakingRewardPoolUwolo(BigInt(7), [
    { userId: 30, userWeight: BigInt(1) },
    { userId: 20, userWeight: BigInt(1) },
    { userId: 10, userWeight: BigInt(1) },
  ]);

  assert.deepEqual(
    allocations.map((row) => [row.userId, row.rewardUwolo]),
    [
      [30, BigInt(2)],
      [20, BigInt(2)],
      [10, BigInt(3)],
    ],
  );
  assert.equal(
    allocations.reduce((sum, row) => sum + row.rewardUwolo, BigInt(0)),
    BigInt(7),
  );
});

test("carry releases crossed whole WOLO and preserves only sub-WOLO remainder", () => {
  assert.deepEqual(
    planStakingRewardCarry({
      earnedUwolo: BigInt(600_000),
      priorCarryUwolo: BigInt(900_000),
    }),
    {
      earnedUwolo: BigInt(600_000),
      priorCarryUwolo: BigInt(900_000),
      claimableUwolo: BigInt(1_500_000),
      releaseWolo: 1,
      nextCarryUwolo: BigInt(500_000),
    },
  );
});

test("historical Jim carry becomes spendable principal without losing precision", () => {
  const plan = planStakingRewardCarry({
    earnedUwolo: BigInt(1_465_173_557),
    priorCarryUwolo: BigInt(33_102_336),
  });
  assert.equal(plan.releaseWolo, 1_498);
  assert.equal(plan.nextCarryUwolo, BigInt(275_893));
});

test("September backlog releases historical whole carry with exact conservation", () => {
  const rows = [
    { userId: 63, userWeight: BigInt(8_640_000), carry: BigInt(4_844_555) },
    { userId: 18168, userWeight: BigInt(86_400_000_000), carry: BigInt(33_102_336) },
    { userId: 65, userWeight: BigInt(31_529_606_400), carry: BigInt(27_910_788) },
  ];
  const pools = [2_000, 1_000, 2, 3_004];
  let releasedWolo = 0;

  for (const poolWolo of pools) {
    const allocations = allocateStakingRewardPoolUwolo(
      BigInt(poolWolo) * BigInt(1_000_000),
      rows,
    );
    for (const allocation of allocations) {
      const row = rows.find((candidate) => candidate.userId === allocation.userId);
      assert.ok(row);
      const carry = planStakingRewardCarry({
        earnedUwolo: allocation.rewardUwolo,
        priorCarryUwolo: row.carry,
      });
      row.carry = carry.nextCarryUwolo;
      releasedWolo += carry.releaseWolo;
    }
  }

  assert.equal(pools.reduce((sum, value) => sum + value, 0), 6_006);
  assert.equal(releasedWolo, 6_071);
  assert.deepEqual(
    rows.map((row) => [row.userId, row.carry]),
    [
      [63, BigInt(284_546)],
      [18168, BigInt(18_528)],
      [65, BigInt(554_605)],
    ],
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.carry, BigInt(0)),
    BigInt(857_679),
  );
  // soso has no reward weight, so his existing 1,109 uwolo remains untouched.
  assert.equal(BigInt(857_679) + BigInt(1_109), BigInt(858_788));
});

test("reward distribution serializes carry mutation before rechecking date state", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../lib/staking.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function calculateDailyStakingRewardDistribution");
  const end = source.indexOf("export async function finalizeChainBackedCompoundAllocation", start);
  const calculate = source.slice(start, end);
  const lockIndex = calculate.indexOf("pg_advisory_xact_lock");
  const recheckIndex = calculate.indexOf("const lockedExisting = await tx.stakingRewardDistribution.findUnique");
  const carryLockIndex = calculate.indexOf("for update");
  assert.ok(lockIndex >= 0);
  assert.ok(recheckIndex > lockIndex);
  assert.ok(carryLockIndex > recheckIndex);
  assert.match(calculate, /rewardPlans = weightedPositions[\s\S]*\.sort\(\(left, right\) => left\.userId - right\.userId\)/);
});
