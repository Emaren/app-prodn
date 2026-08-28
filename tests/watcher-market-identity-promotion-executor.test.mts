import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWatcherMarketSlugForSessionKey,
  reconcileWatcherMarketIdentityPromotions,
  type MarketSeed,
} from "../lib/bets.ts";
import {
  canonicalBattleIdentityKey,
} from "../lib/battleIdentity.ts";
import {
  buildDesyncSideMarketSlug,
  DESYNC_SIDE_MARKET_TYPE,
  WINNER_MARKET_TYPE,
} from "../lib/desyncSideMarket.ts";

const HASH = "a".repeat(64);
const PLATFORM_SESSION = "platform:battle-42";
const LEGACY_SESSION = "legacy:mp-replay:watcher:jims:battle:91";
const CANONICAL_WINNER_SLUG =
  buildWatcherMarketSlugForSessionKey(PLATFORM_SESSION);
const CANONICAL_DESYNC_SLUG =
  buildDesyncSideMarketSlug(CANONICAL_WINNER_SLUG);
const LEGACY_WINNER_SLUG =
  buildWatcherMarketSlugForSessionKey(LEGACY_SESSION);
const LEGACY_DESYNC_SLUG =
  buildDesyncSideMarketSlug(LEGACY_WINNER_SLUG);

function seed(): MarketSeed {
  return {
    scheduledMatchId: null,
    linkedSessionKey: PLATFORM_SESSION,
    identityAliases: [LEGACY_SESSION],
    linkedGameStatsId: null,
    slug: CANONICAL_WINNER_SLUG,
    title: "Jim vs Zodiac",
    eventLabel: "Watcher Live · Arabia",
    marketType: WINNER_MARKET_TYPE,
    status: "live",
    featured: true,
    sortOrder: -300,
    source: "session",
    leftLabel: "Jim",
    rightLabel: "Zodiac",
    leftHref: null,
    rightHref: null,
    seedLeftWolo: 25_000,
    seedRightWolo: 25_000,
    closeAt: null,
    proofDeadlineAt: null,
    resolutionReason: null,
    settledAt: null,
    winnerSide: null,
    teamFormat: "1v1",
    teamResolutionStatus: "resolved",
    teamResolutionProvenance: "explicit",
    teamConfidence: "high",
    leftRosterSnapshot: [],
    rightRosterSnapshot: [],
    sourceParseIteration: 12,
    sourceRosterHash: "b".repeat(64),
    propositionHash: HASH,
    integrityStatus: "verified",
    integrityReason: null,
  };
}

type HarnessMarket = {
  id: number;
  battleId: number | null;
  parentMarketId: number | null;
  scheduledMatchId: number | null;
  linkedSessionKey: string;
  slug: string;
  title: string;
  eventLabel: string;
  marketType: string;
  status: string;
  sortOrder: number;
  resolutionReason: string | null;
  leftLabel: string;
  rightLabel: string;
  leftHref: string | null;
  rightHref: string | null;
  seedLeftWolo: number;
  seedRightWolo: number;
  propositionHash: string;
  createdAt: Date;
  firstStakeAcceptedAt: Date | null;
  rosterLockedAt: Date | null;
  bettingLockedAt: Date | null;
  voidedAt: Date | null;
  refundStatus: string | null;
  settlementRunId: string | null;
  settlementStatus: string | null;
  settlementAttemptedAt: Date | null;
  settlementExecutedAt: Date | null;
  featured?: boolean;
  closeAt?: Date | null;
  proofDeadlineAt?: Date | null;
  settledAt?: Date | null;
  winnerSide?: string | null;
  integrityStatus?: string;
  integrityReason?: string | null;
  commissionerReviewState?: string | null;
  underReviewAt?: Date | null;
};

function market(
  id: number,
  input: Partial<HarnessMarket> &
    Pick<HarnessMarket, "linkedSessionKey" | "slug" | "marketType">
): HarnessMarket {
  return {
    id,
    battleId: null,
    parentMarketId: null,
    scheduledMatchId: null,
    linkedSessionKey: input.linkedSessionKey,
    slug: input.slug,
    title: "Jim vs Zodiac",
    eventLabel: "Watcher Live · Arabia",
    marketType: input.marketType,
    status: "live",
    sortOrder: id,
    resolutionReason: null,
    leftLabel: input.marketType === DESYNC_SIDE_MARKET_TYPE ? "No" : "Jim",
    rightLabel: input.marketType === DESYNC_SIDE_MARKET_TYPE ? "Yes" : "Zodiac",
    leftHref: null,
    rightHref: null,
    seedLeftWolo: input.marketType === DESYNC_SIDE_MARKET_TYPE ? 0 : 25_000,
    seedRightWolo: input.marketType === DESYNC_SIDE_MARKET_TYPE ? 0 : 25_000,
    propositionHash: HASH,
    createdAt: new Date(`2026-08-26T12:00:${String(id).padStart(2, "0")}.000Z`),
    firstStakeAcceptedAt: null,
    rosterLockedAt: null,
    bettingLockedAt: null,
    voidedAt: null,
    refundStatus: null,
    settlementRunId: null,
    settlementStatus: null,
    settlementAttemptedAt: null,
    settlementExecutedAt: null,
    ...input,
  };
}

function createPromotionHarness(input?: { oppositeWinnerSides?: boolean }) {
  const markets = [
    market(10, {
      battleId: 101,
      linkedSessionKey: PLATFORM_SESSION,
      slug: CANONICAL_WINNER_SLUG,
      marketType: WINNER_MARKET_TYPE,
    }),
    market(11, {
      battleId: 101,
      parentMarketId: 10,
      linkedSessionKey: PLATFORM_SESSION,
      slug: CANONICAL_DESYNC_SLUG,
      marketType: DESYNC_SIDE_MARKET_TYPE,
    }),
    market(20, {
      battleId: 100,
      firstStakeAcceptedAt: new Date("2026-08-26T12:00:20.000Z"),
      rosterLockedAt: new Date("2026-08-26T12:00:20.000Z"),
      bettingLockedAt: new Date("2026-08-26T12:00:20.000Z"),
      linkedSessionKey: LEGACY_SESSION,
      slug: LEGACY_WINNER_SLUG,
      marketType: WINNER_MARKET_TYPE,
    }),
    market(21, {
      battleId: 100,
      parentMarketId: 20,
      linkedSessionKey: LEGACY_SESSION,
      slug: LEGACY_DESYNC_SLUG,
      marketType: DESYNC_SIDE_MARKET_TYPE,
    }),
  ];
  const wallets = [
    { id: 201, marketId: 20, walletAddress: "wolo1jim", side: "left" },
  ];
  const wagers = [
    { id: 301, marketId: 20, userId: 7, side: "left" },
    ...(input?.oppositeWinnerSides
      ? [{ id: 303, marketId: 10, userId: 7, side: "right" }]
      : []),
    { id: 302, marketId: 21, userId: 8, side: "right" },
  ];
  const intents = [
    {
      id: 401,
      marketId: 20,
      userId: 7,
      status: "recorded",
      propositionHash: HASH,
      side: "left",
    },
  ];
  const tickets = [
    { id: 90, userId: 7, propositionSetHash: "stale" },
  ];
  const legs = [
    {
      id: 501,
      ticketId: 90,
      marketId: 20,
      legRole: "winner",
      side: "left",
      amountWolo: 25,
      propositionHash: HASH,
    },
    {
      id: 502,
      ticketId: 90,
      marketId: 21,
      legRole: "desync",
      side: "right",
      amountWolo: 5,
      propositionHash: HASH,
    },
  ];
  const bonuses = [{ id: 601, marketId: 20 }];
  const claims = [
    {
      id: 701,
      sourceMarketId: 20,
      normalizedPlayerName: "jim",
      claimKind: "winner_bounty",
      claimGroupKey: "market",
    },
  ];
  const executions = [
    {
      id: 801,
      presetId: 44,
      winnerMarketId: 20,
      desyncMarketId: 21,
      sessionKey: LEGACY_SESSION,
      gameIdentityKey: LEGACY_SESSION,
      propositionHash: HASH,
    },
  ];
  const identities = [
    {
      id: 100,
      identityKey: canonicalBattleIdentityKey(LEGACY_SESSION)!,
      publicNumber: 2820,
      platformMatchId: null as string | null,
      state: "live",
      completedAt: null as Date | null,
      lastSeenAt: new Date("2026-08-26T12:00:00.000Z"),
    },
    {
      id: 101,
      identityKey: canonicalBattleIdentityKey(PLATFORM_SESSION)!,
      publicNumber: 2821,
      platformMatchId: null as string | null,
      state: "live",
      completedAt: null as Date | null,
      lastSeenAt: new Date("2026-08-26T12:00:01.000Z"),
    },
  ];
  const incidents = new Map<string, Record<string, unknown>>();
  let marketCreateCount = 0;
  let queryLockRound = 0;

  const marketRelations = (row: HarnessMarket) => ({
    ...row,
    walletLocks: wallets
      .filter((wallet) => wallet.marketId === row.id)
      .map(({ id, walletAddress, side }) => ({ id, walletAddress, side })),
    wagers: wagers
      .filter((wager) => wager.marketId === row.id)
      .map(({ id, userId, side }) => ({ id, userId, side })),
    stakeIntents: intents
      .filter((intent) => intent.marketId === row.id)
      .map(({ id, userId, status, propositionHash, side }) => ({
        id,
        userId,
        status,
        propositionHash,
        side,
      })),
    stakeTicketLegs: legs
      .filter((leg) => leg.marketId === row.id)
      .map((leg) => ({
        id: leg.id,
        ticketId: leg.ticketId,
        ticket: {
          userId: tickets.find((ticket) => ticket.id === leg.ticketId)!.userId,
        },
        propositionHash: leg.propositionHash,
        side: leg.side,
      })),
    founderBonuses: bonuses
      .filter((bonus) => bonus.marketId === row.id)
      .map(({ id }) => ({ id })),
    integrityIncidents: [...incidents.values()]
      .filter((incident) => incident.marketId === row.id && incident.status === "open")
      .map((incident) => ({ id: incident.id })),
  });

  function updateManyRows<T extends { marketId: number; side?: string }>(
    rows: T[],
    where: { marketId: number; side?: string },
    data: Partial<T>
  ) {
    let count = 0;
    for (const row of rows) {
      if (row.marketId !== where.marketId) continue;
      if (where.side && row.side !== where.side) continue;
      Object.assign(row, data);
      count += 1;
    }
    return { count };
  }

  type NumericIn = { in: number[] };
  type StringIn = { in: string[] };

  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async () => {
      queryLockRound += 1;
      return queryLockRound % 2 === 1
        ? markets.map(({ id }) => ({ id }))
        : identities.map(({ id }) => ({ id }));
    },
    betMarket: {
      findMany: async (args: {
        where?: { battleId?: NumericIn; id?: NumericIn };
        select?: Record<string, boolean>;
      }) => {
        if (args.where?.battleId) {
          const ids = new Set(args.where.battleId.in as number[]);
          return markets
            .filter((row) => row.battleId && ids.has(row.battleId))
            .map(({ id, linkedSessionKey }) => ({ id, linkedSessionKey }));
        }
        if (args.select && Object.keys(args.select).length === 1 && args.select.id) {
          return markets.map(({ id }) => ({ id }));
        }
        const ids = new Set((args.where?.id?.in ?? []) as number[]);
        return markets.filter((row) => ids.has(row.id)).map(marketRelations);
      },
      update: async ({ where, data }: { where: { id: number }; data: Partial<HarnessMarket> }) => {
        const row = markets.find((candidate) => candidate.id === where.id);
        assert.ok(row, `market #${where.id} exists`);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: {
        where: { id?: NumericIn; battleId?: NumericIn; status?: StringIn };
        data: Partial<HarnessMarket>;
      }) => {
        let rows = markets;
        if (where.id?.in) {
          const ids = new Set(where.id.in as number[]);
          rows = rows.filter((row) => ids.has(row.id));
        }
        if (where.battleId?.in) {
          const ids = new Set(where.battleId.in as number[]);
          rows = rows.filter((row) => row.battleId && ids.has(row.battleId));
        }
        if (where.status?.in) {
          const statuses = new Set(where.status.in as string[]);
          rows = rows.filter((row) => statuses.has(row.status));
        }
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      create: async () => {
        marketCreateCount += 1;
        throw new Error("an existing canonical pair must not create another market");
      },
    },
    pendingWoloClaim: {
      findMany: async () => claims.map((claim) => ({ ...claim })),
      updateMany: async ({ where, data }: {
        where: { sourceMarketId: number };
        data: Partial<(typeof claims)[number]>;
      }) => {
        let count = 0;
        for (const claim of claims) {
          if (claim.sourceMarketId !== where.sourceMarketId) continue;
          Object.assign(claim, data);
          count += 1;
        }
        return { count };
      },
      count: async ({ where }: { where: { sourceMarketId: NumericIn } }) => {
        const ids = new Set(where.sourceMarketId.in as number[]);
        return claims.filter((claim) => ids.has(claim.sourceMarketId)).length;
      },
    },
    betAutoExecution: {
      findMany: async () => executions.map((execution) => ({ ...execution })),
      update: async ({ where, data }: {
        where: { id: number };
        data: Partial<(typeof executions)[number]>;
      }) => {
        const row = executions.find((execution) => execution.id === where.id);
        assert.ok(row);
        Object.assign(row, data);
        return row;
      },
      count: async ({ where }: {
        where: { winnerMarketId?: NumericIn; desyncMarketId?: NumericIn };
      }) => {
        if (where.winnerMarketId) {
          const ids = new Set(where.winnerMarketId.in as number[]);
          return executions.filter((execution) => ids.has(execution.winnerMarketId)).length;
        }
        const ids = new Set(where.desyncMarketId.in as number[]);
        return executions.filter(
          (execution) => execution.desyncMarketId && ids.has(execution.desyncMarketId)
        ).length;
      },
    },
    battleIdentity: {
      findMany: async () =>
        [...identities].sort(
          (left, right) => left.publicNumber - right.publicNumber || left.id - right.id
        ),
      update: async ({ where, data }: {
        where: { id: number };
        data: Partial<(typeof identities)[number]>;
      }) => {
        const row = identities.find((identity) => identity.id === where.id);
        assert.ok(row);
        Object.assign(row, data);
        return row;
      },
    },
    betMarketWallet: {
      deleteMany: async ({ where }: {
        where: { id: NumericIn; marketId: number };
      }) => {
        const ids = new Set(where.id.in as number[]);
        let count = 0;
        for (let index = wallets.length - 1; index >= 0; index -= 1) {
          if (ids.has(wallets[index].id) && wallets[index].marketId === where.marketId) {
            wallets.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
      update: async ({ where, data }: {
        where: { id: number };
        data: Partial<(typeof wallets)[number]>;
      }) => {
        const row = wallets.find((wallet) => wallet.id === where.id);
        assert.ok(row);
        Object.assign(row, data);
        return row;
      },
      count: async ({ where }: { where: { marketId: NumericIn } }) => {
        const ids = new Set(where.marketId.in as number[]);
        return wallets.filter((wallet) => ids.has(wallet.marketId)).length;
      },
    },
    betWager: {
      updateMany: async ({ where, data }: {
        where: { marketId: number; side?: string };
        data: Partial<(typeof wagers)[number]>;
      }) =>
        updateManyRows(wagers, where, data),
      count: async ({ where }: { where: { marketId: NumericIn } }) => {
        const ids = new Set(where.marketId.in as number[]);
        return wagers.filter((wager) => ids.has(wager.marketId)).length;
      },
    },
    betStakeIntent: {
      updateMany: async ({ where, data }: {
        where: { marketId: number; side?: string };
        data: Partial<(typeof intents)[number]>;
      }) =>
        updateManyRows(intents, where, data),
      count: async ({ where }: { where: { marketId: NumericIn } }) => {
        const ids = new Set(where.marketId.in as number[]);
        return intents.filter((intent) => ids.has(intent.marketId)).length;
      },
    },
    betStakeLeg: {
      update: async ({ where, data }: {
        where: { id: number };
        data: Partial<(typeof legs)[number]>;
      }) => {
        const row = legs.find((leg) => leg.id === where.id);
        assert.ok(row);
        Object.assign(row, data);
        return row;
      },
      count: async ({ where }: { where: { marketId: NumericIn } }) => {
        const ids = new Set(where.marketId.in as number[]);
        return legs.filter((leg) => ids.has(leg.marketId)).length;
      },
    },
    betMarketFounderBonus: {
      updateMany: async ({ where, data }: {
        where: { marketId: number };
        data: Partial<(typeof bonuses)[number]>;
      }) => {
        let count = 0;
        for (const bonus of bonuses) {
          if (bonus.marketId !== where.marketId) continue;
          Object.assign(bonus, data);
          count += 1;
        }
        return { count };
      },
      count: async ({ where }: { where: { marketId: NumericIn } }) => {
        const ids = new Set(where.marketId.in as number[]);
        return bonuses.filter((bonus) => ids.has(bonus.marketId)).length;
      },
    },
    betStakeTicket: {
      findMany: async ({ where }: { where: { id: NumericIn } }) => {
        const ids = new Set(where.id.in as number[]);
        return tickets
          .filter((ticket) => ids.has(ticket.id))
          .map((ticket) => ({
            id: ticket.id,
            legs: legs
              .filter((leg) => leg.ticketId === ticket.id)
              .map(({ marketId, legRole, side, amountWolo, propositionHash }) => ({
                marketId,
                legRole,
                side,
                amountWolo,
                propositionHash,
              })),
          }));
      },
      update: async ({ where, data }: {
        where: { id: number };
        data: Partial<(typeof tickets)[number]>;
      }) => {
        const row = tickets.find((ticket) => ticket.id === where.id);
        assert.ok(row);
        Object.assign(row, data);
        return row;
      },
    },
    betMarketIntegrityIncident: {
      upsert: async ({ where, create, update }: {
        where: { incidentKey: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = incidents.get(where.incidentKey);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: incidents.size + 1, ...create };
        incidents.set(where.incidentKey, row);
        return row;
      },
    },
  };

  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  };

  return {
    prisma,
    markets,
    wallets,
    wagers,
    intents,
    tickets,
    legs,
    bonuses,
    claims,
    executions,
    identities,
    incidents,
    get marketCreateCount() {
      return marketCreateCount;
    },
  };
}

test("stateful promotion moves the complete financial family, preserves number, and reruns idempotently", async () => {
  const harness = createPromotionHarness();
  const blocked = await reconcileWatcherMarketIdentityPromotions(
    harness.prisma as never,
    [seed()]
  );
  assert.deepEqual([...blocked], []);

  assert.deepEqual(
    harness.wagers.map(({ id, marketId, side }) => ({ id, marketId, side })),
    [
      { id: 301, marketId: 10, side: "left" },
      { id: 302, marketId: 11, side: "right" },
    ]
  );
  assert.equal(harness.wallets[0].marketId, 10);
  assert.equal(harness.intents[0].marketId, 10);
  assert.deepEqual(harness.legs.map((leg) => leg.marketId), [10, 11]);
  assert.equal(harness.bonuses[0].marketId, 10);
  assert.equal(harness.claims[0].sourceMarketId, 10);
  assert.deepEqual(
    {
      winnerMarketId: harness.executions[0].winnerMarketId,
      desyncMarketId: harness.executions[0].desyncMarketId,
      sessionKey: harness.executions[0].sessionKey,
      gameIdentityKey: harness.executions[0].gameIdentityKey,
    },
    {
      winnerMarketId: 10,
      desyncMarketId: 11,
      sessionKey: PLATFORM_SESSION,
      gameIdentityKey: PLATFORM_SESSION,
    }
  );
  assert.match(harness.tickets[0].propositionSetHash, /^[a-f0-9]{64}$/);
  assert.notEqual(harness.tickets[0].propositionSetHash, "stale");

  const canonicalWinner = harness.markets.find((row) => row.id === 10)!;
  const canonicalDesync = harness.markets.find((row) => row.id === 11)!;
  const legacyWinner = harness.markets.find((row) => row.id === 20)!;
  const legacyDesync = harness.markets.find((row) => row.id === 21)!;
  assert.equal(canonicalWinner.linkedSessionKey, PLATFORM_SESSION);
  assert.equal(canonicalWinner.slug, CANONICAL_WINNER_SLUG);
  assert.equal(canonicalWinner.firstStakeAcceptedAt?.toISOString(), "2026-08-26T12:00:20.000Z");
  assert.equal(canonicalDesync.parentMarketId, 10);
  for (const tombstone of [legacyWinner, legacyDesync]) {
    assert.equal(tombstone.status, "voided");
    assert.equal(tombstone.resolutionReason, "merged_into_platform_market");
    assert.equal(tombstone.parentMarketId, null);
  }

  const survivor = harness.identities.find((identity) => identity.id === 100)!;
  const retired = harness.identities.find((identity) => identity.id === 101)!;
  assert.equal(survivor.publicNumber, 2820);
  assert.equal(survivor.platformMatchId, "battle-42");
  assert.equal(retired.platformMatchId, null);
  assert.equal(retired.state, "completed");
  assert.ok(harness.markets.every((row) => row.battleId === survivor.id));
  assert.equal(harness.marketCreateCount, 0);

  const firstHash = harness.tickets[0].propositionSetHash;
  const secondBlocked = await reconcileWatcherMarketIdentityPromotions(
    harness.prisma as never,
    [seed()]
  );
  assert.deepEqual([...secondBlocked], []);
  assert.equal(harness.tickets[0].propositionSetHash, firstHash);
  assert.equal(harness.marketCreateCount, 0);
  assert.equal(harness.markets.length, 4);
});

test("stateful ambiguity pauses the exact family and writes idempotent incidents without moving money", async () => {
  const harness = createPromotionHarness({ oppositeWinnerSides: true });
  const originalWagerMarkets = harness.wagers.map((wager) => wager.marketId);

  const blocked = await reconcileWatcherMarketIdentityPromotions(
    harness.prisma as never,
    [seed()]
  );
  assert.deepEqual([...blocked], [PLATFORM_SESSION]);
  assert.deepEqual(harness.wagers.map((wager) => wager.marketId), originalWagerMarkets);
  assert.ok(harness.markets.every((row) => row.status === "under_review"));
  assert.ok(
    harness.markets.every(
      (row) => row.integrityReason === "watcher_identity_promotion_ambiguous"
    )
  );
  assert.equal(harness.incidents.size, 4);

  const rerun = await reconcileWatcherMarketIdentityPromotions(
    harness.prisma as never,
    [seed()]
  );
  assert.deepEqual([...rerun], [PLATFORM_SESSION]);
  assert.equal(harness.incidents.size, 4);
  assert.deepEqual(harness.wagers.map((wager) => wager.marketId), originalWagerMarkets);
});
