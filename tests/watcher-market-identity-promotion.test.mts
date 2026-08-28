import assert from "node:assert/strict";
import test from "node:test";

import {
  planWatcherMarketIdentityPromotion,
  type WatcherMarketPromotionSnapshot,
} from "../lib/bets.ts";
import {
  DESYNC_SIDE_MARKET_TYPE,
  WINNER_MARKET_TYPE,
} from "../lib/desyncSideMarket.ts";

const HASH = "a".repeat(64);
const CANONICAL_WINNER = "watcher-live-platform-battle-42";
const CANONICAL_DESYNC = `${CANONICAL_WINNER}-desync`;

function market(
  id: number,
  overrides: Partial<WatcherMarketPromotionSnapshot> = {}
): WatcherMarketPromotionSnapshot {
  return {
    id,
    parentMarketId: null,
    slug: `watcher-live-legacy-${id}`,
    linkedSessionKey: `legacy:battle:${id}`,
    marketType: WINNER_MARKET_TYPE,
    status: "live",
    resolutionReason: null,
    leftLabel: "Jim",
    rightLabel: "Zodiac",
    propositionHash: HASH,
    createdAt: new Date(`2026-08-26T12:00:${String(id).padStart(2, "0")}.000Z`),
    firstStakeAcceptedAt: null,
    voidedAt: null,
    refundStatus: null,
    settlementRunId: null,
    settlementStatus: null,
    settlementAttemptedAt: null,
    settlementExecutedAt: null,
    openIntegrityIncidentCount: 0,
    wagerCount: 0,
    founderBonusCount: 0,
    autoExecutionCount: 0,
    walletLocks: [],
    wagers: [],
    stakeIntents: [],
    stakeTicketLegs: [],
    pendingClaims: [],
    ...overrides,
  };
}

function plan(markets: WatcherMarketPromotionSnapshot[]) {
  return planWatcherMarketIdentityPromotion({
    canonicalWinnerSlug: CANONICAL_WINNER,
    canonicalDesyncSlug: CANONICAL_DESYNC,
    canonicalPropositionHash: HASH,
    markets,
  });
}

test("an existing canonical pair absorbs one funded legacy winner and Desync pair", () => {
  const canonicalWinner = market(10, {
    slug: CANONICAL_WINNER,
    linkedSessionKey: "platform:battle-42",
  });
  const canonicalDesync = market(11, {
    parentMarketId: 10,
    slug: CANONICAL_DESYNC,
    linkedSessionKey: "platform:battle-42",
    marketType: DESYNC_SIDE_MARKET_TYPE,
    leftLabel: "No",
    rightLabel: "Yes",
  });
  const legacyWinner = market(20, {
    firstStakeAcceptedAt: new Date("2026-08-26T12:00:20.000Z"),
    wagerCount: 1,
    wagers: [{ id: 1, userId: 7, side: "left" }],
    walletLocks: [{ id: 2, walletAddress: "wolo1jim", side: "left" }],
    stakeTicketLegs: [
      {
        id: 3,
        ticketId: 90,
        userId: 7,
        propositionHash: HASH,
        side: "left",
      },
    ],
  });
  const legacyDesync = market(21, {
    parentMarketId: 20,
    marketType: DESYNC_SIDE_MARKET_TYPE,
    leftLabel: "No",
    rightLabel: "Yes",
    wagerCount: 1,
    wagers: [{ id: 4, userId: 7, side: "right" }],
  });

  const result = plan([
    legacyDesync,
    canonicalWinner,
    legacyWinner,
    canonicalDesync,
  ]);
  assert.equal(result.kind, "promote");
  if (result.kind !== "promote") return;
  assert.equal(result.winnerTargetId, 10);
  assert.equal(result.desyncTargetId, 11);
  assert.deepEqual(
    result.winnerTransfers.map((transfer) => [transfer.sourceId, transfer.targetId]),
    [[20, 10]]
  );
  assert.deepEqual(
    result.desyncTransfers.map((transfer) => [transfer.sourceId, transfer.targetId]),
    [[21, 11]]
  );
  assert.deepEqual(result.affectedTicketIds, [90]);
});

test("a recoverable legacy escrow memo forces preservation of that market ID", () => {
  const result = plan([
    market(10, {
      slug: CANONICAL_WINNER,
      linkedSessionKey: "platform:battle-42",
    }),
    market(20, {
      stakeIntents: [
        {
          id: 5,
          userId: 7,
          status: "broadcast_submitted",
          propositionHash: HASH,
          side: "left",
        },
      ],
    }),
  ]);
  assert.equal(result.kind, "promote");
  if (result.kind !== "promote") return;
  assert.equal(result.winnerTargetId, 20);
  assert.deepEqual(
    result.winnerTransfers.map((transfer) => [transfer.sourceId, transfer.targetId]),
    [[10, 20]]
  );
});

test("two compatible funded watcher aliases choose one deterministic target", () => {
  const first = market(30, {
    wagerCount: 1,
    wagers: [{ id: 1, userId: 1, side: "left" }],
  });
  const second = market(40, {
    wagerCount: 1,
    wagers: [{ id: 2, userId: 2, side: "right" }],
  });
  for (const rows of [[first, second], [second, first]]) {
    const result = plan(rows);
    assert.equal(result.kind, "promote");
    if (result.kind !== "promote") continue;
    assert.equal(result.winnerTargetId, 30);
    assert.deepEqual(
      result.winnerTransfers.map((transfer) => [transfer.sourceId, transfer.targetId]),
      [[40, 30]]
    );
  }
});

test("two distinct legacy memo promises fail closed", () => {
  const recoverable = (id: number, userId: number) =>
    market(id, {
      stakeIntents: [
        {
          id,
          userId,
          status: "awaiting_signature",
          propositionHash: HASH,
          side: "left",
        },
      ],
    });
  assert.deepEqual(plan([recoverable(30, 1), recoverable(40, 2)]), {
    kind: "blocked",
    reason: "multiple_legacy_memo_market_ids",
  });
});

test("a funded proposition mismatch suppresses canonical promotion", () => {
  assert.deepEqual(
    plan([
      market(30, {
        propositionHash: "b".repeat(64),
        wagerCount: 1,
        wagers: [{ id: 1, userId: 1, side: "left" }],
      }),
    ]),
    { kind: "blocked", reason: "proposition_hash_mismatch" }
  );
});

test("wallet exposure may deduplicate on one effective side but never cross sides", () => {
  const target = market(30, {
    walletLocks: [{ id: 1, walletAddress: "WOLO1JIM", side: "left" }],
  });
  const sameSide = market(40, {
    walletLocks: [{ id: 2, walletAddress: "wolo1jim", side: "left" }],
  });
  const allowed = plan([sameSide, target]);
  assert.equal(allowed.kind, "promote");
  if (allowed.kind === "promote") {
    assert.deepEqual(allowed.winnerTransfers[0]?.duplicateWalletLockIds, [2]);
  }

  const oppositeSide = market(40, {
    walletLocks: [{ id: 2, walletAddress: "wolo1jim", side: "right" }],
  });
  assert.deepEqual(plan([target, oppositeSide]), {
    kind: "blocked",
    reason: "wallet_opposite_side_collision",
  });
});

test("terminal or refund-active financial evidence can never be reopened", () => {
  assert.deepEqual(
    plan([
      market(30, {
        status: "voided",
        voidedAt: new Date("2026-08-26T12:30:00.000Z"),
        refundStatus: "queued",
        wagerCount: 1,
        wagers: [{ id: 1, userId: 1, side: "left" }],
      }),
    ]),
    { kind: "blocked", reason: "terminal_financial_state_exists" }
  );
});

test("an empty promotion tombstone is inert on every later reconciliation", () => {
  const result = plan([
    market(10, {
      slug: CANONICAL_WINNER,
      linkedSessionKey: "platform:battle-42",
    }),
    market(30, {
      status: "voided",
      resolutionReason: "merged_into_platform_market",
      voidedAt: new Date("2026-08-26T12:30:00.000Z"),
    }),
  ]);
  assert.equal(result.kind, "promote");
  if (result.kind !== "promote") return;
  assert.equal(result.winnerTargetId, 10);
  assert.deepEqual(result.winnerTransfers, []);
});

test("pending ticket exposure cannot collapse one user onto opposing winner sides", () => {
  assert.deepEqual(
    plan([
      market(30, {
        stakeTicketLegs: [
          {
            id: 1,
            ticketId: 90,
            userId: 7,
            propositionHash: HASH,
            side: "left",
          },
        ],
      }),
      market(40, {
        stakeTicketLegs: [
          {
            id: 2,
            ticketId: 91,
            userId: 7,
            propositionHash: HASH,
            side: "right",
          },
        ],
      }),
    ]),
    { kind: "blocked", reason: "user_opposite_side_collision" }
  );
});

test("malformed persisted financial sides fail closed instead of mapping to left", () => {
  assert.deepEqual(
    plan([
      market(30, {
        wagerCount: 1,
        wagers: [{ id: 1, userId: 7, side: "unknown" }],
      }),
    ]),
    { kind: "blocked", reason: "invalid_financial_side" }
  );
});

test("a funded Desync child linked outside the exact winner family fails closed", () => {
  assert.deepEqual(
    plan([
      market(30),
      market(31, {
        parentMarketId: 999,
        marketType: DESYNC_SIDE_MARKET_TYPE,
        leftLabel: "No",
        rightLabel: "Yes",
        wagerCount: 1,
        wagers: [{ id: 3, userId: 7, side: "right" }],
      }),
    ]),
    { kind: "blocked", reason: "orphaned_desync_market" }
  );
});

test("reversed persisted labels remap every financial side onto the survivor", () => {
  const result = plan([
    market(10, {
      slug: CANONICAL_WINNER,
      linkedSessionKey: "platform:battle-42",
    }),
    market(20, {
      leftLabel: "Zodiac",
      rightLabel: "Jim",
      wagerCount: 1,
      wagers: [{ id: 1, userId: 7, side: "left" }],
      walletLocks: [{ id: 2, walletAddress: "wolo1jim", side: "right" }],
    }),
  ]);

  assert.equal(result.kind, "promote");
  if (result.kind !== "promote") return;
  assert.deepEqual(result.winnerTransfers, [
    {
      sourceId: 20,
      targetId: 10,
      sideTransfer: { left: "right", right: "left" },
      duplicateWalletLockIds: [],
    },
  ]);
});

test("a ticket cannot acquire two legs for the same promoted proposition", () => {
  const leg = (id: number) => ({
    id,
    ticketId: 90,
    userId: 7,
    propositionHash: HASH,
    side: "left",
  });
  assert.deepEqual(
    plan([
      market(30, { stakeTicketLegs: [leg(1)] }),
      market(40, { stakeTicketLegs: [leg(2)] }),
    ]),
    { kind: "blocked", reason: "ticket_leg_target_collision" }
  );
});

test("pending-claim uniqueness collisions fail closed before foreign keys move", () => {
  const claim = (id: number) => ({
    id,
    normalizedPlayerName: "jim",
    claimKind: "bet_payout",
    claimGroupKey: "winner",
  });
  assert.deepEqual(
    plan([
      market(30, { pendingClaims: [claim(1)] }),
      market(40, { pendingClaims: [claim(2)] }),
    ]),
    { kind: "blocked", reason: "pending_claim_target_collision" }
  );
});

test("multiple Desync children on one persisted parent fail closed", () => {
  const child = (id: number) =>
    market(id, {
      parentMarketId: 30,
      marketType: DESYNC_SIDE_MARKET_TYPE,
      leftLabel: "No",
      rightLabel: "Yes",
    });
  assert.deepEqual(plan([market(30), child(31), child(32)]), {
    kind: "blocked",
    reason: "multiple_desync_children",
  });
});

test("an existing integrity review remains sticky across exact promotion", () => {
  assert.deepEqual(
    plan([
      market(30, {
        openIntegrityIncidentCount: 1,
      }),
    ]),
    { kind: "blocked", reason: "market_integrity_review_exists" }
  );
});

test("frozen ticket proposition drift and unrelated funded labels fail closed", () => {
  assert.deepEqual(
    plan([
      market(30, {
        stakeTicketLegs: [
          {
            id: 1,
            ticketId: 90,
            userId: 7,
            propositionHash: "b".repeat(64),
            side: "left",
          },
        ],
      }),
    ]),
    { kind: "blocked", reason: "frozen_stake_proposition_mismatch" }
  );

  assert.deepEqual(
    plan([
      market(10, {
        slug: CANONICAL_WINNER,
        linkedSessionKey: "platform:battle-42",
      }),
      market(20, {
        leftLabel: "Rick",
        rightLabel: "Emaren",
        wagerCount: 1,
        wagers: [{ id: 2, userId: 8, side: "left" }],
      }),
    ]),
    { kind: "blocked", reason: "market_sides_do_not_match" }
  );
});
