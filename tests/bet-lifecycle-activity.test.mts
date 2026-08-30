import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadBetLifecycleActivityPage } from "../lib/betLifecycleActivity.ts";

const at = (value: string) => new Date(value);

function fakePrisma(overrides: {
  market?: Record<string, unknown>;
  wagers?: Array<Record<string, unknown>>;
  intents?: Array<Record<string, unknown>>;
  bonuses?: Array<Record<string, unknown>>;
  claims?: Array<Record<string, unknown>>;
} = {}) {
  const market = {
    id: 42,
    slug: "battle-42",
    title: "Localized title without parsing markers",
    leftLabel: "Alpha",
    rightLabel: "Bravo",
    status: "settled",
    winnerSide: "left",
    resolutionReason: "trusted replay final",
    settledAt: at("2026-08-01T03:00:00.000Z"),
    voidedAt: null,
    updatedAt: at("2026-08-01T03:00:00.000Z"),
    ...overrides.market,
  };
  const wager = {
    id: 11,
    marketId: 42,
    userId: 7,
    stakeIntentId: 10,
    stakeLegId: null,
    side: "left",
    amountWolo: 25,
    payoutWolo: null,
    status: "won",
    executionMode: "app_only",
    stakeTxHash: null,
    stakeLockedAt: null,
    payoutTxHash: null,
    createdAt: at("2026-08-01T00:30:00.000Z"),
    updatedAt: at("2026-08-01T03:10:00.000Z"),
    settledAt: at("2026-08-01T03:00:00.000Z"),
    user: { uid: "u7", inGameName: "Tester", steamPersonaName: null },
    stakeIntent: { status: "recorded" },
    stakeLeg: null,
  };
  const intent = {
    id: 10,
    marketId: 42,
    userId: 7,
    side: "left",
    amountWolo: 25,
    status: "recorded",
    stakeTxHash: null,
    verifiedAt: null,
    recordedAt: at("2026-08-01T00:30:00.000Z"),
    createdAt: at("2026-08-01T00:20:00.000Z"),
    updatedAt: at("2026-08-01T00:30:00.000Z"),
    user: { uid: "u7", inGameName: "Tester", steamPersonaName: null },
  };
  const bonus = {
    id: 3,
    marketId: 42,
    bonusType: "participants",
    totalAmountWolo: 50,
    note: null,
    status: "settled",
    createdAt: at("2026-08-01T01:00:00.000Z"),
    updatedAt: at("2026-08-01T03:00:00.000Z"),
    settledAt: at("2026-08-01T03:00:00.000Z"),
    rescindedAt: null,
  };
  const claim = {
    id: 9,
    sourceMarketId: 42,
    displayPlayerName: "Tester",
    amountWolo: 60,
    claimKind: "bet_payout",
    status: "pending",
    claimedByUserId: null,
    payoutTxHash: null,
    errorState: "awaiting verified wallet-linked account",
    createdAt: at("2026-08-01T03:05:00.000Z"),
    updatedAt: at("2026-08-01T03:05:00.000Z"),
    claimedAt: null,
    rescindedAt: null,
  };
  const wagers = overrides.wagers ?? [wager];
  const intents = overrides.intents ?? [intent];
  const bonuses = overrides.bonuses ?? [bonus];
  const claims = overrides.claims ?? [claim];
  const candidateTimes = [
    market.updatedAt,
    ...wagers.map((row) => row.updatedAt as Date),
    ...intents.map((row) => row.updatedAt as Date),
    ...bonuses.map((row) => row.updatedAt as Date),
    ...claims.map((row) => row.updatedAt as Date),
  ].filter((value): value is Date => value instanceof Date);

  return {
    $queryRaw: async () => [{
      marketId: Number(market.id),
      occurredAt: new Date(Math.max(...candidateTimes.map((value) => value.getTime()))),
    }],
    betMarket: {
      findMany: async () => [market],
    },
    betWager: {
      findMany: async () => wagers,
    },
    betStakeIntent: {
      findMany: async () => intents,
    },
    betMarketFounderBonus: {
      findMany: async () => bonuses,
    },
    pendingWoloClaim: {
      findMany: async () => claims,
    },
  };
}

test("database adapter builds one complete typed lifecycle without inferring from copy", async () => {
  const page = await loadBetLifecycleActivityPage(fakePrisma() as never, {
    limit: 10,
    minimumAt: at("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(page.groups.length, 1);
  const group = page.groups[0];
  assert.equal(group.marketId, 42);
  assert.equal(group.marketTitle, "Localized title without parsing markers");
  assert.equal(group.stakeTotalWolo, 25);
  assert.equal(group.founderParticipantsWolo, 50);
  assert.equal(group.payoutTotalWolo, 60);
  assert.deepEqual(group.events.map((row) => row.kind), [
    "stake_recorded",
    "founder_participants",
    "result",
    "payout",
  ]);
  assert.equal(group.events[0].detail, "left side · app-side wager record");
  assert.equal(group.events[0].kind, "stake_recorded");
  assert.equal(group.events[3].payoutDestination, "awaiting_wallet_link");
  assert.equal(page.nextBefore, "2026-08-01T03:05:00.000Z");
});

test("two claims in one batch transaction remain two economic payouts", async () => {
  const claims = [10, 20].map((amountWolo, index) => ({
    id: 100 + index,
    sourceMarketId: 42,
    displayPlayerName: `Winner ${index + 1}`,
    amountWolo,
    claimKind: "bet_payout",
    status: "claimed",
    claimedByUserId: 20 + index,
    payoutTxHash: "SAME_BATCH_TX",
    errorState: null,
    createdAt: at(`2026-08-01T03:0${index}:00.000Z`),
    updatedAt: at(`2026-08-01T03:0${index}:00.000Z`),
    claimedAt: at(`2026-08-01T03:0${index}:00.000Z`),
    rescindedAt: null,
  }));
  const page = await loadBetLifecycleActivityPage(
    fakePrisma({ wagers: [], intents: [], bonuses: [], claims }) as never,
    { limit: 10 },
  );

  const payout = page.groups[0].events.find((event) => event.kind === "payout");
  assert.equal(page.groups[0].payoutTotalWolo, 30);
  assert.equal(payout?.eventCount, 2);
  assert.deepEqual(payout?.payoutDestinationCounts, { wallet: 2 });
});

test("a pending or failed claim hash is a breadcrumb, not wallet finality", async () => {
  const internalFailure = "duplicate tx guard: signer sequence 19 already consumed";
  const claim = {
    id: 200,
    sourceMarketId: 42,
    displayPlayerName: "Tester",
    amountWolo: 15,
    claimKind: "bet_payout",
    status: "pending",
    claimedByUserId: 7,
    payoutTxHash: "UNCONFIRMED_HASH",
    errorState: internalFailure,
    createdAt: at("2026-08-01T03:05:00.000Z"),
    updatedAt: at("2026-08-01T03:06:00.000Z"),
    claimedAt: null,
    rescindedAt: null,
  };
  const page = await loadBetLifecycleActivityPage(
    fakePrisma({ wagers: [], intents: [], bonuses: [], claims: [claim] }) as never,
    { limit: 10 },
  );
  const payout = page.groups[0].events.find((event) => event.kind === "payout");

  assert.equal(payout?.payoutDestination, "failed");
  assert.equal(payout?.detail, "Payout needs operator reconciliation");
  assert.doesNotMatch(JSON.stringify(page), /signer sequence|duplicate tx guard/i);
});

test("a recorded ticket proves each funded leg without collapsing its shared tx", async () => {
  const wagers = [25, 35].map((amountWolo, index) => ({
    id: 300 + index,
    marketId: 42,
    userId: 7,
    stakeIntentId: null,
    stakeLegId: 900 + index,
    side: index === 0 ? "left" : "right",
    amountWolo,
    payoutWolo: null,
    status: "active",
    executionMode: "onchain_escrow",
    stakeTxHash: null,
    stakeLockedAt: at(`2026-08-01T00:3${index}:00.000Z`),
    payoutTxHash: null,
    createdAt: at(`2026-08-01T00:3${index}:00.000Z`),
    updatedAt: at(`2026-08-01T00:3${index}:00.000Z`),
    settledAt: null,
    user: { uid: "opaque-internal-uid", inGameName: null, steamPersonaName: null },
    stakeIntent: null,
    stakeLeg: {
      id: 900 + index,
      ticket: {
        id: 800,
        status: "recorded",
        stakeTxHash: "SHARED_TICKET_TX",
        recordedAt: at("2026-08-01T00:30:00.000Z"),
        chainTimestamp: at("2026-08-01T00:29:00.000Z"),
      },
    },
  }));
  const page = await loadBetLifecycleActivityPage(
    fakePrisma({ wagers, intents: [], bonuses: [], claims: [] }) as never,
    { limit: 10 },
  );
  const escrow = page.groups[0].events.find((event) => event.kind === "escrow_funded");

  assert.equal(page.groups[0].stakeTotalWolo, 60);
  assert.equal(escrow?.eventCount, 2);
  assert.deepEqual(escrow?.actors, ["Verified player"]);
  assert.doesNotMatch(JSON.stringify(page), /opaque-internal-uid/);
});

test("market-level pagination cannot be monopolized by one hot market", async () => {
  const marketIds = [51, 52, 53];
  const markets = marketIds.map((id, index) => ({
    id,
    slug: `battle-${id}`,
    title: `Battle ${id}`,
    leftLabel: "Left",
    rightLabel: "Right",
    status: "settled",
    winnerSide: "left",
    resolutionReason: null,
    settledAt: at(`2026-08-0${3 - index}T03:00:00.000Z`),
    voidedAt: null,
    updatedAt: at(`2026-08-0${3 - index}T03:00:00.000Z`),
  }));
  const claims = marketIds.map((sourceMarketId, index) => ({
    id: 500 + index,
    sourceMarketId,
    displayPlayerName: "Winner",
    amountWolo: 10,
    claimKind: "bet_payout",
    status: "claimed",
    claimedByUserId: 7,
    payoutTxHash: `TX_${sourceMarketId}`,
    errorState: null,
    createdAt: markets[index].settledAt,
    updatedAt: markets[index].settledAt,
    claimedAt: markets[index].settledAt,
    rescindedAt: null,
  }));
  const prisma = {
    $queryRaw: async () => markets.map((market) => ({
      marketId: market.id,
      occurredAt: market.updatedAt,
    })),
    betMarket: { findMany: async () => markets },
    betWager: { findMany: async () => [] },
    betStakeIntent: { findMany: async () => [] },
    betMarketFounderBonus: { findMany: async () => [] },
    pendingWoloClaim: { findMany: async () => claims },
  };

  const page = await loadBetLifecycleActivityPage(prisma as never, { limit: 2 });
  assert.deepEqual(page.groups.map((group) => group.marketId), [51, 52]);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextBefore, "2026-08-02T03:00:00.000Z");
});

test("candidate selection is distinct-market, cursor-safe, and name fallback is unlinked-only", () => {
  const source = readFileSync(
    new URL("../lib/betLifecycleActivity.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /GROUP BY market_id/);
  assert.match(source, /HAVING TRUE[\s\S]*MAX\(occurred_at\) < /);
  assert.match(source, /claimed_by_user_id IS NULL[\s\S]*normalized_player_name IN/);
  assert.doesNotMatch(source, /economicKey:\s*payoutEconomicKey/);
});
