import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isPostBroadcastStakeRecovery,
} from "../lib/betStakeRecoveryPolicy.ts";

const lockedAt =
  new Date("2026-07-26T01:36:10.000Z");

const validRecovery = {
  intentStatus: "suspect",
  requestedTxHash: "ABC123",
  intentTxHash: "abc123",
  requestedWalletAddress: "wolo1wallet",
  intentWalletAddress: "wolo1wallet",
  intentPropositionHash: "proposition-a",
  marketPropositionHash: "proposition-a",
  intentCreatedAt:
    new Date("2026-07-26T01:36:07.000Z"),
  broadcastSubmittedAt:
    new Date("2026-07-26T01:36:15.000Z"),
  marketBettingLockedAt: lockedAt,
  marketStatus: "under_review",
  winnerSide: null,
  settledAt: null,
  voidedAt: null,
  refundStatus: null,
  settlementExecutedAt: null,
};

test(
  "exact broadcast stake recovers after review lock",
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
  "changed proposition blocks recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        marketPropositionHash:
          "proposition-b",
      }),
      false
    );
  }
);

test(
  "stale reservation blocks recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        intentCreatedAt:
          new Date(
            lockedAt.getTime() -
              6 * 60 * 1000
          ),
      }),
      false
    );
  }
);

test(
  "late broadcast blocks recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        broadcastSubmittedAt:
          new Date(
            lockedAt.getTime() +
              91 * 1000
          ),
      }),
      false
    );
  }
);

test(
  "winner and settlement authority block recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        winnerSide: "left",
      }),
      false
    );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        settledAt: new Date(),
      }),
      false
    );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...validRecovery,
        refundStatus: "queued",
      }),
      false
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

    assert.match(
      source,
      /Participants Bonus/
    );

    assert.match(
      source,
      /Winner Bonus/
    );

    assert.doesNotMatch(
      source,
      />\+FB</
    );

    assert.doesNotMatch(
      source,
      />\+FW</
    );
  }
);

test(
  "intent and wager domains contain recovery fences",
  () => {
    const intentSource =
      readFileSync(
        "lib/betStakeIntents.ts",
        "utf8"
      );

    const wagerSource =
      readFileSync(
        "lib/betWagering.ts",
        "utf8"
      );

    assert.match(
      intentSource,
      /broadcastSubmittedAt/
    );

    assert.match(
      wagerSource,
      /allowLockedPostBroadcastRecovery/
    );

    assert.match(
      wagerSource,
      /recoveredAfterMarketLock/
    );
  }
);
