import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";


const source =
  readFileSync(
    new URL(
      "../lib/bets.ts",
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
  "desync truth is checked again immediately before payout planning",
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
  "desync market with no winning backers refunds every stake instead of stranding escrow",
  () => {
    assert.match(
      source,
      /const desyncNoWinnerRefund\s*=/
    );

    assert.match(
      source,
      /isDesyncSideMarketType\(\s*market\.marketType\s*\)/
    );

    assert.match(
      source,
      /winningUserPool ===\s*0/
    );

    assert.match(
      source,
      /market\.wagers\.length >\s*0/
    );

    assert.match(
      source,
      /!desyncNoWinnerRefund\s*\?\s*Math\.round|!desyncNoWinnerRefund/
    );

    assert.match(
      source,
      /!winningSide\s*\|\|\s*desyncNoWinnerRefund/
    );

    assert.match(
      source,
      /nextStatus = "void";\s*payoutWolo = wager\.amountWolo/
    );
  }
);
