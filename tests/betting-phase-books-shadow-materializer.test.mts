import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BET_PHASE_BOOKS_V2_SHADOW_MARKET_TYPE,
  BET_PHASE_BOOKS_V2_SHADOW_STATUS,
  materializeBetPhaseBookShadows,
  planBetPhaseBookShadowMaterialization,
  type BetPhaseBookShadowSource,
} from "../lib/betPhaseBookShadowMaterializer.ts";

const START = new Date("2026-09-29T21:00:00.000Z");
const OPENING_CLOSE = new Date(START.getTime() + 60_000);
const TERMINAL = new Date("2026-09-29T21:42:00.000Z");
const CHALLENGE_CUTOFF = new Date("2026-09-30T01:00:00.000Z");

function source(
  overrides: Partial<BetPhaseBookShadowSource> = {}
): BetPhaseBookShadowSource {
  return {
    battleId: 91,
    battlePublicNumber: 2820,
    scheduledMatchId: null,
    linkedSessionKey: "platform:abc123",
    linkedGameStatsId: null,
    battleStartedAt: START,
    slug: "watcher-live-platform-abc123",
    title: "Jim vs Zodiac",
    eventLabel: "Watcher Live · Arabia",
    marketType: "winner",
    status: "live",
    leftLabel: "Jim",
    rightLabel: "Zodiac",
    leftHref: null,
    rightHref: null,
    closeAt: null,
    settledAt: null,
    teamFormat: "1v1",
    teamResolutionStatus: "resolved",
    teamResolutionProvenance: "watcher",
    teamConfidence: "high",
    leftRosterSnapshot: [{ name: "Jim", steamId: "1" }],
    rightRosterSnapshot: [{ name: "Zodiac", steamId: "2" }],
    sourceParseIteration: 10,
    sourceRosterHash: "roster-hash",
    propositionHash: "proposition-hash",
    integrityStatus: "verified",
    integrityReason: null,
    ...overrides,
  };
}

test("scheduled Challenge materializes Pre-Game identity without fabricating open time", () => {
  const plans = planBetPhaseBookShadowMaterialization([
    source({
      battleId: null,
      scheduledMatchId: 42,
      linkedSessionKey: null,
      battleStartedAt: null,
      closeAt: CHALLENGE_CUTOFF,
      propositionHash: null,
    }),
  ]);

  assert.equal(plans.length, 1);
  const pre = plans[0]!;
  assert.equal(pre.phase, "pre_game");
  assert.equal(pre.authorityIdentityKey, "scheduled-match:42");
  assert.equal(pre.phaseOpensAt, null);
  assert.equal(pre.phaseClosesAt?.toISOString(), CHALLENGE_CUTOFF.toISOString());
  assert.match(pre.phaseBookKey, /^phase-v2:pre_game:[0-9a-f]{48}$/);
});

test("Watcher battle start materializes exact Opening Minute and Late windows", () => {
  const plans = planBetPhaseBookShadowMaterialization([source()]);

  assert.deepEqual(
    plans.map((plan) => ({
      phase: plan.phase,
      authorityIdentityKey: plan.authorityIdentityKey,
      opensAt: plan.phaseOpensAt?.toISOString() ?? null,
      closesAt: plan.phaseClosesAt?.toISOString() ?? null,
    })),
    [
      {
        phase: "opening_minute",
        authorityIdentityKey: "battle-number:2820",
        opensAt: START.toISOString(),
        closesAt: OPENING_CLOSE.toISOString(),
      },
      {
        phase: "late",
        authorityIdentityKey: "battle-number:2820",
        opensAt: OPENING_CLOSE.toISOString(),
        closesAt: null,
      },
    ]
  );
});

test("scheduled live Challenge owns Pre-Game plus battle-authority live phases", () => {
  const plans = planBetPhaseBookShadowMaterialization([
    source({
      scheduledMatchId: 42,
      closeAt: CHALLENGE_CUTOFF,
    }),
  ]);

  assert.deepEqual(
    plans.map((plan) => [plan.phase, plan.authorityIdentityKey]),
    [
      ["pre_game", "scheduled-match:42"],
      ["opening_minute", "battle:91"],
      ["late", "battle:91"],
    ]
  );
  assert.equal(
    new Set(plans.map((plan) => plan.phaseBookKey)).size,
    3
  );
});

test("settled battle closes the Late shadow book at trusted terminal time", () => {
  const plans = planBetPhaseBookShadowMaterialization([
    source({
      status: "settled",
      settledAt: TERMINAL,
    }),
  ]);
  const late = plans.find((plan) => plan.phase === "late");
  assert.ok(late);
  assert.equal(late.phaseClosesAt?.toISOString(), TERMINAL.toISOString());
});

test("live phases fail closed without verified proposition and battle authority", () => {
  assert.deepEqual(
    planBetPhaseBookShadowMaterialization([
      source({ battleId: null, battlePublicNumber: null }),
    ]),
    []
  );

  assert.deepEqual(
    planBetPhaseBookShadowMaterialization([
      source({ propositionHash: null }),
    ]),
    []
  );

  assert.deepEqual(
    planBetPhaseBookShadowMaterialization([
      source({ integrityStatus: "under_review" }),
    ]),
    []
  );
});

test("live phase identity survives mutable Battle row promotion", () => {
  const before = planBetPhaseBookShadowMaterialization([
    source({ battleId: 91, battlePublicNumber: 2820 }),
  ]);
  const after = planBetPhaseBookShadowMaterialization([
    source({
      battleId: 144,
      battlePublicNumber: 2820,
      linkedSessionKey: "platform:promoted",
    }),
  ]);

  assert.deepEqual(
    before.map((plan) => plan.phaseBookKey),
    after.map((plan) => plan.phaseBookKey)
  );
  assert.notEqual(before[0]?.source.battleId, after[0]?.source.battleId);
});

test("shadow planner deduplicates the same durable phase identity", () => {
  const plans = planBetPhaseBookShadowMaterialization([
    source(),
    source({ slug: "duplicate-display-slug" }),
  ]);

  assert.deepEqual(
    plans.map((plan) => plan.phase),
    ["opening_minute", "late"]
  );
});

function mockPrisma() {
  let nextId = 1;
  const rows = new Map<string, Record<string, unknown>>();
  const calls = {
    creates: 0,
    updates: 0,
    financial: 0,
  };

  const tx = {
    $executeRaw: async () => 1,
    betMarket: {
      findUnique: async (input: {
        where: { phaseBookKey?: string };
      }) => {
        const key = input.where.phaseBookKey || "";
        const row = rows.get(key);
        if (!row) return null;
        return {
          id: row.id,
          status: row.status,
          firstStakeAcceptedAt: row.firstStakeAcceptedAt ?? null,
          wagers: row.wagers ?? [],
          stakeTicketLegs: row.stakeTicketLegs ?? [],
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.creates += 1;
        const row = {
          id: nextId++,
          ...data,
          firstStakeAcceptedAt: null,
          wagers: [],
          stakeTicketLegs: [],
        };
        rows.set(String(data.phaseBookKey), row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: number };
        data: Record<string, unknown>;
      }) => {
        calls.updates += 1;
        const entry = [...rows.entries()].find(
          ([, row]) => row.id === where.id
        );
        if (!entry) throw new Error("row missing");
        const [key, old] = entry;
        const row = { ...old, ...data };
        rows.set(key, row);
        return row;
      },
    },
    betWager: {
      create: async () => {
        calls.financial += 1;
      },
    },
    betStakeTicket: {
      create: async () => {
        calls.financial += 1;
      },
    },
    betStakeIntent: {
      create: async () => {
        calls.financial += 1;
      },
    },
  };

  return {
    prisma: {
      $transaction: async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
    },
    rows,
    calls,
  };
}

test("shadow materializer creates isolated non-financial winner projections", async () => {
  const mock = mockPrisma();

  const result = await materializeBetPhaseBookShadows(
    mock.prisma as never,
    [source()],
    { BET_PHASE_BOOKS_V2_MODE: "shadow" }
  );

  assert.deepEqual(result, {
    mode: "shadow",
    plannedCount: 2,
    createdCount: 2,
    updatedCount: 0,
    protectedCount: 0,
  });
  assert.equal(mock.rows.size, 2);
  assert.equal(mock.calls.financial, 0);

  for (const row of mock.rows.values()) {
    assert.equal(row.status, BET_PHASE_BOOKS_V2_SHADOW_STATUS);
    assert.equal(row.marketType, BET_PHASE_BOOKS_V2_SHADOW_MARKET_TYPE);
    assert.equal(row.seedLeftWolo, 0);
    assert.equal(row.seedRightWolo, 0);
    assert.equal(row.featured, false);
    assert.equal(row.scheduledMatchId, null);
    assert.equal(row.resolutionReason, "phase_books_v2_shadow");
  }
});

test("shadow materializer is idempotent and may refresh only untouched shadow rows", async () => {
  const mock = mockPrisma();

  await materializeBetPhaseBookShadows(
    mock.prisma as never,
    [source()],
    { BET_PHASE_BOOKS_V2_MODE: "shadow" }
  );
  const again = await materializeBetPhaseBookShadows(
    mock.prisma as never,
    [source()],
    { BET_PHASE_BOOKS_V2_MODE: "shadow" }
  );

  assert.equal(mock.rows.size, 2);
  assert.equal(again.createdCount, 0);
  assert.equal(again.updatedCount, 2);
  assert.equal(again.protectedCount, 0);

  const opening = [...mock.rows.values()].find(
    (row) => row.bookPhase === "opening_minute"
  );
  assert.ok(opening);
  opening.status = "open";

  const protectedRun = await materializeBetPhaseBookShadows(
    mock.prisma as never,
    [source()],
    { BET_PHASE_BOOKS_V2_MODE: "shadow" }
  );

  assert.equal(protectedRun.protectedCount, 1);
  assert.equal(protectedRun.updatedCount, 1);
  assert.equal(opening.status, "open");
});

test("disabled or requested-live runtime cannot materialize phase rows", async () => {
  for (const mode of ["disabled", "live"]) {
    const mock = mockPrisma();
    const result = await materializeBetPhaseBookShadows(
      mock.prisma as never,
      [source()],
      { BET_PHASE_BOOKS_V2_MODE: mode }
    );

    assert.equal(result.mode, "disabled");
    assert.equal(result.plannedCount, 0);
    assert.equal(mock.rows.size, 0);
  }
});

test("shadow materializer source contains no financial write rail", () => {
  const materializer = readFileSync(
    new URL("../lib/betPhaseBookShadowMaterializer.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    materializer,
    /betWager|betStakeTicket|betStakeIntent|betMarketWallet|pendingWoloClaim/
  );
  assert.match(materializer, /status: BET_PHASE_BOOKS_V2_SHADOW_STATUS/);
  assert.match(
    materializer,
    /marketType: BET_PHASE_BOOKS_V2_SHADOW_MARKET_TYPE/
  );
});
