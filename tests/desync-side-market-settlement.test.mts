import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  classifyResolvedMarketSettlement,
  feeBearingMatchedWagerVolumeWolo,
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
  "#JimsRule prevents unmatched user principal from becoming a winner bounty on any settlement lane",
  () => {
    assert.doesNotMatch(source, /grossWinnerBountyWolo/);
    assert.doesNotMatch(source, /winningWagers\.length\s*===\s*0\s*&&\s*winnerBountyWolo/);
    assert.match(source, /unmatched user principal is never available for a winner/);
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
  "#JimsRule returns an unbacked factual desync wager because no opposite stake matched it",
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
    assert.equal(plan.matchedVolumeWolo, 0);
    assert.equal(plan.unmatchedVolumeWolo, 25);
    assert.deepEqual(plan.outcomes, [
      { id: 5, status: "lost", payoutWolo: 25, bettingFeeWolo: 0 },
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
  "#JimsRule removes fee and winner-bounty funding when an ordinary wager has no counterparty",
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
    assert.equal(plan.matchedVolumeWolo, 0);
    assert.equal(plan.unmatchedVolumeWolo, 100);
    assert.equal(plan.bettingFeePoolWolo, 0);
    assert.deepEqual(plan.outcomes, [
      { id: 53, status: "lost", payoutWolo: 100, bettingFeeWolo: 0 },
    ]);
  },
);


test(
  "#JimsRule partial match charges fees only on matched volume and returns unmatched winner principal",
  () => {
    const plan = planResolvedWagerSettlements({
      winningSide: "left",
      marketType: "winner",
      desyncMarketType: "desync",
      seedLeftWolo: 0,
      seedRightWolo: 0,
      wagers: [
        { id: 91, side: "left", amountWolo: 50_000 },
        { id: 92, side: "right", amountWolo: 25 },
      ],
      feeRateBps: 200,
      feeDenominator: 10_000,
    });

    assert.equal(plan.matchedPerSideWolo, 25);
    assert.equal(plan.matchedVolumeWolo, 50);
    assert.equal(plan.unmatchedVolumeWolo, 49_975);
    assert.equal(plan.bettingFeePoolWolo, 1);
    assert.deepEqual(plan.exposures, [
      { id: 91, side: "left", amountWolo: 50_000, matchedWolo: 25, unmatchedWolo: 49_975 },
      { id: 92, side: "right", amountWolo: 25, matchedWolo: 25, unmatchedWolo: 0 },
    ]);
    assert.deepEqual(plan.outcomes, [
      { id: 91, status: "won", payoutWolo: 50_024, bettingFeeWolo: 1 },
      { id: 92, status: "lost", payoutWolo: 0, bettingFeeWolo: 0 },
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

    assert.equal(plan.matchedPerSideWolo, 150);
    assert.equal(plan.matchedVolumeWolo, 300);
    assert.equal(plan.unmatchedVolumeWolo, 700);
    assert.equal(plan.bettingFeePoolWolo, 6);
    assert.equal(paidWolo + plan.bettingFeePoolWolo, 1_000);
    assert.deepEqual(
      plan.outcomes.map((outcome) => outcome.status),
      ["won", "won", "lost"],
    );
  },
);

test("fee-bearing matched volume excludes unmatched principal and voided markets", () => {
  assert.equal(
    feeBearingMatchedWagerVolumeWolo([
      { id: 1001, marketId: 10, side: "left", amountWolo: 100, status: "won" },
      { id: 1002, marketId: 10, side: "right", amountWolo: 250, status: "lost" },
      { id: 2001, marketId: 20, side: "left", amountWolo: 500, status: "void" },
      { id: 2002, marketId: 20, side: "right", amountWolo: 500, status: "void" },
    ]),
    200,
  );
});


test("#JimsRule rejects unsafe whole-WOLO numeric inputs before settlement", () => {
  const base = {
    winningSide: "left" as const,
    marketType: "winner",
    desyncMarketType: "desync",
    seedLeftWolo: 0,
    seedRightWolo: 0,
    feeRateBps: 200,
    feeDenominator: 10_000,
  };
  for (const wagers of [
    [{ id: 1, side: "left", amountWolo: Number.MAX_SAFE_INTEGER + 1 }],
    [{ id: 1, side: "left", amountWolo: 1.5 }],
    [{ id: 1, side: "left", amountWolo: -1 }],
    [{ id: 1, side: "left", amountWolo: 2 }, { id: 1, side: "right", amountWolo: 2 }],
    [{ id: 1, side: "left", amountWolo: Number.MAX_SAFE_INTEGER },
      { id: 2, side: "left", amountWolo: 1 }],
    [{ id: 1, side: "left", amountWolo: Number.MAX_SAFE_INTEGER },
      { id: 2, side: "right", amountWolo: Number.MAX_SAFE_INTEGER }],
  ]) {
    assert.throws(() => planResolvedWagerSettlements({ ...base, wagers }), /safe|unique|range/i);
  }
});

test("#JimsRule exact BigInt pro-rata math preserves a near-safe-limit pool", () => {
  // Individual stake and total are safe but their naive floating-point
  // multiplication inside a pro-rata allocator is not.
  const leftA = 4_503_599_627_370_495;
  const leftB = 1;
  const right = 4_503_599_627_370_495;
  const plan = planResolvedWagerSettlements({
    winningSide: "left",
    marketType: "winner",
    desyncMarketType: "desync",
    seedLeftWolo: 0,
    seedRightWolo: 0,
    wagers: [
      { id: 10, side: "left", amountWolo: leftA },
      { id: 20, side: "left", amountWolo: leftB },
      { id: 30, side: "right", amountWolo: right },
    ],
    feeRateBps: 200,
    feeDenominator: 10_000,
  });
  assert.equal(plan.settledUserPool, Number.MAX_SAFE_INTEGER);
  assert.equal(plan.matchedVolumeWolo, Number.MAX_SAFE_INTEGER - 1);
  assert.equal(plan.unmatchedVolumeWolo, 1);
  assert.deepEqual(plan.exposures.map(({ matchedWolo, unmatchedWolo }) => ({
    matchedWolo, unmatchedWolo,
  })), [
    { matchedWolo: leftA - 1, unmatchedWolo: 1 },
    { matchedWolo: 1, unmatchedWolo: 0 },
    { matchedWolo: right, unmatchedWolo: 0 },
  ]);
  const sumPayout = plan.outcomes.reduce(
    (sum, row) => sum + BigInt(row.payoutWolo), 0n
  );
  assert.equal(sumPayout + BigInt(plan.bettingFeePoolWolo),
               BigInt(Number.MAX_SAFE_INTEGER));
});

test("#JimsRule deterministic ties and half-up matched fees conserve every whole WOLO", () => {
  const plan = planResolvedWagerSettlements({
    winningSide: "left",
    marketType: "winner",
    desyncMarketType: "desync",
    seedLeftWolo: 0,
    seedRightWolo: 0,
    wagers: [
      { id: 11, side: "left", amountWolo: 1 },
      { id: 12, side: "left", amountWolo: 1 },
      { id: 13, side: "left", amountWolo: 1 },
      { id: 14, side: "right", amountWolo: 2 },
    ],
    feeRateBps: 1,
    feeDenominator: 2,
  });
  assert.deepEqual(plan.exposures.map(w => [w.id, w.matchedWolo, w.unmatchedWolo]), [
    [11, 1, 0], [12, 1, 0], [13, 0, 1], [14, 2, 0],
  ]);
  assert.equal(plan.matchedVolumeWolo, 4);
  assert.equal(plan.unmatchedVolumeWolo, 1);
  assert.equal(plan.bettingFeePoolWolo, 2);
  assert.equal(plan.outcomes.reduce((sum, x) => sum + x.payoutWolo + x.bettingFeeWolo, 0), 5);
});

test("#JimsRule matched-only accounting survives varied bounded market configurations", () => {
  for (let seed = 1; seed <= 120; seed++) {
    const a = (seed * 13) % 177;
    const b = (seed * 31) % 211;
    const c = (seed * 41) % 101;
    const wagers = [
      { id: 1, side: "left", amountWolo: a },
      { id: 2, side: "right", amountWolo: b },
      { id: 3, side: "left", amountWolo: c },
    ];
    for (const winningSide of ["left", "right", null] as const) {
      const plan = planResolvedWagerSettlements({
        winningSide, marketType: "winner", desyncMarketType: "desync",
        seedLeftWolo: 500_000, seedRightWolo: 800_000,
        wagers, feeRateBps: 200, feeDenominator: 10_000,
      });
      const total = a + b + c;
      const matched = 2 * Math.min(a + c, b);
      assert.equal(plan.matchedVolumeWolo, matched);
      assert.equal(plan.unmatchedVolumeWolo, total - matched);
      assert.equal(plan.exposures.reduce((sum, x) => sum + x.matchedWolo + x.unmatchedWolo, 0), total);
      assert.equal(plan.outcomes.reduce((sum, x) => sum + x.payoutWolo + x.bettingFeeWolo, 0), total);
      assert.equal(plan.bettingFeePoolWolo, winningSide ? Math.round(matched * 0.02) : 0);
      for (const exposure of plan.exposures) {
        assert.ok(exposure.matchedWolo >= 0 && exposure.matchedWolo <= exposure.amountWolo);
        assert.equal(exposure.matchedWolo + exposure.unmatchedWolo, exposure.amountWolo);
      }
      if (!matched || !winningSide) assert.equal(plan.bettingFeePoolWolo, 0);
    }
  }
});

test("#JimsRule rejects fee rates larger than actual matched winning principal", () => {
  const base = {
    winningSide: "left" as const, marketType: "winner",
    desyncMarketType: "desync", seedLeftWolo: 0, seedRightWolo: 0,
    wagers: [
      { id: 901, side: "left", amountWolo: 100 },
      { id: 902, side: "right", amountWolo: 100 },
    ],
  };
  assert.throws(() => planResolvedWagerSettlements({
    ...base, feeRateBps: 5050, feeDenominator: 10_000,
  }), /Matched betting fee exceeds available winning stake/);
  assert.throws(() => planResolvedWagerSettlements({
    ...base, feeRateBps: 10000, feeDenominator: 10_000,
  }), /Matched betting fee exceeds available winning stake/);
  assert.throws(() => planResolvedWagerSettlements({
    ...base, feeRateBps: 200, feeDenominator: Number.MAX_SAFE_INTEGER + 1,
  }), /safe integer/);
  const valid = planResolvedWagerSettlements({
    ...base, feeRateBps: 200, feeDenominator: 10_000,
  });
  assert.equal(valid.bettingFeePoolWolo, 4);
  assert.equal(valid.outcomes.reduce((sum, outcome) =>
    sum + outcome.payoutWolo + outcome.bettingFeeWolo, 0), 200);
});

test("#JimsRule staking fee-bearing matched volume never reports rounded cross-market totals", () => {
  const half = (Number.MAX_SAFE_INTEGER - 1) / 2;
  const entries = [
    { id: 101, marketId: 1, side: "left", amountWolo: half, status: "won" },
    { id: 102, marketId: 1, side: "right", amountWolo: half, status: "lost" },
    { id: 201, marketId: 2, side: "left", amountWolo: 1, status: "won" },
    { id: 202, marketId: 2, side: "right", amountWolo: 1, status: "lost" },
  ];
  assert.throws(() => feeBearingMatchedWagerVolumeWolo(entries),
    /Aggregate fee-bearing matched volume exceeds safe whole-WOLO accounting range/);
  // A void market has no fee-bearing matching even when both sides are funded.
  assert.equal(feeBearingMatchedWagerVolumeWolo(
    entries.map(wager => wager.marketId === 2
      ? { ...wager, status: "void" }
      : wager),
  ), Number.MAX_SAFE_INTEGER - 1);
});
