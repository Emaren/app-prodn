import assert from "node:assert/strict";
import test from "node:test";

import {
  BET_BATTLE_HISTORY_SCHEMA,
  projectBetBattleHistory,
  type BetBattleHistorySourceEvent,
} from "../lib/betBattleHistoryProjection.ts";

const rootMarket = {
  marketId: 100,
  rootMarketId: 100,
  parentMarketId: null,
  battleId: 700,
  battlePublicNumber: 3_070,
  battleStartedAt: "2026-08-31T21:00:00.000Z",
  marketType: "winner",
  marketTitle: "Alpha / Bravo vs Charlie / Delta",
  marketHref: "/bets/battle-3070",
  leftLabel: "Alpha / Bravo",
  rightLabel: "Charlie / Delta",
};

function event(
  input: Omit<BetBattleHistorySourceEvent, keyof typeof rootMarket> &
    Partial<typeof rootMarket>,
): BetBattleHistorySourceEvent {
  return { ...rootMarket, ...input };
}

test("winner and Desync propositions become one battle instead of peer history rows", () => {
  const [group] = projectBetBattleHistory([
    event({
      source: "wager",
      sourceId: 1,
      kind: "escrow_funded",
      status: "active",
      occurredAt: "2026-08-31T21:05:00.000Z",
      amountWolo: 100,
      actor: "Alice",
      side: "left",
      economicKey: "stake-leg:1",
    }),
    event({
      source: "market",
      sourceId: 100,
      kind: "result",
      status: "won:left",
      occurredAt: "2026-08-31T22:00:00.000Z",
      side: "left",
    }),
    event({
      marketId: 101,
      rootMarketId: 100,
      parentMarketId: 100,
      marketType: "desync",
      marketTitle: "Will this battle desync?",
      source: "market",
      sourceId: 101,
      kind: "result",
      status: "won:no",
      occurredAt: "2026-08-31T22:01:00.000Z",
      side: "no",
    }),
  ]);

  assert.equal(group.schema, BET_BATTLE_HISTORY_SCHEMA);
  assert.equal(group.groupKey, "battle:700");
  assert.equal(group.battleId, 700);
  assert.equal(group.publicNumber, 3_070);
  assert.equal(group.rootMarketId, 100);
  assert.equal(group.title, rootMarket.marketTitle);
  assert.equal(group.href, rootMarket.marketHref);
  assert.deepEqual(
    [...new Set(group.timeline.map((row) => row.marketId))].sort((a, b) => a - b),
    [100, 101],
  );
  assert.ok(group.winnerOutcome, "winner result remains visible on the battle");
  assert.ok(group.desyncOutcome, "Desync result remains visible inside the battle");
});

test("two funded legs from one transfer remain one slip without losing either stake", () => {
  const [group] = projectBetBattleHistory([
    event({
      source: "wager",
      sourceId: 10,
      kind: "escrow_funded",
      status: "active",
      occurredAt: "2026-08-31T21:05:00.000Z",
      amountWolo: 100,
      actor: "Alice",
      userId: 1,
      ticketId: 800,
      stakeLegId: 900,
      side: "left",
      txHash: "SHARED_TICKET_TX",
      economicKey: "stake-leg:900",
    }),
    event({
      marketId: 101,
      rootMarketId: 100,
      parentMarketId: 100,
      marketType: "desync",
      marketTitle: "Will this battle desync?",
      source: "wager",
      sourceId: 11,
      kind: "escrow_funded",
      status: "active",
      occurredAt: "2026-08-31T21:05:00.000Z",
      amountWolo: 10,
      actor: "Alice",
      userId: 1,
      ticketId: 800,
      stakeLegId: 901,
      side: "yes",
      txHash: "SHARED_TICKET_TX",
      economicKey: "stake-leg:901",
    }),
  ]);

  assert.equal(group.coreStakeWolo, 110);
  assert.equal(group.slips.length, 1);
  assert.equal(group.slips[0].ticketId, 800);
  assert.equal(group.slips[0].bettorName, "Alice");
  assert.equal(group.slips[0].totalStakeWolo, 110);
  assert.equal(group.slips[0].txHash, "SHARED_TICKET_TX");
  assert.deepEqual(
    group.slips[0].legs.map((leg) => leg.marketId).sort((a, b) => a - b),
    [100, 101],
  );
});

test("multiple bettors remain distinct slips inside the same battle", () => {
  const [group] = projectBetBattleHistory([
    event({
      source: "wager",
      sourceId: 20,
      kind: "stake_recorded",
      status: "active",
      occurredAt: "2026-08-31T21:06:00.000Z",
      amountWolo: 50,
      actor: "Alice",
      userId: 1,
      side: "left",
      economicKey: "wager:20",
    }),
    event({
      source: "wager",
      sourceId: 21,
      kind: "stake_recorded",
      status: "active",
      occurredAt: "2026-08-31T21:07:00.000Z",
      amountWolo: 75,
      actor: "Bob",
      userId: 2,
      side: "right",
      economicKey: "wager:21",
    }),
  ]);

  assert.equal(group.coreStakeWolo, 125);
  assert.equal(group.slips.length, 2);
  assert.deepEqual(
    group.slips.map((slip) => slip.bettorName).sort(),
    ["Alice", "Bob"],
  );
});

test("core settlement never absorbs optional rewards", () => {
  const [group] = projectBetBattleHistory([
    event({
      source: "wager",
      sourceId: 30,
      kind: "escrow_funded",
      status: "won",
      occurredAt: "2026-08-31T21:05:00.000Z",
      amountWolo: 50_000,
      actor: "Alice",
      economicKey: "stake:30",
    }),
    event({
      source: "claim",
      sourceId: 31,
      kind: "payout",
      status: "claimed",
      occurredAt: "2026-08-31T22:05:00.000Z",
      amountWolo: 98_000,
      actor: "Alice",
      txHash: "CORE_PAYOUT_TX",
      payoutDestination: "wallet",
      economicKey: "claim:31",
    }),
    event({
      source: "claim",
      sourceId: 32,
      kind: "winner_bounty",
      status: "claimed",
      occurredAt: "2026-08-31T22:06:00.000Z",
      amountWolo: 2_000,
      actor: "Alice",
      txHash: "BOUNTY_TX",
      payoutDestination: "wallet",
      economicKey: "claim:32",
    }),
    event({
      source: "founder_bonus",
      sourceId: 33,
      kind: "founder_participants",
      status: "settled",
      occurredAt: "2026-08-31T22:07:00.000Z",
      amountWolo: 500,
      economicKey: "founder:33",
    }),
  ]);

  assert.equal(group.coreStakeWolo, 50_000);
  assert.equal(group.corePayoutWolo, 98_000);
  assert.equal(group.coreRefundWolo, 0);
  assert.equal(group.rewardWolo, 2_500);
});

test("the battle timeline is deterministic and oldest-to-newest", () => {
  const [group] = projectBetBattleHistory([
    event({
      source: "claim",
      sourceId: 43,
      kind: "payout",
      status: "claimed",
      occurredAt: "2026-08-31T22:03:00.000Z",
      amountWolo: 98,
      payoutDestination: "wallet",
    }),
    event({
      source: "market",
      sourceId: 42,
      kind: "result",
      status: "won:left",
      occurredAt: "2026-08-31T22:02:00.000Z",
    }),
    event({
      source: "wager",
      sourceId: 41,
      kind: "escrow_funded",
      status: "active",
      occurredAt: "2026-08-31T22:01:00.000Z",
      amountWolo: 50,
    }),
    event({
      source: "stake_intent",
      sourceId: 40,
      kind: "stake_intent",
      status: "verified",
      occurredAt: "2026-08-31T22:00:00.000Z",
      amountWolo: 50,
    }),
  ]);

  assert.deepEqual(
    group.timeline.map((row) => row.kind),
    ["stake_intent", "escrow_funded", "result", "payout"],
  );
  assert.deepEqual(
    group.timeline.map((row) => row.occurredAt),
    [...group.timeline.map((row) => row.occurredAt)].sort(),
  );
});

test("a late payout cannot promote an older numbered battle above a newer battle", () => {
  const groups = projectBetBattleHistory([
    event({
      battleId: 701,
      battlePublicNumber: 3_071,
      battleStartedAt: "2026-08-31T23:00:00.000Z",
      marketId: 200,
      rootMarketId: 200,
      marketTitle: "Newer battle",
      source: "market",
      sourceId: 200,
      kind: "result",
      status: "won:right",
      occurredAt: "2026-08-31T23:30:00.000Z",
    }),
    event({
      battleId: 700,
      battlePublicNumber: 3_070,
      battleStartedAt: "2026-08-31T21:00:00.000Z",
      source: "claim",
      sourceId: 201,
      kind: "payout",
      status: "claimed",
      occurredAt: "2026-09-01T05:00:00.000Z",
      amountWolo: 98,
      payoutDestination: "wallet",
    }),
  ]);

  assert.deepEqual(groups.map((group) => group.publicNumber), [3_071, 3_070]);
  assert.equal(groups[1].latestActivityAt, "2026-09-01T05:00:00.000Z");
});

test("unnumbered legacy battles use start identity rather than latest activity", () => {
  const groups = projectBetBattleHistory([
    event({
      battleId: null,
      battlePublicNumber: null,
      battleStartedAt: "2025-01-02T00:00:00.000Z",
      marketId: 602,
      rootMarketId: 602,
      marketTitle: "Newer legacy battle",
      source: "market",
      sourceId: 602,
      kind: "result",
      status: "won:left",
      occurredAt: "2025-01-02T02:00:00.000Z",
    }),
    event({
      battleId: null,
      battlePublicNumber: null,
      battleStartedAt: "2025-01-01T00:00:00.000Z",
      marketId: 601,
      rootMarketId: 601,
      marketTitle: "Older legacy battle",
      source: "claim",
      sourceId: 601,
      kind: "payout",
      status: "claimed",
      occurredAt: "2025-02-01T00:00:00.000Z",
      amountWolo: 98,
      payoutDestination: "wallet",
    }),
  ]);

  assert.deepEqual(groups.map((group) => group.rootMarketId), [602, 601]);
});

test("legacy child markets fall back to their parent root without a BattleIdentity", () => {
  const groups = projectBetBattleHistory([
    event({
      battleId: null,
      battlePublicNumber: null,
      battleStartedAt: "2025-01-01T00:00:00.000Z",
      marketId: 501,
      rootMarketId: undefined,
      parentMarketId: null,
      marketTitle: "Legacy matchup",
      source: "market",
      sourceId: 501,
      kind: "result",
      status: "won:left",
      occurredAt: "2025-01-01T02:00:00.000Z",
    }),
    event({
      battleId: null,
      battlePublicNumber: null,
      battleStartedAt: "2025-01-01T00:00:00.000Z",
      marketId: 502,
      rootMarketId: undefined,
      parentMarketId: 501,
      marketType: "desync",
      marketTitle: "Will this battle desync?",
      source: "market",
      sourceId: 502,
      kind: "result",
      status: "won:no",
      occurredAt: "2025-01-01T02:01:00.000Z",
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupKey, "market:501");
  assert.equal(groups[0].battleId, null);
  assert.equal(groups[0].rootMarketId, 501);
  assert.equal(groups[0].title, "Legacy matchup");
});

test("projection never invents payout or refund money from a stake or result", () => {
  const [group] = projectBetBattleHistory([
    event({
      source: "wager",
      sourceId: 60,
      kind: "stake_recorded",
      status: "lost",
      occurredAt: "2026-08-31T21:05:00.000Z",
      amountWolo: 100,
      actor: "Alice",
    }),
    event({
      source: "market",
      sourceId: 61,
      kind: "result",
      status: "won:right",
      occurredAt: "2026-08-31T22:00:00.000Z",
    }),
  ]);

  assert.equal(group.coreStakeWolo, 100);
  assert.equal(group.corePayoutWolo, 0);
  assert.equal(group.coreRefundWolo, 0);
  assert.equal(group.rewardWolo, 0);
  assert.equal(group.timeline.some((row) => row.kind === "payout"), false);
  assert.equal(group.timeline.some((row) => row.kind === "refund"), false);
});
