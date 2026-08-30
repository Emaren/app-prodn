import assert from "node:assert/strict";
import test from "node:test";

import {
  BET_LIFECYCLE_SCHEMA,
  projectBetLifecycleGroups,
  type BetLifecycleSourceEvent,
} from "../lib/betLifecycleProjection.ts";

const market = {
  marketId: 42,
  marketTitle: "Player One vs Player Two",
  marketHref: "/bets/player-one-vs-player-two",
};

function event(
  input: Omit<BetLifecycleSourceEvent, keyof typeof market> & Partial<typeof market>,
): BetLifecycleSourceEvent {
  return { ...market, ...input };
}

test("typed lifecycle projection never depends on presentation copy", () => {
  const groups = projectBetLifecycleGroups([
    event({
      source: "wager",
      sourceId: 1,
      kind: "stake_recorded",
      status: "active",
      occurredAt: "2026-08-01T00:00:00.000Z",
      amountWolo: 25,
      detail: "words deliberately contain no bet, stake, escrow, or versus markers",
    }),
    event({
      source: "market",
      sourceId: 42,
      kind: "result",
      status: "won:left",
      occurredAt: "2026-08-01T01:00:00.000Z",
      detail: "opaque localized copy",
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].schema, BET_LIFECYCLE_SCHEMA);
  assert.equal(groups[0].stakeTotalWolo, 25);
  assert.deepEqual(groups[0].events.map((row) => row.kind), ["stake_recorded", "result"]);
});

test("verified wager supersedes its intent and one economic stake is counted once", () => {
  const groups = projectBetLifecycleGroups([
    event({
      source: "stake_intent",
      sourceId: 7,
      kind: "stake_intent",
      status: "verified",
      occurredAt: "2026-08-01T00:00:00.000Z",
      amountWolo: 100,
      txHash: "ABC",
      economicKey: "stake:abc",
    }),
    event({
      source: "wager",
      sourceId: 8,
      kind: "escrow_funded",
      status: "active",
      occurredAt: "2026-08-01T00:00:01.000Z",
      amountWolo: 100,
      txHash: "ABC",
      economicKey: "stake:abc",
    }),
  ]);

  assert.equal(groups[0].stakeTotalWolo, 100);
  assert.deepEqual(groups[0].events.map((row) => row.kind), ["escrow_funded"]);
  assert.deepEqual(groups[0].events[0].sourceIds, ["wager:8"]);
});

test("founder rewards and terminal claims aggregate once by semantic kind", () => {
  const groups = projectBetLifecycleGroups([
    event({
      source: "founder_bonus",
      sourceId: 1,
      kind: "founder_participants",
      status: "settled",
      occurredAt: "2026-08-01T00:10:00.000Z",
      amountWolo: 20,
    }),
    event({
      source: "founder_bonus",
      sourceId: 2,
      kind: "founder_participants",
      status: "settled",
      occurredAt: "2026-08-01T00:11:00.000Z",
      amountWolo: 30,
    }),
    event({
      source: "founder_bonus",
      sourceId: 3,
      kind: "founder_winner",
      status: "settled",
      occurredAt: "2026-08-01T00:12:00.000Z",
      amountWolo: 40,
    }),
    event({
      source: "claim",
      sourceId: 11,
      kind: "payout",
      status: "claimed",
      occurredAt: "2026-08-01T02:00:00.000Z",
      amountWolo: 60,
      txHash: "PAY1",
      payoutDestination: "wallet",
      economicKey: "payout:pay1",
    }),
    event({
      source: "claim",
      sourceId: 12,
      kind: "payout",
      status: "claimed",
      occurredAt: "2026-08-01T02:00:01.000Z",
      amountWolo: 60,
      txHash: "PAY1",
      payoutDestination: "wallet",
      economicKey: "payout:pay1",
    }),
  ]);

  const group = groups[0];
  assert.equal(group.founderParticipantsWolo, 50);
  assert.equal(group.founderWinnerWolo, 40);
  assert.equal(group.payoutTotalWolo, 60);
  assert.equal(group.events.filter((row) => row.kind === "founder_participants").length, 1);
  assert.equal(group.events.filter((row) => row.kind === "founder_winner").length, 1);
  assert.equal(group.events.filter((row) => row.kind === "payout").length, 1);
});

test("groups are newest-first while lifecycle children are deterministically oldest-first", () => {
  const groups = projectBetLifecycleGroups([
    event({
      marketId: 9,
      source: "claim",
      sourceId: 3,
      kind: "payout",
      status: "pending",
      occurredAt: "2026-08-02T00:00:00.000Z",
      amountWolo: 10,
      payoutDestination: "settlement_queue",
    }),
    event({
      marketId: 9,
      source: "market",
      sourceId: 9,
      kind: "result",
      status: "won:right",
      occurredAt: "2026-08-01T00:00:00.000Z",
    }),
    event({
      marketId: 8,
      source: "wager",
      sourceId: 1,
      kind: "stake_recorded",
      status: "active",
      occurredAt: "2026-07-31T00:00:00.000Z",
      amountWolo: 3,
    }),
  ]);

  assert.deepEqual(groups.map((group) => group.marketId), [9, 8]);
  assert.deepEqual(groups[0].events.map((row) => row.kind), ["result", "payout"]);
  assert.equal(groups[0].events[1].payoutDestination, "settlement_queue");
});

test("app-recorded wagers can never be relabeled as verified escrow", () => {
  const [group] = projectBetLifecycleGroups([
    event({
      source: "wager",
      sourceId: 99,
      kind: "stake_recorded",
      status: "active",
      occurredAt: "2026-08-01T00:00:00.000Z",
      amountWolo: 12,
      detail: "This copy may even say escrow; the typed kind remains authoritative.",
    }),
  ]);

  assert.equal(group.events[0].kind, "stake_recorded");
  assert.equal(group.events.some((row) => row.kind === "escrow_funded"), false);
});
