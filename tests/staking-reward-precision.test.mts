import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateStakingRewardPoolUwolo,
  planStakingRewardCarry,
  splitPoolUwolo,
} from "../lib/stakingRewardPrecision.ts";

test("odd whole-WOLO fees split exactly 50/50 in minimal units", () => {
  const feePoolUwolo = BigInt(6_009) * BigInt(1_000_000);
  const split = splitPoolUwolo({
    poolUwolo: feePoolUwolo,
    firstShareBps: 5_000,
    bpsDenominator: 10_000,
  });

  assert.equal(split.firstUwolo, BigInt(3_004_500_000));
  assert.equal(split.secondUwolo, BigInt(3_004_500_000));
  assert.equal(split.firstUwolo + split.secondUwolo, feePoolUwolo);
});

test("a one-WOLO fee still gives stakers an exact half-WOLO entitlement", () => {
  const split = splitPoolUwolo({
    poolUwolo: BigInt(1_000_000),
    firstShareBps: 5_000,
    bpsDenominator: 10_000,
  });

  assert.equal(split.firstUwolo, BigInt(500_000));
  assert.equal(split.secondUwolo, BigInt(500_000));
});

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
  const poolsUwolo = [
    BigInt(2_000_000_000),
    BigInt(1_000_000_000),
    BigInt(2_000_000),
    BigInt(3_004_500_000),
  ];
  let releasedWolo = 0;

  for (const poolUwolo of poolsUwolo) {
    const allocations = allocateStakingRewardPoolUwolo(
      poolUwolo,
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

  assert.equal(
    poolsUwolo.reduce((sum, value) => sum + value, BigInt(0)),
    BigInt(6_006_500_000),
  );
  assert.equal(releasedWolo, 6_071);
  assert.deepEqual(
    rows.map((row) => [row.userId, row.carry]),
    [
      [63, BigInt(284_583)],
      [18168, BigInt(384_821)],
      [65, BigInt(688_275)],
    ],
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.carry, BigInt(0)),
    BigInt(1_357_679),
  );
  // soso has no reward weight, so his existing 1,109 uwolo remains untouched.
  assert.equal(BigInt(1_357_679) + BigInt(1_109), BigInt(1_358_788));
});

test("new reward and Treasury settlement authority uses exact uwolo mirrors", async () => {
  const { readFileSync } = await import("node:fs");
  const stakingSource = readFileSync(
    new URL("../lib/staking.ts", import.meta.url),
    "utf8",
  );
  const treasurySource = readFileSync(
    new URL("../lib/stakingTreasuryPayouts.ts", import.meta.url),
    "utf8",
  );

  assert.match(stakingSource, /const exactFeeSplit = splitPoolUwolo/);
  assert.match(stakingSource, /const stakerPoolUwolo = exactFeeSplit\.firstUwolo/);
  assert.match(stakingSource, /const treasuryPoolUwolo = exactFeeSplit\.secondUwolo/);
  assert.match(
    stakingSource,
    /totalWeight > BigInt\(0\) && stakerPoolUwolo > BigInt\(0\)/,
  );

  assert.match(treasurySource, /treasuryPoolUwolo: true/);
  assert.match(
    treasurySource,
    /amountWolo: Number\(row\.treasuryPoolUwolo\) \/ 1_000_000/,
  );
  assert.doesNotMatch(
    treasurySource,
    /amountWolo: row\.treasuryPoolWolo/,
  );
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
