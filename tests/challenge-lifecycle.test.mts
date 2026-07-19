import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CHALLENGE_ACCEPTANCE_WINDOWS_HOURS,
  CHALLENGE_FUNDING_WINDOW_MS,
  CHALLENGE_PLAY_WINDOW_MS,
  buildAcceptanceExpiry,
  buildFundingExpiry,
  buildPlayExpiry,
  isFullRefundStatus,
  isTerminalChallengeStatus,
  normalizeAcceptanceWindowHours,
  normalizeChallengeScheduleMode,
  projectChallengeFinancialState,
  projectChallengeLifecycle,
} from "../lib/challengeLifecycle.ts";
import { buildChallengeEconomySurface } from "../lib/challengeEconomy.ts";

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS = "wolo1challengeescrowtest";
const require = createRequire(import.meta.url);
const createJiti = require("jiti") as (
  filename: string,
  options: { interopDefault: boolean; alias: Record<string, string> }
) => (id: string) => Record<string, unknown>;
const settlementModule = createJiti(fileURLToPath(import.meta.url), {
  interopDefault: true,
  alias: { "@": testRoot },
})(resolve(testRoot, "lib/scheduledMatchSettlements.ts"));
const buildScheduledMatchSettlementPlan =
  settlementModule.buildScheduledMatchSettlementPlan as (row: Record<string, unknown>) => {
    state: string;
    stateDetail: string;
    settlementRunId: string;
    participants: {
      left: { fundingProofComplete: boolean };
      right: { fundingProofComplete: boolean };
    };
    liability: { fundedLiabilityWolo: number; plannedTransferWolo: number };
    transfers: Array<{
      action: string;
      reason: string;
      recipientAddress: string | null;
      amountWolo: number;
      requestId: string;
      existingSettlement: { status: string; txHash: string | null } | null;
    }>;
  };

const NOW = new Date("2026-07-18T17:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function completedSettlementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 204,
    status: "completed",
    scheduledAt: null,
    challengeNote: null,
    wagerAmountWolo: 25,
    guaranteeAmountWolo: 10,
    cancelledAt: null,
    resultAt: NOW,
    settlementReadyAt: NOW,
    challengerFundingTxHash: "LEFT-FUNDING-TX",
    challengerFundingWalletAddress: "wolo1leftfundingwallet",
    challengerFundedAt: new Date(NOW.getTime() - HOUR),
    challengedFundingTxHash: "RIGHT-FUNDING-TX",
    challengedFundingWalletAddress: "wolo1rightfundingwallet",
    challengedFundedAt: new Date(NOW.getTime() - HOUR),
    challengerCheckedInAt: null,
    challengedCheckedInAt: null,
    linkedWinner: "Left Warrior",
    updatedAt: NOW,
    challenger: {
      id: 11,
      uid: "left-user",
      inGameName: "Left Warrior",
      steamPersonaName: "Left Steam",
      walletAddress: "wolo1leftprofilewallet",
    },
    challenged: {
      id: 12,
      uid: "right-user",
      inGameName: "Right Warrior",
      steamPersonaName: "Right Steam",
      walletAddress: "wolo1rightprofilewallet",
    },
    settlements: [],
    ...overrides,
  };
}

test("acceptance windows expose only the four supported choices", () => {
  assert.deepEqual([...CHALLENGE_ACCEPTANCE_WINDOWS_HOURS], [24, 72, 168, 720]);
});

for (const [input, expected] of [
  [undefined, 72],
  [24, 24],
  [72, 72],
  [168, 168],
  [720, 720],
  [1, 72],
  ["30", 72],
] as const) {
  test(`normalizes acceptance window ${String(input)} to ${expected} hours`, () => {
    assert.equal(normalizeAcceptanceWindowHours(input), expected);
  });
}

test("default acceptance expiry is exactly three days", () => {
  assert.equal(buildAcceptanceExpiry(NOW, undefined).toISOString(), "2026-07-21T17:00:00.000Z");
});

test("accepted funding window is exactly one hour", () => {
  assert.equal(buildFundingExpiry(NOW).getTime() - NOW.getTime(), CHALLENGE_FUNDING_WINDOW_MS);
});

test("play-anytime window is exactly thirty days", () => {
  assert.equal(buildPlayExpiry(NOW).getTime() - NOW.getTime(), CHALLENGE_PLAY_WINDOW_MS);
});

test("schedule mode defaults open and only exact opts in", () => {
  assert.equal(normalizeChallengeScheduleMode(undefined), "open");
  assert.equal(normalizeChallengeScheduleMode("open"), "open");
  assert.equal(normalizeChallengeScheduleMode("EXACT"), "exact");
});

test("new open challenge is awaiting opponent on the acceptance deadline", () => {
  const projected = projectChallengeLifecycle({
    status: "proposed",
    scheduleMode: "open",
    acceptanceExpiresAt: new Date(NOW.getTime() + 3 * DAY),
  }, NOW);
  assert.equal(projected.lifecycleState, "proposed");
  assert.equal(projected.deadlineKind, "acceptance");
  assert.equal(projected.active, true);
  assert.equal(projected.exactMatchAt, null);
});

test("unreconciled invitation past its deadline projects expired and inactive", () => {
  const projected = projectChallengeLifecycle({
    status: "creator_funded",
    scheduleMode: "open",
    acceptanceExpiresAt: new Date(NOW.getTime() - 1),
    challengerFundedAt: new Date(NOW.getTime() - DAY),
  }, NOW);
  assert.equal(projected.lifecycleState, "expired");
  assert.equal(projected.active, false);
});

test("accepted challenge exposes the short funding deadline", () => {
  const projected = projectChallengeLifecycle({
    status: "accepted",
    acceptedAt: NOW,
    fundingExpiresAt: new Date(NOW.getTime() + HOUR),
    challengerFundedAt: NOW,
  }, NOW);
  assert.equal(projected.lifecycleState, "creator_funded");
  assert.equal(projected.deadlineKind, "funding");
});

test("accepted but unfunded challenge becomes funding-expired at the boundary", () => {
  const projected = projectChallengeLifecycle({
    status: "accepted",
    acceptedAt: new Date(NOW.getTime() - HOUR),
    fundingExpiresAt: NOW,
    challengerFundedAt: new Date(NOW.getTime() - 2 * HOUR),
  }, NOW);
  assert.equal(projected.lifecycleState, "funding_expired");
  assert.equal(projected.active, false);
});

test("fully funded open challenge is Match Ready and play-anytime", () => {
  const projected = projectChallengeLifecycle({
    status: "funded",
    scheduleMode: "open",
    challengerFundedAt: NOW,
    challengedFundedAt: NOW,
    playExpiresAt: new Date(NOW.getTime() + 30 * DAY),
  }, NOW);
  assert.equal(projected.lifecycleState, "funded");
  assert.equal(projected.headline, "Match Ready");
  assert.equal(projected.deadlineKind, "play");
});

test("fully funded exact challenge is scheduled", () => {
  const scheduledAt = new Date(NOW.getTime() + 2 * HOUR);
  const projected = projectChallengeLifecycle({
    status: "funded",
    scheduleMode: "exact",
    scheduledAt,
    challengerFundedAt: NOW,
    challengedFundedAt: NOW,
  }, NOW);
  assert.equal(projected.lifecycleState, "scheduled");
  assert.equal(projected.deadlineKind, "match");
  assert.equal(projected.exactMatchAt?.toISOString(), scheduledAt.toISOString());
});

test("funded open challenge becomes play-expired at thirty-day boundary", () => {
  const projected = projectChallengeLifecycle({
    status: "funded",
    scheduleMode: "open",
    challengerFundedAt: new Date(NOW.getTime() - 30 * DAY),
    challengedFundedAt: new Date(NOW.getTime() - 30 * DAY),
    playExpiresAt: NOW,
  }, NOW);
  assert.equal(projected.lifecycleState, "play_expired");
  assert.equal(projected.active, false);
});

for (const status of [
  "completed",
  "declined",
  "canceled",
  "expired",
  "funding_expired",
  "play_expired",
  "no_show_left",
  "no_show_right",
  "double_no_show",
]) {
  test(`${status} is terminal`, () => {
    assert.equal(isTerminalChallengeStatus(status), true);
    assert.equal(projectChallengeLifecycle({ status }, NOW).active, false);
  });
}

for (const status of ["declined", "canceled", "expired", "funding_expired", "play_expired"]) {
  test(`${status} requires full-refund semantics when funded`, () => {
    assert.equal(isFullRefundStatus(status), true);
  });
}

test("creator deposit projects one-sided locked money", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "proposed",
    totalFundingWolo: 35,
    challengerFunded: true,
    challengedFunded: false,
  });
  assert.equal(financial.state, "creator_locked");
  assert.equal(financial.fundedLiabilityWolo, 35);
});

test("both deposits project fully locked money", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "funded",
    totalFundingWolo: 35,
    challengerFunded: true,
    challengedFunded: true,
  });
  assert.equal(financial.state, "fully_locked");
  assert.equal(financial.fundedLiabilityWolo, 70);
});

test("canceled funded challenge without settlement proof says refund due", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "canceled",
    totalFundingWolo: 1_010,
    challengerFunded: true,
    challengedFunded: false,
  });
  assert.equal(financial.state, "refund_due");
  assert.equal(financial.executedWolo, 0);
});

test("executed full refund with tx proof says refunded", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "canceled",
    totalFundingWolo: 1_010,
    challengerFunded: true,
    challengedFunded: false,
    settlements: [{ status: "executed", amountWolo: 1_010, txHash: "ABC123" }],
  });
  assert.equal(financial.state, "refunded");
  assert.equal(financial.confirmedTransferCount, 1);
});

test("executed row without tx proof never says refunded", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "canceled",
    totalFundingWolo: 35,
    challengerFunded: true,
    challengedFunded: false,
    settlements: [{ status: "executed", amountWolo: 35, txHash: null }],
  });
  assert.equal(financial.state, "refund_due");
});

test("failed refund remains explicit and retryable", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "expired",
    totalFundingWolo: 35,
    challengerFunded: true,
    challengedFunded: false,
    settlements: [{ status: "failed", amountWolo: 35, txHash: null }],
  });
  assert.equal(financial.state, "refund_failed");
});

test("executing refund remains processing", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "funding_expired",
    totalFundingWolo: 35,
    challengerFunded: true,
    challengedFunded: false,
    settlements: [{ status: "executing", amountWolo: 35, txHash: null }],
  });
  assert.equal(financial.state, "refund_processing");
});

test("completed result without chain transfer says settlement pending", () => {
  const financial = projectChallengeFinancialState({
    lifecycleStatus: "completed",
    totalFundingWolo: 35,
    challengerFunded: true,
    challengedFunded: true,
  });
  assert.equal(financial.state, "settlement_pending");
});

test("open challenge economy never enters check-in or no-show without an exact time", () => {
  const surface = buildChallengeEconomySurface({
    status: "funded",
    scheduleMode: "open",
    scheduledAt: null,
    wagerAmountWolo: 25,
    guaranteeAmountWolo: 10,
    challengerFundedAt: new Date(NOW.getTime() - DAY),
    challengedFundedAt: new Date(NOW.getTime() - DAY),
  }, NOW);
  assert.equal(surface.displayState, "funded");
  assert.equal(surface.economy.checkInWindowState, "disabled");
  assert.equal(surface.economy.checkInOpensAt, null);
});

test("exact challenge opens check-in ten minutes before start", () => {
  const scheduledAt = new Date(NOW.getTime() + 5 * 60 * 1000);
  const surface = buildChallengeEconomySurface({
    status: "funded",
    scheduleMode: "exact",
    scheduledAt,
    wagerAmountWolo: 25,
    guaranteeAmountWolo: 10,
    challengerFundedAt: NOW,
    challengedFundedAt: NOW,
  }, NOW);
  assert.equal(surface.displayState, "checkin_open");
  assert.equal(surface.economy.checkInWindowState, "open");
});

test("canonical single no-show rule awards missed guarantee to checked-in opponent", () => {
  const scheduledAt = new Date(NOW.getTime() - 1);
  const surface = buildChallengeEconomySurface({
    status: "funded",
    scheduleMode: "exact",
    scheduledAt,
    wagerAmountWolo: 25,
    guaranteeAmountWolo: 10,
    challengerFundedAt: new Date(NOW.getTime() - DAY),
    challengedFundedAt: new Date(NOW.getTime() - DAY),
    challengedCheckedInAt: new Date(NOW.getTime() - 60_000),
  }, NOW);
  assert.equal(surface.displayState, "no_show_left");
  assert.match(surface.economy.resolution.guarantee || "", /awarded to the opponent/);
  assert.equal(surface.economy.resolution.treasury, null);
});

test("completed Challenge returns both guarantees and awards both wager deposits to the exact winner", () => {
  const plan = buildScheduledMatchSettlementPlan(completedSettlementRow());

  assert.equal(plan.state, "ready");
  assert.equal(plan.settlementRunId, "aoe2hdbets:challenge-204:completed:v1");
  assert.equal(plan.participants.left.fundingProofComplete, true);
  assert.equal(plan.participants.right.fundingProofComplete, true);
  assert.equal(plan.liability.fundedLiabilityWolo, 70);
  assert.equal(plan.liability.plannedTransferWolo, 70);
  assert.deepEqual(
    plan.transfers.map((transfer) => ({
      action: transfer.action,
      reason: transfer.reason,
      recipientAddress: transfer.recipientAddress,
      amountWolo: transfer.amountWolo,
      requestId: transfer.requestId,
    })),
    [
      {
        action: "left_guarantee_return",
        reason: "return",
        recipientAddress: "wolo1leftfundingwallet",
        amountWolo: 10,
        requestId: "aoe2hdbets:challenge-204:left_guarantee_return",
      },
      {
        action: "right_guarantee_return",
        reason: "return",
        recipientAddress: "wolo1rightfundingwallet",
        amountWolo: 10,
        requestId: "aoe2hdbets:challenge-204:right_guarantee_return",
      },
      {
        action: "left_wager_awarded_to_left",
        reason: "award",
        recipientAddress: "wolo1leftfundingwallet",
        amountWolo: 25,
        requestId: "aoe2hdbets:challenge-204:left_wager_awarded_to_left",
      },
      {
        action: "right_wager_awarded_to_left",
        reason: "award",
        recipientAddress: "wolo1leftfundingwallet",
        amountWolo: 25,
        requestId: "aoe2hdbets:challenge-204:right_wager_awarded_to_left",
      },
    ]
  );
});

test("completed Challenge can settle to the challenged participant through an exact recorded alias", () => {
  const plan = buildScheduledMatchSettlementPlan(
    completedSettlementRow({ linkedWinner: "right steam" })
  );

  assert.equal(plan.state, "ready");
  assert.deepEqual(
    plan.transfers
      .filter((transfer) => transfer.action.includes("wager_awarded"))
      .map((transfer) => [transfer.action, transfer.recipientAddress]),
    [
      ["left_wager_awarded_to_right", "wolo1rightfundingwallet"],
      ["right_wager_awarded_to_right", "wolo1rightfundingwallet"],
    ]
  );
});

for (const [label, overrides, detailPattern] of [
  ["missing winner", { linkedWinner: null }, /requires a replay-linked winner/],
  ["unrecognized winner", { linkedWinner: "Left Warrior (Winner)" }, /does not exactly match/],
  [
    "ambiguous winner",
    {
      linkedWinner: "Shared Name",
      challenger: {
        id: 11,
        uid: "left-user",
        inGameName: "Shared Name",
        steamPersonaName: "Left Steam",
        walletAddress: "wolo1leftprofilewallet",
      },
      challenged: {
        id: 12,
        uid: "right-user",
        inGameName: "Shared Name",
        steamPersonaName: "Right Steam",
        walletAddress: "wolo1rightprofilewallet",
      },
    },
    /matches both participants/,
  ],
  [
    "incomplete funding proof",
    { challengedFundingTxHash: null },
    /funded-at time, verified funding tx hash, and funding wallet address/,
  ],
  [
    "reused funding proof",
    { challengedFundingTxHash: "left-funding-tx" },
    /same funding transaction/,
  ],
] as const) {
  test(`completed Challenge remains review-only for ${label}`, () => {
    const plan = buildScheduledMatchSettlementPlan(
      completedSettlementRow(overrides as Record<string, unknown>)
    );

    assert.equal(plan.state, "review_only");
    assert.match(plan.stateDetail, detailPattern);
    assert.equal(plan.transfers.length, 0);
  });
}

test("completed settlement actions reconnect to existing executed evidence idempotently", () => {
  const firstPlan = buildScheduledMatchSettlementPlan(completedSettlementRow());
  const settlements = firstPlan.transfers.map((transfer, index) => ({
    id: index + 1,
    status: "executed",
    action: transfer.action,
    recipientAddress: transfer.recipientAddress,
    amountWolo: transfer.amountWolo,
    requestId: transfer.requestId,
    sourceWalletAddress: "wolo1challengeescrowtest",
    txHash: `SETTLEMENT-TX-${index + 1}`,
    errorDetail: null,
    createdAt: NOW,
    updatedAt: NOW,
    executedAt: NOW,
  }));

  const replayPlan = buildScheduledMatchSettlementPlan(
    completedSettlementRow({ settlements })
  );
  assert.equal(replayPlan.state, "executed");
  assert.equal(
    replayPlan.transfers.every(
      (transfer) =>
        transfer.existingSettlement?.status === "executed" &&
        Boolean(transfer.existingSettlement.txHash)
    ),
    true
  );
});
