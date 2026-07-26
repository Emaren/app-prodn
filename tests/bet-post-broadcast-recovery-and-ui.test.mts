import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildBetStakeMemo,
} from "../lib/betStakeMemo.ts";
import {
  isPostBroadcastStakeRecovery,
} from "../lib/betStakeRecoveryPolicy.ts";

const closeAt =
  new Date(
    "2026-07-26T01:36:10.000Z"
  );

const validRecovery = {
  intentStatus:
    "suspect",
  requestedTxHash:
    "ABC123",
  intentTxHash:
    "abc123",
  requestedWalletAddress:
    "wolo1wallet",
  intentWalletAddress:
    "wolo1wallet",
  intentPropositionHash:
    "proposition-a",
  marketPropositionHash:
    "proposition-a",
  intentCreatedAt:
    new Date(
      "2026-07-26T01:36:07.000Z"
    ),
  broadcastSubmittedAt:
    new Date(
      "2026-07-26T01:36:15.000Z"
    ),
  txTimestamp:
    "2026-07-26T01:36:09Z",
  marketCloseAt:
    closeAt,
  marketStatus:
    "under_review",
  winnerSide:
    null,
  settledAt:
    null,
  voidedAt:
    null,
  refundStatus:
    null,
  settlementExecutedAt:
    null,
};

test(
  "exact pre-close chain transfer recovers after review lock",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery(
        validRecovery
      ),
      true
    );
  }
);

test(
  "recovery uses actual close and chain time",
  () => {
    const source =
      readFileSync(
        "lib/betStakeRecoveryPolicy.ts",
        "utf8"
      );

    assert.match(
      source,
      /marketCloseAt/
    );

    assert.match(
      source,
      /txTimestamp/
    );

    assert.doesNotMatch(
      source,
      /marketBettingLockedAt/
    );

    assert.doesNotMatch(
      source,
      /reservationAge/
    );
  }
);

test(
  "chain transfer after close grace is rejected",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        txTimestamp:
          "2026-07-26T01:36:41Z",
      }),
      false
    );
  }
);

test(
  "old transfer predating intent cannot be reused",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        txTimestamp:
          "2026-07-26T01:35:36Z",
      }),
      false
    );
  }
);

test(
  "intent created after closure cannot recover",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        intentCreatedAt:
          new Date(
            "2026-07-26T01:36:11Z"
          ),
      }),
      false
    );
  }
);

test(
  "missing close or transaction time blocks recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        marketCloseAt:
          null,
      }),
      false
    );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        txTimestamp:
          null,
      }),
      false
    );
  }
);

test(
  "changed proposition and financial authority block recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        marketPropositionHash:
          "proposition-b",
      }),
      false
    );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        winnerSide:
          "left",
      }),
      false
    );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        settledAt:
          new Date(),
      }),
      false
    );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        refundStatus:
          "queued",
      }),
      false
    );
  }
);

test(
  "client and server share exact market memo",
  () => {
    assert.equal(
      buildBetStakeMemo(433336),
      "AoE2HDBets bet stake · market 433336"
    );

    const clientSource =
      readFileSync(
        "app/bets/page.tsx",
        "utf8"
      );

    const wagerSource =
      readFileSync(
        "lib/betWagering.ts",
        "utf8"
      );

    const settlementSource =
      readFileSync(
        "lib/woloBetSettlement.ts",
        "utf8"
      );

    assert.match(
      clientSource,
      /buildBetStakeMemo\(market\.id\)/
    );

    assert.match(
      wagerSource,
      /expectedMemo:\s*buildBetStakeMemo/
    );

    assert.match(
      settlementSource,
      /txMemo !== expectedMemo/
    );

    assert.match(
      settlementSource,
      /txTimestamp/
    );
  }
);

test(
  "under-review reconciliation preserves original close authority",
  () => {
    const source =
      readFileSync(
        "lib/bets.ts",
        "utf8"
      );

    assert.match(
      source,
      /existing\?\.status === "under_review"[\s\S]*closeAt:\s*existing\.closeAt\s*\?\?\s*new Date\(\)/
    );
  }
);

test(
  "detail page separates accepted and recovery funds",
  () => {
    const source =
      readFileSync(
        "app/bets/[marketId]/page.tsx",
        "utf8"
      );

    assert.match(
      source,
      /status\.toLowerCase\(\) ===\s*"recorded"/
    );

    assert.match(
      source,
      /pendingRecoveryWolo/
    );

    assert.match(
      source,
      /Accepted Book/
    );

    assert.match(
      source,
      /Pending Recovery/
    );

    assert.match(
      source,
      /market\.winnerSide === "left"[\s\S]*market\.winnerSide === "right"[\s\S]*: null/
    );

    assert.doesNotMatch(
      source,
      /· winner: \{winnerName\}/
    );
  }
);

test(
  "E and A cards share one betting composer",
  () => {
    const source =
      readFileSync(
        "app/bets/page.tsx",
        "utf8"
      );

    assert.equal(
      (
        source.match(
          /<BetSlipComposer/g
        ) || []
      ).length,
      3
    );

    assert.match(
      source,
      /1 · Choose side/
    );

    assert.match(
      source,
      /2 · Choose amount/
    );

    assert.match(
      source,
      /Projected return/
    );

    assert.match(
      source,
      /Lock WOLO/
    );

    assert.match(
      source,
      /Founder controls/
    );
  }
);

test(
  "wager recovery is chain-time and close-time fenced atomically",
  () => {
    const source =
      readFileSync(
        "lib/betWagering.ts",
        "utf8"
      );

    assert.match(
      source,
      /txTimestamp:\s*stakeVerification\.txTimestamp/
    );

    assert.match(
      source,
      /marketCloseAt:\s*market\.closeAt/
    );

    assert.match(
      source,
      /closeAt:\s*market\.closeAt/
    );

    assert.match(
      source,
      /recoveredAfterMarketLock/
    );
  }
);

test(
  "migration backfill avoids target-table alias join scope",
  () => {
    const source =
      readFileSync(
        "prisma/migrations/"
          + "20260726025500_fence_post_broadcast_bet_recovery/"
          + "migration.sql",
        "utf8"
      );

    assert.equal(
      (
        source.match(
          /UPDATE "bet_stake_intents" AS intent/g
        ) || []
      ).length,
      2
    );

    assert.match(
      source,
      /FROM "bet_markets" AS market[\s\S]*WHERE intent\."market_id" = market\."id"/
    );

    assert.match(
      source,
      /FROM "bet_wagers" AS wager[\s\S]*WHERE wager\."stake_intent_id" = intent\."id"/
    );

    assert.doesNotMatch(
      source,
      /LEFT JOIN "bet_wagers" AS wager[\s\S]*ON wager\."stake_intent_id" = intent\."id"/
    );
  }
);
