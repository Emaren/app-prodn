import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  classifyResolvedMarketSettlement,
  planResolvedWagerSettlements,
} from "../lib/betWagerSettlement.ts";
import {
  resolveDesyncSideMarketWinner,
} from "../lib/desyncSideMarket.ts";


const source =
  readFileSync(
    new URL(
      "../lib/bets.ts",
      import.meta.url
    ),
    "utf8"
  );

const incidentSource =
  readFileSync(
    new URL(
      "../lib/replayDesyncIncidents.ts",
      import.meta.url
    ),
    "utf8"
  );


test(
  "settlement consumes current effective human desync provenance",
  () => {
    assert.match(
      source,
      /loadReplayDesyncIncidentProvenance/
    );

    assert.match(
      source,
      /truth\?\.desyncOccurred/
    );
  }
);


test(
  "desync side markets have an independent lifecycle reconciler",
  () => {
    assert.match(
      source,
      /async function reconcileDesyncSideMarkets/
    );

    assert.match(
      source,
      /marketType:\s*DESYNC_SIDE_MARKET_TYPE/
    );

    assert.match(
      source,
      /resolveDesyncSideMarketWinner/
    );
  }
);


test(
  "YES settlement is explicitly human-confirmed desync",
  () => {
    assert.match(
      source,
      /human_confirmed_desync/
    );

    assert.match(
      source,
      /winningSide ===\s*"right"/
    );
  }
);


test(
  "NO remains closed but unresolved during review grace period",
  () => {
    assert.match(
      source,
      /desyncReviewDeadlineMs/
    );

    assert.match(
      source,
      /status:\s*"closing"/
    );

    assert.match(
      source,
      /commissionerReviewState:\s*"desync_review_window"/
    );

    assert.match(
      source,
      /desync_review_window_open/
    );
  }
);


test(
  "NO finality is represented separately from YES confirmation",
  () => {
    assert.match(
      source,
      /review_window_closed_no_desync/
    );

    assert.match(
      source,
      /DESYNC_MARKET_REVIEW_GRACE_MINUTES/
    );
  }
);


test(
  "voided winner proposition refunds an unprovable desync proposition",
  () => {
    assert.match(
      source,
      /parent\?\.status ===\s*"voided"/
    );

    assert.match(
      source,
      /resolutionReason:\s*"desync_truth_unprovable"/
    );

    assert.match(
      source,
      /refundStatus:\s*"queued"/
    );
  }
);


test(
  "side-market truth is reconciled before resolved wagers settle",
  () => {
    const linkIndex =
      source.indexOf(
        "await reconcileBetMarketStatsLinks(prisma)"
      );

    const desyncIndex =
      source.indexOf(
        "await reconcileDesyncSideMarkets(prisma)"
      );

    const settlementIndex =
      source.indexOf(
        "await settleResolvedMarketWagers(prisma)"
      );

    assert.ok(
      linkIndex >= 0
    );

    assert.ok(
      desyncIndex >
        linkIndex
    );

    assert.ok(
      settlementIndex >
        desyncIndex
    );
  }
);


test(
  "financial settlement branches desync truth away from ordinary winner truth",
  () => {
    assert.match(
      source,
      /isDesyncSideMarketType\(\s*market\.marketType\s*\)/
    );

    assert.match(
      source,
      /assertDesyncSideMarketSettlementTruthGate/
    );

    assert.match(
      source,
      /assertLockedOrdinaryMarketWinnerPayoutAllowed/
    );

    assert.match(
      source,
      /assertSettlementWinnerTruthGate/
    );
  }
);


test(
  "desync truth is checked again immediately before wager terminalization",
  () => {
    assert.match(
      source,
      /Desync side-market payout blocked/
    );

    assert.match(
      source,
      /expectedWinner !==\s*winningSide/
    );
  }
);


test(
  "proofless terminal voids refund while settled payouts still require a side",
  () => {
    assert.deepEqual(
      classifyResolvedMarketSettlement({
        status: "voided",
        // A stale column can never turn a terminal void into a payout.
        winnerSide: "right",
      }),
      { kind: "refund", winningSide: null }
    );
    assert.deepEqual(
      classifyResolvedMarketSettlement({
        status: "settled",
        winnerSide: "left",
      }),
      { kind: "payout", winningSide: "left" }
    );
    assert.deepEqual(
      classifyResolvedMarketSettlement({
        status: "settled",
        winnerSide: null,
      }),
      { kind: "blocked", winningSide: null }
    );

    const transactionIndex = source.indexOf(
      "terminalizedActiveWagers = await prisma.$transaction"
    );
    const payoutBranchIndex = source.indexOf(
      'if (settlementIntent.kind === "payout")',
      transactionIndex
    );
    const proofRequirementIndex = source.indexOf(
      "Desync side-market payout blocked",
      transactionIndex
    );
    assert.ok(payoutBranchIndex > transactionIndex);
    assert.ok(proofRequirementIndex > payoutBranchIndex);
  }
);


test(
  "incident append and wager terminalization share one replay transaction lock",
  () => {
    assert.match(
      incidentSource,
      /await acquireReplayDesyncAdvisoryLock\(tx, gameStatsId\)/
    );

    const transactionIndex =
      source.indexOf(
        "terminalizedActiveWagers = await prisma.$transaction"
      );
    const lockIndex =
      source.indexOf(
        "await acquireReplayDesyncAdvisoryLock(",
        transactionIndex
      );
    const truthReadIndex =
      source.indexOf(
        "await assertDesyncSideMarketSettlementTruthGate(",
        lockIndex
      );
    const activeRecheckIndex =
      source.indexOf(
        "const stillActiveWagers = await tx.betWager.count",
        truthReadIndex
      );
    const terminalizationIndex =
      source.indexOf(
        "await tx.betWager.update(",
        activeRecheckIndex
      );

    assert.ok(transactionIndex >= 0);
    assert.ok(lockIndex > transactionIndex);
    assert.ok(truthReadIndex > lockIndex);
    assert.ok(activeRecheckIndex > truthReadIndex);
    assert.ok(terminalizationIndex > activeRecheckIndex);
    assert.match(
      source.slice(activeRecheckIndex, terminalizationIndex),
      /stillActiveWagers !== market\.wagers\.length[\s\S]*return false/
    );
  }
);


test(
  "desync markets cannot create YES or NO player winner bounties",
  () => {
    assert.match(
      source,
      /winningSide\s*&&\s*!isDesyncSideMarketType\(\s*market\.marketType\s*\)/
    );
  }
);


test(
  "generic winner proof-timeout workflow excludes desync markets",
  () => {
    assert.match(
      source,
      /marketType:\s*WINNER_MARKET_TYPE,\s*status:\s*"awaiting_final_proof"/
    );
  }
);


test(
  "generic late-final winner workflow excludes desync markets",
  () => {
    assert.match(
      source,
      /marketType:\s*WINNER_MARKET_TYPE,\s*status:\s*"voided"/
    );
  }
);


test(
  "settlement delegates every resolved wager to the behavior-tested payout planner",
  () => {
    assert.match(
      source,
      /planResolvedWagerSettlements\(\{/
    );

    assert.match(
      source,
      /const settlementOutcomeByWagerId = new Map/
    );

    assert.match(source, /const outcome = settlementOutcomeByWagerId\.get\(wager\.id\)/);
  }
);


test(
  "human-confirmed YES pays YES and loses NO instead of refunding",
  () => {
    const winningSide = resolveDesyncSideMarketWinner({
      desyncOccurred: true,
      parentStatus: "under_review",
      parentWinnerSide: null,
      parentSettledAtMs: null,
      nowMs: 1,
    });
    const plan = planResolvedWagerSettlements({
      winningSide,
      marketType: "desync",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [
        { id: 1, side: "left", amountWolo: 10 },
        { id: 2, side: "right", amountWolo: 10 },
      ],
      feeRateBps: 0,
      feeDenominator: 10_000,
    });

    assert.deepEqual(plan.outcomes, [
      { id: 1, status: "lost", payoutWolo: 0, bettingFeeWolo: 0 },
      { id: 2, status: "won", payoutWolo: 20, bettingFeeWolo: 0 },
    ]);
    assert.equal(plan.unbackedDesyncWinningSide, false);
  }
);


test(
  "safe-final NO pays NO and loses YES instead of refunding",
  () => {
    const parentSettledAtMs = 1_000_000;
    const winningSide = resolveDesyncSideMarketWinner({
      desyncOccurred: false,
      parentStatus: "settled",
      parentWinnerSide: "right",
      parentSettledAtMs,
      nowMs: parentSettledAtMs + 10 * 60_000,
      reviewGraceMinutes: 10,
    });
    const plan = planResolvedWagerSettlements({
      winningSide,
      marketType: "desync",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [
        { id: 3, side: "left", amountWolo: 15 },
        { id: 4, side: "right", amountWolo: 5 },
      ],
      feeRateBps: 0,
      feeDenominator: 10_000,
    });

    assert.deepEqual(plan.outcomes, [
      { id: 3, status: "won", payoutWolo: 20, bettingFeeWolo: 0 },
      { id: 4, status: "lost", payoutWolo: 0, bettingFeeWolo: 0 },
    ]);
    assert.equal(plan.unbackedDesyncWinningSide, false);
  }
);


test(
  "authoritative human NO pays NO immediately without waiting for parent finality",
  () => {
    const winningSide = resolveDesyncSideMarketWinner({
      desyncOccurred: false,
      humanDesyncDecisionPresent: true,
      parentStatus: "live",
      parentWinnerSide: null,
      parentSettledAtMs: null,
      nowMs: 1,
    });
    const plan = planResolvedWagerSettlements({
      winningSide,
      marketType: "desync",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [
        { id: 31, side: "left", amountWolo: 15 },
        { id: 41, side: "right", amountWolo: 5 },
      ],
      feeRateBps: 0,
      feeDenominator: 10_000,
    });

    assert.deepEqual(plan.outcomes, [
      { id: 31, status: "won", payoutWolo: 20, bettingFeeWolo: 0 },
      { id: 41, status: "lost", payoutWolo: 0, bettingFeeWolo: 0 },
    ]);
  }
);


test(
  "an unbacked factual desync side makes opposing wagers lose instead of blanket-refunding",
  () => {
    const plan = planResolvedWagerSettlements({
      winningSide: "right",
      marketType: "desync",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [{ id: 5, side: "left", amountWolo: 25 }],
      feeRateBps: 200,
      feeDenominator: 10_000,
    });

    assert.equal(plan.unbackedDesyncWinningSide, true);
    assert.equal(plan.bettingFeePoolWolo, 0);
    assert.deepEqual(plan.outcomes, [
      { id: 5, status: "lost", payoutWolo: 0, bettingFeeWolo: 0 },
    ]);
  }
);


test(
  "unprovable desync truth still returns every original stake exactly",
  () => {
    const input = {
      winningSide: null,
      marketType: "desync",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [
        { id: 51, side: "left", amountWolo: 25 },
        { id: 52, side: "right", amountWolo: 75 },
      ],
      feeRateBps: 200,
      feeDenominator: 10_000,
    } as const;
    const firstPlan = planResolvedWagerSettlements(input);
    const retryPlan = planResolvedWagerSettlements(input);

    assert.deepEqual(firstPlan, retryPlan, "retries must produce one identical plan");
    assert.equal(firstPlan.unbackedDesyncWinningSide, false);
    assert.equal(firstPlan.bettingFeePoolWolo, 0);
    assert.deepEqual(firstPlan.outcomes, [
      { id: 51, status: "void", payoutWolo: 25, bettingFeeWolo: 0 },
      { id: 52, status: "void", payoutWolo: 75, bettingFeeWolo: 0 },
    ]);
  },
);


test(
  "ordinary winner books preserve their no-bettor winner-bounty fee basis",
  () => {
    const plan = planResolvedWagerSettlements({
      winningSide: "left",
      marketType: "winner",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [{ id: 53, side: "right", amountWolo: 100 }],
      feeRateBps: 200,
      feeDenominator: 10_000,
    });

    assert.equal(plan.unbackedDesyncWinningSide, false);
    assert.equal(plan.bettingFeePoolWolo, 2);
    assert.deepEqual(plan.outcomes, [
      { id: 53, status: "lost", payoutWolo: 0, bettingFeeWolo: 0 },
    ]);
  },
);


test(
  "backed desync settlement conserves the user pool after the configured fee",
  () => {
    const plan = planResolvedWagerSettlements({
      winningSide: "left",
      marketType: "desync",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [
        { id: 6, side: "left", amountWolo: 100 },
        { id: 7, side: "left", amountWolo: 50 },
        { id: 8, side: "right", amountWolo: 850 },
      ],
      feeRateBps: 200,
      feeDenominator: 10_000,
    });
    const paidWolo = plan.outcomes.reduce(
      (sum, outcome) => sum + outcome.payoutWolo,
      0,
    );

    assert.equal(plan.bettingFeePoolWolo, 20);
    assert.equal(paidWolo + plan.bettingFeePoolWolo, 1_000);
    assert.deepEqual(
      plan.outcomes.map((outcome) => outcome.status),
      ["won", "won", "lost"],
    );
  },
);
