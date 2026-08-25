import assert from "node:assert/strict";
import test from "node:test";

import {
  WARGRAPH_SETTLEMENT_HOLDBACK_MS,
  buildWarGraphVerifiedResolutionPlan,
  parseWarGraphSettlementJobPayload,
  preflightWarGraphSettlement,
  type WarGraphSettlementPreflight,
} from "../lib/wargraph/settlement.ts";
import {
  runWarGraphSettlementWorker,
  type LeasedWarGraphSettlementJob,
  type WarGraphSettlementJobTransition,
  type WarGraphSettlementWorkerAdapter,
} from "../lib/wargraph/settlementWorker.ts";

const FINGERPRINT = "a".repeat(64);
const COMMENCED_AT = "2026-08-24T01:00:00.000Z";
const PAYLOAD = Object.freeze({
  schema: "aoe2war-wargraph-settlement-job/v1",
  contestId: 42,
  liveGameFingerprint: FINGERPRINT,
  authoritativeOrderKey: `${COMMENCED_AT}:${FINGERPRINT}`,
  commencedAt: COMMENCED_AT,
});

function preflight(
  overrides: Partial<WarGraphSettlementPreflight> = {},
): WarGraphSettlementPreflight {
  return {
    payload: PAYLOAD,
    now: new Date("2026-08-24T01:02:00.000Z"),
    evidenceReadyAt: new Date("2026-08-24T01:00:30.000Z"),
    contest: {
      id: 42,
      liveGameFingerprint: FINGERPRINT,
      authoritativeOrderKey: `${COMMENCED_AT}:${FINGERPRINT}`,
      commencedAt: new Date(COMMENCED_AT),
      status: "qualified",
    },
    finalClaimCount: 2,
    finalClaimFactsExact: true,
    immutableFactsExact: true,
    latestDesyncOccurred: false,
    earlierNonterminalCount: 0,
    laterSettledCount: 0,
    frozenStateExact: true,
    boundPairingSnapshotExact: true,
    aggressorActionsUsed: 0,
    defenderActionsUsed: 1,
    ...overrides,
  };
}

test("settlement payload parser binds order key to time and live fingerprint", () => {
  assert.deepEqual(parseWarGraphSettlementJobPayload(PAYLOAD), PAYLOAD);
  assert.equal(
    parseWarGraphSettlementJobPayload({
      ...PAYLOAD,
      authoritativeOrderKey: `${COMMENCED_AT}:${"b".repeat(64)}`,
    }),
    null,
  );
  assert.equal(
    parseWarGraphSettlementJobPayload({
      ...PAYLOAD,
      liveGameFingerprint: "not-a-live-fingerprint",
    }),
    null,
  );
  assert.equal(
    parseWarGraphSettlementJobPayload({
      ...PAYLOAD,
      commencedAt: "2026-08-24T01:00:00Z",
    }),
    null,
  );
});

test("settlement requires exactly two matching final claims", () => {
  const pending = preflightWarGraphSettlement(
    preflight({ finalClaimCount: 1 }),
  );
  assert.equal(pending.kind, "retry");
  if (pending.kind === "retry") {
    assert.equal(pending.code, "WARGRAPH_FINAL_EVIDENCE_PENDING");
  }

  const duplicate = preflightWarGraphSettlement(
    preflight({ finalClaimCount: 3 }),
  );
  assert.deepEqual(duplicate, {
    kind: "dead",
    code: "WARGRAPH_FINAL_EVIDENCE_CONFLICT",
    detail: "Final evidence claims are duplicated, cross-scoped, or inconsistent.",
  });

  const mismatch = preflightWarGraphSettlement(
    preflight({ finalClaimFactsExact: false }),
  );
  assert.equal(mismatch.kind, "dead");
});

test("desync and frozen state drift veto punishment and economic effects", () => {
  const desync = preflightWarGraphSettlement(
    preflight({ latestDesyncOccurred: true }),
  );
  assert.deepEqual(desync, {
    kind: "system_void",
    code: "WARGRAPH_AUTHORITATIVE_DESYNC",
    detail: "Human-confirmed desync truth vetoes movement and rewards.",
  });

  const occupancyDrift = preflightWarGraphSettlement(
    preflight({ frozenStateExact: false }),
  );
  assert.equal(occupancyDrift.kind, "system_void");
  if (occupancyDrift.kind === "system_void") {
    assert.equal(occupancyDrift.code, "WARGRAPH_FROZEN_STATE_DRIFT");
  }

  const pairingDrift = preflightWarGraphSettlement(
    preflight({ boundPairingSnapshotExact: false }),
  );
  assert.equal(pairingDrift.kind, "system_void");
});

test("watermark and monotonic frontier never let parser arrival fabricate a climb", () => {
  const evidenceReadyAt = new Date("2026-08-24T01:00:30.000Z");
  const watermark = preflightWarGraphSettlement(
    preflight({
      evidenceReadyAt,
      now: new Date(
        evidenceReadyAt.getTime() + WARGRAPH_SETTLEMENT_HOLDBACK_MS - 1,
      ),
    }),
  );
  assert.equal(watermark.kind, "retry");
  if (watermark.kind === "retry") {
    assert.equal(watermark.code, "WARGRAPH_SETTLEMENT_WATERMARK_PENDING");
  }

  const earlier = preflightWarGraphSettlement(
    preflight({ earlierNonterminalCount: 1 }),
  );
  assert.equal(earlier.kind, "retry");
  if (earlier.kind === "retry") {
    assert.equal(earlier.code, "WARGRAPH_EARLIER_CONTEST_PENDING");
  }

  const late = preflightWarGraphSettlement(
    preflight({ laterSettledCount: 1 }),
  );
  assert.deepEqual(late, {
    kind: "system_void",
    code: "WARGRAPH_LATE_AUTHORITATIVE_ORDER",
    detail: "Late parser arrival is behind the monotonic settlement frontier.",
  });

  assert.deepEqual(preflightWarGraphSettlement(preflight()), {
    kind: "ready",
    payload: PAYLOAD,
  });
});

test("verified victory creates deterministic swap/fall actions, movements, and rewards", () => {
  const plan = buildWarGraphVerifiedResolutionPlan({
    aggressor: {
      membershipId: 10,
      playerId: "aggressor",
      userId: 100,
      nodeId: 20,
      layer: 2,
      occupancyVersion: 7,
      membershipVersion: 4,
      actionsUsed: 0,
    },
    defender: {
      membershipId: 11,
      playerId: "defender",
      userId: 101,
      nodeId: 21,
      layer: 1,
      occupancyVersion: 8,
      membershipVersion: 5,
      actionsUsed: 1,
    },
    outcome: "AGGRESSOR_WIN",
    frontierNodeId: 99,
    isFirstBlood: false,
    rewardConfig: {
      frontierToRingII: 1,
      ringIIToRingI: 2,
      firstBlood: 3,
      crownBattleWinner: 50,
    },
  });
  assert.ok(plan);
  assert.deepEqual(plan.actions, [
    { membershipId: 10, slot: 1, actionType: "VERIFIED_BATTLE" },
    { membershipId: 11, slot: 2, actionType: "VERIFIED_BATTLE" },
  ]);
  assert.deepEqual(plan.movements, [
    {
      membershipId: 10,
      fromNodeId: 20,
      toNodeId: 21,
      fromLayer: 2,
      toLayer: 1,
      expectedOccupancyVersion: 7,
      expectedMembershipVersion: 4,
      movementType: "BATTLE_ADVANCE",
      reasonCode: "VERIFIED_INWARD_VICTORY",
    },
    {
      membershipId: 11,
      fromNodeId: 21,
      toNodeId: 99,
      fromLayer: 1,
      toLayer: 3,
      expectedOccupancyVersion: 8,
      expectedMembershipVersion: 5,
      movementType: "CATASTROPHIC_FALL",
      reasonCode: "VERIFIED_BATTLE_DEFEAT_TO_FRONTIER",
    },
  ]);
  assert.deepEqual(plan.rewards, [
    {
      membershipId: 10,
      userId: 100,
      rewardKind: "RING_II_TO_RING_I",
      amountWolo: 2,
    },
  ]);
});

test("frontier defender victory charges actions but writes no fake movement", () => {
  const plan = buildWarGraphVerifiedResolutionPlan({
    aggressor: {
      membershipId: 10,
      playerId: "aggressor",
      userId: 100,
      nodeId: 20,
      layer: 3,
      occupancyVersion: 0,
      membershipVersion: 0,
      actionsUsed: 0,
    },
    defender: {
      membershipId: 11,
      playerId: "defender",
      userId: 101,
      nodeId: 21,
      layer: 2,
      occupancyVersion: 0,
      membershipVersion: 0,
      actionsUsed: 0,
    },
    outcome: "DEFENDER_WIN",
    frontierNodeId: null,
    isFirstBlood: false,
    rewardConfig: {
      frontierToRingII: 1,
      ringIIToRingI: 2,
      firstBlood: 3,
      crownBattleWinner: 50,
    },
  });
  assert.ok(plan);
  assert.equal(plan.actions.length, 2);
  assert.deepEqual(plan.movements, []);
});

function leasedJob(
  id: bigint,
  commencedAt: string,
  overrides: Partial<LeasedWarGraphSettlementJob> = {},
): LeasedWarGraphSettlementJob {
  const fingerprint = id.toString(16).padStart(64, "0");
  return {
    id,
    graphId: 1,
    payload: {
      ...PAYLOAD,
      contestId: Number(id),
      liveGameFingerprint: fingerprint,
      commencedAt,
      authoritativeOrderKey: `${commencedAt}:${fingerprint}`,
    },
    attemptCount: 1,
    maxAttempts: 8,
    leaseOwner: "settler-1",
    leaseExpiresAt: new Date("2026-08-24T02:00:45.000Z"),
    version: 2,
    createdAt: new Date("2026-08-24T01:00:00.000Z"),
    ...overrides,
  };
}

test("worker orders leased jobs by authoritative commencement and CAS-acks outcomes", async () => {
  const calls: string[] = [];
  const transitions: WarGraphSettlementJobTransition[] = [];
  const adapter: WarGraphSettlementWorkerAdapter = {
    lease: async () => [
      leasedJob(BigInt(2), "2026-08-24T01:02:00.000Z"),
      leasedJob(BigInt(1), "2026-08-24T01:01:00.000Z"),
    ],
    settle: async (job) => {
      calls.push(job.id.toString());
      return {
        kind: "settled",
        contestId: Number(job.id),
        movementCount: 2,
        rewardCount: 1,
      };
    },
    transition: async (transition) => {
      transitions.push(transition);
      return true;
    },
  };
  const report = await runWarGraphSettlementWorker({
    adapter,
    workerId: "settler-1",
    now: new Date("2026-08-24T02:00:00.000Z"),
  });
  assert.deepEqual(calls, ["1", "2"]);
  assert.deepEqual(transitions.map((row) => row.kind), [
    "succeeded",
    "succeeded",
  ]);
  assert.equal(report.succeeded, 2);
  assert.equal(report.staleLease, 0);
});

test("worker honors explicit watermark retry and cannot acknowledge a lost lease", async () => {
  const availableAt = new Date("2026-08-24T02:02:00.000Z");
  let transition: WarGraphSettlementJobTransition | null = null;
  const adapter: WarGraphSettlementWorkerAdapter = {
    lease: async () => [leasedJob(BigInt(7), COMMENCED_AT)],
    settle: async () => ({
      kind: "retry",
      code: "WARGRAPH_SETTLEMENT_WATERMARK_PENDING",
      detail: "watermark",
      availableAt,
    }),
    transition: async (value) => {
      transition = value;
      return false;
    },
  };
  const report = await runWarGraphSettlementWorker({
    adapter,
    workerId: "settler-1",
    now: new Date("2026-08-24T02:00:00.000Z"),
  });
  assert.ok(transition);
  assert.equal(transition.kind, "retry");
  if (transition.kind === "retry") {
    assert.equal(transition.availableAt.toISOString(), availableAt.toISOString());
  }
  assert.equal(report.retried, 0);
  assert.equal(report.staleLease, 1);
  assert.deepEqual(report.outcomes, [
    {
      jobId: "7",
      state: "stale_lease",
      code: "WARGRAPH_LEASE_CAS_LOST",
    },
  ]);
});
