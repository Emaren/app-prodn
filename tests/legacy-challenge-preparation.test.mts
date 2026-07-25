import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLegacyChallengePreparationPlan,
  prepareLegacyChallengeTerminal,
} from "../lib/legacyChallengePreparation.ts";

const now = new Date("2026-07-25T22:00:00.000Z");

function legacyRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 14,
    status: "proposed",
    scheduledAt: new Date("2026-04-27T03:00:00.000Z"),
    acceptBy: new Date("2026-04-27T03:00:00.000Z"),
    fundBy: null,
    playBy: null,
    acceptedAt: null,
    expiredAt: null,
    reconciledAt: null,
    creationRequestId: null,
    wagerAmountWolo: 5000,
    guaranteeAmountWolo: 10,
    challengerFundingTxHash: null,
    challengerFundingWalletAddress: null,
    challengerFundedAt: null,
    challengedFundingTxHash: null,
    challengedFundingWalletAddress: null,
    challengedFundedAt: null,
    liveConfirmedAt: null,
    resultAt: null,
    settlementReadyAt: null,
    linkedSessionKey: null,
    linkedWinner: null,
    challenger: {
      id: 101,
      uid: "left-user",
      inGameName: "Left",
      steamPersonaName: null,
    },
    challenged: {
      id: 202,
      uid: "right-user",
      inGameName: "Right",
      steamPersonaName: null,
    },
    fundingProofs: [],
    settlements: [],
    trophyChallenges: [],
    betMarket: null,
    activities: [],
    ...overrides,
  };
}

function oneSidedFundingRow(overrides: Record<string, unknown> = {}) {
  return legacyRow({
    id: 23,
    status: "creator_funded",
    scheduledAt: new Date("2026-07-04T02:15:00.000Z"),
    acceptBy: new Date("2026-07-04T02:15:00.000Z"),
    wagerAmountWolo: 25,
    guaranteeAmountWolo: 10,
    challengerFundingTxHash: "FUNDING-TX-23",
    challengerFundingWalletAddress: "wolo1creator",
    challengerFundedAt: new Date("2026-07-04T02:02:00.000Z"),
    fundingProofs: [
      {
        participantSide: "left",
        txHash: "FUNDING-TX-23",
        walletAddress: "wolo1creator",
        amountWolo: 35,
      },
    ],
    ...overrides,
  });
}

test("automatic challenge reconciliation remains restricted to versioned rows", () => {
  const source = readFileSync(
    new URL("../lib/challengeReconciler.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /creationRequestId:\s*\{\s*not:\s*null\s*\}/);
  assert.match(source, /do not sweep arbitrary legacy cancelled/);
});

test("plans an expired terminal close with no settlement when legacy funding is absent", () => {
  const plan = buildLegacyChallengePreparationPlan(legacyRow() as never, now);

  assert.equal(plan.legacy, true);
  assert.equal(plan.currentStatus, "proposed");
  assert.equal(plan.targetStatus, "expired");
  assert.equal(plan.funding.fundedSides.length, 0);
  assert.equal(plan.funding.exactRefundWolo, 0);
  assert.equal(plan.funding.refunds.length, 0);
  assert.equal(plan.blockers.length, 0);
  assert.match(plan.funding.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(plan.confirmation || "", /^PREPARE-LEGACY-14-EXPIRED-/);
});

test("plans exactly one 35 WOLO refund for a one-sided legacy funding record", () => {
  const plan = buildLegacyChallengePreparationPlan(
    oneSidedFundingRow() as never,
    now
  );

  assert.equal(plan.targetStatus, "expired");
  assert.deepEqual(plan.funding.fundedSides, ["left"]);
  assert.equal(plan.funding.exactRefundWolo, 35);
  assert.deepEqual(plan.funding.refunds, [
    {
      side: "left",
      amountWolo: 35,
      txHash: "FUNDING-TX-23",
      recipientAddress: "wolo1creator",
    },
  ]);
  assert.equal(plan.blockers.length, 0);
});

test("funding fingerprint changes when transaction truth changes", () => {
  const before = buildLegacyChallengePreparationPlan(
    oneSidedFundingRow() as never,
    now
  );
  const after = buildLegacyChallengePreparationPlan(
    oneSidedFundingRow({
      challengerFundingTxHash: "DIFFERENT-TX",
      fundingProofs: [
        {
          participantSide: "left",
          txHash: "DIFFERENT-TX",
          walletAddress: "wolo1creator",
          amountWolo: 35,
        },
      ],
    }) as never,
    now
  );

  assert.notEqual(before.funding.fingerprint, after.funding.fingerprint);
});

test("blocks versioned rows, future deadlines, double funding, and market exposure", () => {
  const versioned = buildLegacyChallengePreparationPlan(
    legacyRow({ creationRequestId: "challenge-v2-request" }) as never,
    now
  );
  assert.match(versioned.blockers.join(" "), /versioned challenge/);

  const future = buildLegacyChallengePreparationPlan(
    legacyRow({ acceptBy: new Date("2026-08-01T00:00:00.000Z") }) as never,
    now
  );
  assert.match(future.blockers.join(" "), /No acceptance, funding, or play deadline/);

  const doubleFunded = buildLegacyChallengePreparationPlan(
    oneSidedFundingRow({
      challengedFundingTxHash: "RIGHT-TX",
      challengedFundingWalletAddress: "wolo1right",
      challengedFundedAt: new Date("2026-07-04T02:03:00.000Z"),
      fundingProofs: [
        {
          participantSide: "left",
          txHash: "FUNDING-TX-23",
          walletAddress: "wolo1creator",
          amountWolo: 35,
        },
        {
          participantSide: "right",
          txHash: "RIGHT-TX",
          walletAddress: "wolo1right",
          amountWolo: 35,
        },
      ],
    }) as never,
    now
  );
  assert.match(doubleFunded.blockers.join(" "), /Both sides have funding/);

  const exposed = buildLegacyChallengePreparationPlan(
    legacyRow({
      betMarket: {
        id: 99,
        status: "open",
        settlementStatus: null,
        _count: { wagers: 1, stakeIntents: 0 },
      },
    }) as never,
    now
  );
  assert.match(exposed.blockers.join(" "), /market has wager exposure/);
});

test("requires every exact assertion before applying the terminal preparation", async () => {
  const row = legacyRow();
  let updateCount = 0;
  let activityCount = 0;
  const fakePrisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(fakePrisma),
    $executeRaw: async () => [],
    scheduledMatch: {
      findUnique: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateCount += 1;
        Object.assign(row, data);
        return row;
      },
    },
    scheduledMatchActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activityCount += 1;
        const activity = {
          id: activityCount,
          eventType: data.eventType,
          metadata: data.metadata,
          createdAt: data.createdAt,
        };
        (row.activities as unknown[]).push(activity);
        return activity;
      },
    },
  };
  const plan = buildLegacyChallengePreparationPlan(row as never, now);

  await assert.rejects(
    prepareLegacyChallengeTerminal(fakePrisma as never, {
      challengeId: 14,
      now,
      expectedStatus: "proposed",
      expectedLeftUid: "left-user",
      expectedRightUid: "right-user",
      expectedWagerAmountWolo: 5000,
      expectedGuaranteeAmountWolo: 10,
      expectedFundingFingerprint: plan.funding.fingerprint,
      confirmation: "WRONG-CONFIRMATION",
    }),
    /confirmation token is missing or incorrect/
  );
  assert.equal(updateCount, 0);
  assert.equal(activityCount, 0);
});

test("terminal preparation is idempotent and never invokes a settlement action", async () => {
  const row = oneSidedFundingRow();
  let updateCount = 0;
  let activityCount = 0;
  const fakePrisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(fakePrisma),
    $executeRaw: async () => [],
    scheduledMatch: {
      findUnique: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateCount += 1;
        Object.assign(row, data);
        return row;
      },
    },
    scheduledMatchActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activityCount += 1;
        const activity = {
          id: activityCount,
          eventType: data.eventType,
          metadata: data.metadata,
          createdAt: data.createdAt,
        };
        (row.activities as unknown[]).push(activity);
        return activity;
      },
    },
  };
  const plan = buildLegacyChallengePreparationPlan(row as never, now);
  const input = {
    challengeId: 23,
    now,
    expectedStatus: "creator_funded",
    expectedLeftUid: "left-user",
    expectedRightUid: "right-user",
    expectedWagerAmountWolo: 25,
    expectedGuaranteeAmountWolo: 10,
    expectedFundingFingerprint: plan.funding.fingerprint,
    confirmation: plan.confirmation || "",
  };

  const first = await prepareLegacyChallengeTerminal(
    fakePrisma as never,
    input
  );
  assert.equal(first.applied, true);
  assert.equal(first.idempotentReplay, false);
  assert.equal(first.noFundsMoved, true);
  assert.equal(first.plan.currentStatus, "expired");
  assert.equal(first.plan.funding.exactRefundWolo, 35);
  assert.equal(updateCount, 1);
  assert.equal(activityCount, 1);

  const replay = await prepareLegacyChallengeTerminal(
    fakePrisma as never,
    input
  );
  assert.equal(replay.applied, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.noFundsMoved, true);
  assert.equal(updateCount, 1);
  assert.equal(activityCount, 1);
});
