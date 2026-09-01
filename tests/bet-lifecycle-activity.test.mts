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

test("database adapter builds one complete typed battle history without inferring from copy", async () => {
  const page = await loadBetLifecycleActivityPage(fakePrisma() as never, {
    limit: 10,
    minimumAt: at("2026-07-01T00:00:00.000Z"),
  });

  assert.equal(page.groups.length, 1);

  const group = page.groups[0];

  assert.equal(group.rootMarketId, 42);
  assert.equal(group.title, "Localized title without parsing markers");
  assert.equal(group.coreStakeWolo, 25);
  assert.equal(group.rewardWolo, 50);
  assert.equal(group.corePayoutWolo, 60);

  assert.deepEqual(
    group.timeline.map((row) => row.kind),
    [
      "stake_recorded",
      "founder_participants",
      "result",
      "payout",
    ],
  );

  assert.equal(
    group.timeline[0].detail,
    "left side · app-side wager record",
  );

  assert.equal(
    group.timeline[0].kind,
    "stake_recorded",
  );

  assert.equal(
    group.timeline[3].payoutDestination,
    "awaiting_wallet_link",
  );

  assert.match(
    page.nextBefore || "",
    /^bh2\.-1\.\d+\.42$/,
  );
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
    fakePrisma({
      wagers: [],
      intents: [],
      bonuses: [],
      claims,
    }) as never,
    { limit: 10 },
  );

  const payouts =
    page.groups[0].timeline.filter(
      (event) =>
        event.kind === "payout",
    );

  assert.equal(
    page.groups[0].corePayoutWolo,
    30,
  );

  assert.equal(
    payouts.length,
    2,
  );

  assert.deepEqual(
    payouts.map(
      (event) =>
        event.payoutDestination,
    ),
    ["wallet", "wallet"],
  );

  assert.deepEqual(
    payouts.map(
      (event) =>
        event.txHash,
    ),
    [
      "SAME_BATCH_TX",
      "SAME_BATCH_TX",
    ],
  );
});

test("a pending or failed claim hash is a breadcrumb, not wallet finality", async () => {
  const internalFailure =
    "duplicate tx guard: signer sequence 19 already consumed";

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

  const page =
    await loadBetLifecycleActivityPage(
      fakePrisma({
        wagers: [],
        intents: [],
        bonuses: [],
        claims: [claim],
      }) as never,
      { limit: 10 },
    );

  const payout =
    page.groups[0].timeline.find(
      (event) =>
        event.kind === "payout",
    );

  assert.equal(
    payout?.payoutDestination,
    "failed",
  );

  assert.equal(
    payout?.detail,
    "Payout needs operator reconciliation",
  );

  assert.doesNotMatch(
    JSON.stringify(page),
    /signer sequence|duplicate tx guard/i,
  );
});

test("a recorded ticket proves each funded leg without collapsing its shared tx", async () => {
  const wagers = [25, 35].map(
    (amountWolo, index) => ({
      id: 300 + index,
      marketId: 42,
      userId: 7,
      stakeIntentId: null,
      stakeLegId: 900 + index,
      side:
        index === 0
          ? "left"
          : "right",
      amountWolo,
      payoutWolo: null,
      status: "active",
      executionMode:
        "onchain_escrow",
      stakeTxHash: null,
      stakeLockedAt: at(
        `2026-08-01T00:3${index}:00.000Z`,
      ),
      payoutTxHash: null,
      createdAt: at(
        `2026-08-01T00:3${index}:00.000Z`,
      ),
      updatedAt: at(
        `2026-08-01T00:3${index}:00.000Z`,
      ),
      settledAt: null,
      user: {
        uid: "opaque-internal-uid",
        inGameName: null,
        steamPersonaName: null,
      },
      stakeIntent: null,
      stakeLeg: {
        id: 900 + index,
        ticket: {
          id: 800,
          status: "recorded",
          stakeTxHash:
            "SHARED_TICKET_TX",
          recordedAt: at(
            "2026-08-01T00:30:00.000Z",
          ),
          chainTimestamp: at(
            "2026-08-01T00:29:00.000Z",
          ),
        },
      },
    }),
  );

  const page =
    await loadBetLifecycleActivityPage(
      fakePrisma({
        wagers,
        intents: [],
        bonuses: [],
        claims: [],
      }) as never,
      { limit: 10 },
    );

  const group = page.groups[0];

  assert.equal(
    group.coreStakeWolo,
    60,
  );

  assert.equal(
    group.slips.length,
    1,
  );

  assert.equal(
    group.slips[0].ticketId,
    800,
  );

  assert.equal(
    group.slips[0].totalStakeWolo,
    60,
  );

  assert.equal(
    group.slips[0].txHash,
    "SHARED_TICKET_TX",
  );

  assert.equal(
    group.slips[0].legs.length,
    2,
  );

  assert.doesNotMatch(
    JSON.stringify(page),
    /opaque-internal-uid/,
  );
});

test("battle-level pagination cannot be monopolized by one hot market or late payout", async () => {
  const marketIds = [51, 52, 53];

  const markets =
    marketIds.map(
      (id, index) => ({
        id,
        slug: `battle-${id}`,
        title: `Battle ${id}`,
        leftLabel: "Left",
        rightLabel: "Right",
        marketType: "winner",
        parentMarketId: null,
        battleId: null,
        status: "settled",
        winnerSide: "left",
        resolutionReason: null,
        createdAt: at(
          `2026-08-0${3 - index}T02:00:00.000Z`,
        ),
        settledAt: at(
          `2026-08-0${3 - index}T03:00:00.000Z`,
        ),
        voidedAt: null,
        updatedAt: at(
          `2026-08-0${3 - index}T03:00:00.000Z`,
        ),
        battle: null,
        battleIdentity: null,
      }),
    );

  const claims =
    marketIds.map(
      (sourceMarketId, index) => ({
        id: 500 + index,
        sourceMarketId,
        displayPlayerName: "Winner",
        amountWolo: 10,
        claimKind: "bet_payout",
        status: "claimed",
        claimedByUserId: 7,
        payoutTxHash:
          `TX_${sourceMarketId}`,
        errorState: null,
        createdAt:
          markets[index].settledAt,
        updatedAt:
          markets[index].settledAt,
        claimedAt:
          markets[index].settledAt,
        rescindedAt: null,
      }),
    );

  const candidateRows =
    markets.map((market) => ({
      groupKey:
        `market:${market.id}`,
      rootMarketId: market.id,
      marketId: market.id,
      battleId: null,
      publicNumber: null,
      startedAt: market.createdAt,
      latestActivityAt:
        market.updatedAt,
      occurredAt:
        market.updatedAt,
      marketIds: [market.id],
    }));

  const prisma = {
    $queryRaw: async () =>
      candidateRows,

    betMarket: {
      findMany: async () =>
        markets,
    },

    betWager: {
      findMany: async () =>
        [],
    },

    betStakeIntent: {
      findMany: async () =>
        [],
    },

    betMarketFounderBonus: {
      findMany: async () =>
        [],
    },

    pendingWoloClaim: {
      findMany: async () =>
        claims,
    },
  };

  const page =
    await loadBetLifecycleActivityPage(
      prisma as never,
      { limit: 2 },
    );

  assert.deepEqual(
    page.groups.map(
      (group) =>
        group.rootMarketId,
    ),
    [51, 52],
  );

  assert.equal(
    page.hasMore,
    true,
  );

  assert.match(
    page.nextBefore || "",
    /^bh2\.-1\.\d+\.52$/,
  );
});

test("candidate selection is battle-grain, cursor-safe, and name fallback is unlinked-only", () => {
  const source = readFileSync(
    new URL(
      "../lib/betLifecycleActivity.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /eligible_groups AS/,
  );

  assert.match(
    source,
    /expanded_markets AS/,
  );

  assert.match(
    source,
    /bm\.battle_id = eligible\.battle_id/,
  );

  assert.match(
    source,
    /COALESCE\(bm\.parent_market_id, bm\.id\)/,
  );

  assert.match(
    source,
    /const BATTLE_CURSOR_PREFIX = "bh2"/,
  );

  assert.match(
    source,
    /encodeBattleCursor/,
  );

  assert.match(
    source,
    /claimed_by_user_id IS NULL[\s\S]*normalized_player_name IN/,
  );

  assert.doesNotMatch(
    source,
    /projectBetLifecycleGroups/,
  );

  assert.doesNotMatch(
    source,
    /economicKey:\s*payoutEconomicKey/,
  );
});
