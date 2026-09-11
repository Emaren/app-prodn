import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isAuthoritativeMainnetStakingEvent } from "../lib/mainnetStakingPositions.ts";
import {
  LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION,
  inspectLegacySyntheticCompoundSnapshot,
} from "../scripts/lib/legacy-synthetic-staking-compounds.mjs";

const users = {
  63: { rows: 3, wolo: 4 },
  65: { rows: 45, wolo: 23_619 },
  18168: { rows: 61, wolo: 68_662 },
};

type SnapshotEvent = {
  id: number;
  user_id: number;
  type: string;
  amount_wolo: number;
  tx_hash: string;
  status: string;
  metadata: {
    internalCompound?: boolean;
    chainBackedCompound?: boolean;
    stakingRewardAllocationId?: number;
    stakingRewardDistributionId?: number;
  };
};

type SnapshotAllocation = {
  id: number;
  user_id: number;
  distribution_id: number;
  reward_wolo: number;
  status: string;
};

type SnapshotPosition = {
  user_id: number;
  compounded_rewards_wolo: number;
};

type SnapshotFixture = {
  events: SnapshotEvent[];
  allocations: SnapshotAllocation[];
  positions: SnapshotPosition[];
  chainBackedEvents: SnapshotEvent[];
  unexpectedCompoundEvents: Array<{ id: number }>;
  unmappedCompoundedAllocations: Array<{ id: number }>;
};

function fixture(state: "before" | "after"): SnapshotFixture {
  const events: SnapshotEvent[] = [];
  const allocations: SnapshotAllocation[] = [];
  let id = 1;
  for (const [userIdText, expected] of Object.entries(users)) {
    const userId = Number(userIdText);
    let remaining = expected.wolo;
    for (let index = 0; index < expected.rows; index += 1) {
      const amount = index === expected.rows - 1 ? remaining : Math.min(1, remaining);
      remaining -= amount;
      const allocationId = 1000 + id;
      const distributionId = 50 + index;
      events.push({
        id,
        user_id: userId,
        type: "COMPOUND",
        amount_wolo: amount,
        tx_hash: `COMPOUND-${distributionId}-${userId}`,
        status: "CONFIRMED",
        metadata: {
          internalCompound: true,
          stakingRewardAllocationId: allocationId,
          stakingRewardDistributionId: distributionId,
        },
      });
      allocations.push({
        id: allocationId,
        user_id: userId,
        distribution_id: distributionId,
        reward_wolo: amount,
        status: state === "before" ? "COMPOUNDED" : "COMPOUND_PENDING",
      });
      id += 1;
    }
  }
  return {
    events,
    allocations,
    positions: Object.entries(users).map(([userIdText, expected]) => ({
      user_id: Number(userIdText),
      compounded_rewards_wolo: state === "before" ? expected.wolo : 0,
    })),
    chainBackedEvents: [],
    unexpectedCompoundEvents: [],
    unmappedCompoundedAllocations: [],
  };
}

test("legacy synthetic COMPOUND identifiers can never authorize mainnet principal", () => {
  assert.equal(
    isAuthoritativeMainnetStakingEvent({
      type: "COMPOUND",
      txHash: "COMPOUND-37-63",
      metadata: { chainBackedCompound: true },
    }),
    false,
  );
  assert.equal(
    isAuthoritativeMainnetStakingEvent({
      type: "COMPOUND",
      txHash: "A".repeat(64),
      metadata: { chainBackedCompound: false },
    }),
    false,
  );
  assert.equal(
    isAuthoritativeMainnetStakingEvent({
      type: "COMPOUND",
      txHash: "A".repeat(64),
      metadata: { chainBackedCompound: true },
    }),
    true,
  );
  assert.equal(
    isAuthoritativeMainnetStakingEvent({ type: "STAKE", txHash: "STAKE" }),
    true,
  );
});

test("exact production legacy cohort passes before and after reconciliation states", () => {
  const before = inspectLegacySyntheticCompoundSnapshot(fixture("before"), "before");
  const after = inspectLegacySyntheticCompoundSnapshot(fixture("after"), "after");
  assert.equal(before.ok, true);
  assert.equal(after.ok, true);
  assert.equal(before.totals.legacyEvents, 109);
  assert.equal(before.totals.legacyWolo, 92_285);
  assert.equal(
    LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION,
    "RECONCILE-LEGACY-SYNTHETIC-COMPOUNDS-109-92285",
  );
});

test("reconciliation preserves independently chain-backed compound principal", () => {
  const before = fixture("before");
  const after = fixture("after");
  const txHash = "A".repeat(64);
  const chainBacked = {
    id: 9001,
    user_id: 18168,
    type: "COMPOUND",
    amount_wolo: 7,
    tx_hash: txHash,
    status: "CONFIRMED",
    metadata: { chainBackedCompound: true },
  };
  before.chainBackedEvents = [chainBacked];
  after.chainBackedEvents = [chainBacked];
  before.positions.find((row) => row.user_id === 18168)!.compounded_rewards_wolo += 7;
  after.positions.find((row) => row.user_id === 18168)!.compounded_rewards_wolo = 7;

  assert.equal(inspectLegacySyntheticCompoundSnapshot(before, "before").ok, true);
  assert.equal(inspectLegacySyntheticCompoundSnapshot(after, "after").ok, true);
});

test("repair census fails closed on amount, mapping, status, or position drift", () => {
  const cases: Array<(value: SnapshotFixture) => void> = [
    (value) => { value.events[0].amount_wolo += 1; },
    (value) => { value.events[0].metadata.stakingRewardAllocationId = 999999; },
    (value) => { value.allocations[0].status = "CLAIMED"; },
    (value) => { value.positions[0].compounded_rewards_wolo += 1; },
    (value) => { value.unexpectedCompoundEvents = [{ id: 999 }]; },
    (value) => { value.unmappedCompoundedAllocations = [{ id: 999 }]; },
  ];
  for (const mutate of cases) {
    const value = fixture("before");
    mutate(value);
    assert.equal(inspectLegacySyntheticCompoundSnapshot(value, "before").ok, false);
  }
});

test("repair tool is dry-run by default and preserves historical events and lifetime rewards", () => {
  const source = readFileSync(
    new URL("../scripts/reconcile-legacy-synthetic-staking-compounds.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(apply && verify\)/);
  assert.match(source, /Apply requires --confirm/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /clean main exactly matching origin\/main/);
  assert.match(source, /aoe2hdbets-staking-rewards\.timer/);
  assert.match(source, /transactionCommitted/);
  assert.match(source, /apply-pending-commit/);
  assert.match(source, /set status='COMPOUND_PENDING'/);
  assert.match(source, /compounded_rewards_wolo=compounded_rewards_wolo-\$1/);
  assert.doesNotMatch(source, /delete\s+from\s+staking_events/i);
  assert.doesNotMatch(source, /update\s+staking_events/i);
  assert.doesNotMatch(source, /lifetime_rewards_wolo\s*=/i);
  assert.match(source, /userRewardEntitlementDeletedWolo:\s*0/);
  assert.match(source, /woloTransferPerformed:\s*false/);
});
