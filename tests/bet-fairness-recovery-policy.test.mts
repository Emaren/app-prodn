import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  POST_BROADCAST_RECOVERY_CHAIN_GRACE_MS,
  isPostBroadcastStakeRecovery,
} from "../lib/betStakeRecoveryPolicy.ts";

const CLOSE =
  new Date(
    "2026-09-03T21:00:00.000Z"
  );

function baseInput() {
  return {
    intentStatus:
      "verified_unrecorded",
    requestedTxHash:
      "ABC123",
    intentTxHash:
      "ABC123",
    requestedWalletAddress:
      "wolo1testwallet",
    intentWalletAddress:
      "wolo1testwallet",
    intentPropositionHash:
      "p".repeat(64),
    marketPropositionHash:
      "p".repeat(64),
    intentCreatedAt:
      new Date(
        "2026-09-03T20:59:30.000Z"
      ),
    broadcastSubmittedAt:
      new Date(
        "2026-09-03T20:59:59.000Z"
      ),
    txTimestamp:
      "2026-09-03T21:00:05.000Z",
    marketType:
      "winner",
    marketLinkedSessionKey:
      "scheduled-session",
    marketScheduledMatchId:
      42,
    marketCloseAt:
      CLOSE,
    marketStatus:
      "live",
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
}

test(
  "genuine pre-cutoff broadcast may recover after scheduled market becomes live",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery(
        baseInput()
      ),
      true
    );
  }
);

test(
  "server may learn a genuine pre-cutoff transfer after cutoff",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...baseInput(),
        broadcastSubmittedAt:
          new Date(
            "2026-09-03T21:00:08.000Z"
          ),
        txTimestamp:
          "2026-09-03T21:00:05.000Z",
      }),
      true
    );
  }
);

test(
  "pre-cutoff intent alone cannot authorize a materially late transfer",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...baseInput(),
        broadcastSubmittedAt:
          new Date(
            "2026-09-03T21:00:45.000Z"
          ),
        txTimestamp:
          "2026-09-03T21:00:30.001Z",
      }),
      false
    );
  }
);

test(
  "watcher-discovered unscheduled live game cannot masquerade as recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...baseInput(),
        marketLinkedSessionKey:
          "watcher-live-session",
        marketScheduledMatchId:
          null,
      }),
      false
    );
  }
);

test(
  "live-born Desync proposition cannot use recovery rail",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...baseInput(),
        marketType:
          "desync",
        marketScheduledMatchId:
          null,
        marketLinkedSessionKey:
          "watcher-live-session",
      }),
      false
    );
  }
);

test(
  "unknown market type cannot use recovery",
  () => {
    assert.equal(
      isPostBroadcastStakeRecovery({
        ...baseInput(),
        marketType:
          "future_live_market",
      }),
      false
    );
  }
);

test(
  "missing market identity context fails closed at runtime",
  () => {
    const incomplete = {
      ...baseInput(),
    } as Partial<
      ReturnType<
        typeof baseInput
      >
    >;

    delete incomplete.marketType;

    assert.equal(
      isPostBroadcastStakeRecovery(
        incomplete as
          ReturnType<
            typeof baseInput
          >
      ),
      false
    );
  }
);

test(
  "final recovery write fences bind market identity against TOCTOU drift",
  () => {
    const sources = [
      readFileSync(
        new URL(
          "../lib/betWagering.ts",
          import.meta.url
        ),
        "utf8"
      ),
      readFileSync(
        new URL(
          "../lib/betStakeTickets.ts",
          import.meta.url
        ),
        "utf8"
      ),
    ];

    for (const source of sources) {
      assert.match(
        source,
        /marketType:\s*market\.marketType/
      );

      assert.match(
        source,
        /linkedSessionKey:\s*market\.linkedSessionKey/
      );

      assert.match(
        source,
        /scheduledMatchId:\s*market\.scheduledMatchId/
      );
    }
  }
);

test(
  "chain grace tolerates block production but is bounded",
  () => {
    assert.equal(
      POST_BROADCAST_RECOVERY_CHAIN_GRACE_MS,
      30_000
    );

    const nearCutoffBroadcast =
      new Date(
        "2026-09-03T20:59:59.999Z"
      );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...baseInput(),
        broadcastSubmittedAt:
          nearCutoffBroadcast,
        txTimestamp:
          "2026-09-03T21:00:29.999Z",
      }),
      true
    );

    assert.equal(
      isPostBroadcastStakeRecovery({
        ...baseInput(),
        broadcastSubmittedAt:
          nearCutoffBroadcast,
        txTimestamp:
          "2026-09-03T21:00:30.000Z",
      }),
      false
    );
  }
);
