import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runBetCounterShadowWorker } from "../lib/bettingBotShadowWorker.ts";

type ActionRow = {
  id: number;
  idempotencyKey: string;
  botConfigId: number;
  marketId: number | null;
  sourceWagerId: number | null;
  eventType: string;
  proposedCounterstakeWolo: number | null;
  committedCounterstakeWolo: number | null;
  marketExposureBeforeWolo: number | null;
  dailyExposureBeforeWolo: number | null;
  sourceSide: string | null;
  counterSide: string | null;
  availableBalanceWolo: number | null;
  custodyVerified: boolean;
  custodyVerificationId: string | null;
  custodyReservationId: string | null;
  stakeTxHash: string | null;
  reasonCode: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

const HUMAN_UID = "human-user";
const BOT_UID = "aoe2hd_betting_bot_tony";

function bot(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "tony",
    reservedUid: BOT_UID,
    displayName: "Tony",
    avatarUrl: null,
    mode: "shadow",
    commentaryEnabled: false,
    commentaryPrompt: "",
    oppositeOnly: true,
    defaultCounterstakeWolo: 10,
    maxCounterstakeWolo: 10,
    perMarketExposureWolo: 10,
    dailyExposureWolo: 50,
    balanceFloorWolo: 100,
    policyId: "opposite-counter",
    policyVersion: 1,
    version: 1,
    ...overrides,
  };
}

function wager(overrides: Record<string, unknown> = {}) {
  return {
    id: 99,
    status: "active",
    side: "left",
    amountWolo: 25,
    executionMode: "onchain_escrow",
    user: { uid: HUMAN_UID },
    market: {
      id: 42,
      status: "live",
      marketType: "winner",
      propositionHash: "a".repeat(64),
      integrityStatus: "verified",
      linkedSessionKey: "platform:game-42",
      scheduledMatchId: null,
      title: "Alpha vs Bravo",
    },
    ...overrides,
  };
}

function harness(options: {
  bot?: ReturnType<typeof bot>;
  wager?: ReturnType<typeof wager>;
  marketExposureWolo?: number;
  dailyExposureWolo?: number;
  actions?: ActionRow[];
} = {}) {
  const storedBot = options.bot ?? bot();
  const sourceWager = options.wager ?? wager();
  const actions = options.actions ?? [];
  let nextId = actions.length + 1;
  const locks: Array<[number, number]> = [];

  const tx = {
    $executeRaw: async (...args: unknown[]) => {
      const values = (args[1] ?? []) as unknown[];
      if (Array.isArray(values) && values.length >= 2) {
        locks.push([Number(values[0]), Number(values[1])]);
      }
      return 1;
    },
    bettingBotConfig: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === storedBot.id ? storedBot : null,
    },
    betWager: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === sourceWager.id ? sourceWager : null,
    },
    betCounterAction: {
      findUnique: async ({
        where,
      }: {
        where: { idempotencyKey: string };
      }) =>
        actions.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
      aggregate: async ({
        where,
      }: {
        where: {
          marketId?: number;
          createdAt?: { gte: Date };
        };
      }) => {
        if (where.marketId !== undefined) {
          return {
            _sum: {
              proposedCounterstakeWolo:
                options.marketExposureWolo ??
                actions
                  .filter(
                    (row) =>
                      row.botConfigId === storedBot.id &&
                      row.marketId === where.marketId &&
                      row.eventType === "shadow_proposal"
                  )
                  .reduce(
                    (sum, row) => sum + (row.proposedCounterstakeWolo ?? 0),
                    0
                  ),
            },
          };
        }

        return {
          _sum: {
            proposedCounterstakeWolo:
              options.dailyExposureWolo ??
              actions
                .filter(
                  (row) =>
                    row.botConfigId === storedBot.id &&
                    row.eventType === "shadow_proposal"
                )
                .reduce(
                  (sum, row) => sum + (row.proposedCounterstakeWolo ?? 0),
                  0
                ),
          },
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (
          actions.some(
            (row) => row.idempotencyKey === String(data.idempotencyKey)
          )
        ) {
          throw { code: "P2002" };
        }
        const row = {
          id: nextId++,
          ...data,
          createdAt: new Date("2026-09-29T18:00:00.000Z"),
        } as ActionRow;
        actions.push(row);
        return row;
      },
    },
  };

  const prisma = {
    bettingBotConfig: {
      findMany: async () => [storedBot],
    },
    $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) =>
      callback(tx),
  };

  return {
    prisma: prisma as never,
    actions,
    locks,
  };
}

const SHADOW_ENV = {
  BETTING_BOTS_MODE: "shadow",
};

test("human action creates one deterministic opposite-side shadow proposal", async () => {
  const state = harness();

  const result = await runBetCounterShadowWorker(state.prisma, {
    sourceWagerIds: [99],
    env: SHADOW_ENV,
    now: new Date("2026-09-29T18:05:00.000Z"),
  });

  assert.deepEqual(result, {
    evaluatedCount: 1,
    proposedCount: 1,
    skippedCount: 0,
    duplicateCount: 0,
  });
  assert.equal(state.actions.length, 1);

  const action = state.actions[0]!;
  assert.equal(action.eventType, "shadow_proposal");
  assert.equal(action.marketId, 42);
  assert.equal(action.sourceWagerId, 99);
  assert.equal(action.sourceSide, "left");
  assert.equal(action.counterSide, "right");
  assert.equal(action.proposedCounterstakeWolo, 10);
  assert.equal(action.committedCounterstakeWolo, null);
  assert.equal(action.availableBalanceWolo, null);
  assert.equal(action.custodyVerified, false);
  assert.equal(action.custodyVerificationId, null);
  assert.equal(action.custodyReservationId, null);
  assert.equal(action.stakeTxHash, null);
  assert.equal(action.reasonCode, "OPPOSITE_PREVIEW_READY");
  assert.equal(action.metadata.balanceSource, "shadow_policy_envelope");
  assert.equal(action.metadata.executionInstalled, false);
});

test("per-market shadow exposure is serialized and caps the next proposal", async () => {
  const state = harness({ marketExposureWolo: 8 });

  const result = await runBetCounterShadowWorker(state.prisma, {
    sourceWagerIds: [99],
    env: SHADOW_ENV,
  });

  assert.equal(result.proposedCount, 1);
  assert.equal(state.actions[0]?.proposedCounterstakeWolo, 2);
  assert.equal(state.actions[0]?.marketExposureBeforeWolo, 8);
});

test("reserved counter-bettor identities never recursively counter themselves", async () => {
  const state = harness({
    wager: wager({ user: { uid: BOT_UID } }),
  });

  const result = await runBetCounterShadowWorker(state.prisma, {
    sourceWagerIds: [99],
    env: SHADOW_ENV,
  });

  assert.equal(result.proposedCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(state.actions.length, 0);
});

test("other reserved system identities cannot trigger house previews", async () => {
  const state = harness({
    wager: wager({ user: { uid: "aoe2hd_ai_concierge" } }),
  });

  const result = await runBetCounterShadowWorker(state.prisma, {
    sourceWagerIds: [99],
    env: SHADOW_ENV,
  });

  assert.equal(result.proposedCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(state.actions.length, 0);
});

test("one source wager produces at most one append-only action per bot policy", async () => {
  const state = harness();

  const first = await runBetCounterShadowWorker(state.prisma, {
    sourceWagerIds: [99],
    env: SHADOW_ENV,
  });
  const second = await runBetCounterShadowWorker(state.prisma, {
    sourceWagerIds: [99, 99],
    env: SHADOW_ENV,
  });

  assert.equal(first.proposedCount, 1);
  assert.equal(second.proposedCount, 0);
  assert.equal(second.duplicateCount, 1);
  assert.equal(state.actions.length, 1);
});

test("server-disabled counter-bettors do not create shadow evidence", async () => {
  const state = harness();

  const result = await runBetCounterShadowWorker(state.prisma, {
    sourceWagerIds: [99],
    env: { BETTING_BOTS_MODE: "disabled" },
  });

  assert.equal(result.proposedCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(state.actions.length, 0);
});

test("worker remains structurally non-financial and uses the shared policy lock", () => {
  const worker = readFileSync(
    new URL("../lib/bettingBotShadowWorker.ts", import.meta.url),
    "utf8"
  );
  const lock = readFileSync(
    new URL("../lib/bettingBotPolicyLock.ts", import.meta.url),
    "utf8"
  );
  const admin = readFileSync(
    new URL("../app/api/admin/betting-bots/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(worker, /lockBettingBotPolicy\(tx, input\.botId\)/);
  assert.match(lock, /pg_advisory_xact_lock/);
  assert.match(admin, /lockBettingBotPolicy\(tx, id\)/);

  assert.match(worker, /betCounterAction\.create/);
  assert.match(worker, /committedCounterstakeWolo: null/);
  assert.match(worker, /availableBalanceWolo: null/);
  assert.match(worker, /custodyVerified: false/);
  assert.match(worker, /stakeTxHash: null/);

  assert.doesNotMatch(worker, /betWager\.create/);
  assert.doesNotMatch(worker, /betStakeTicket\.create/);
  assert.doesNotMatch(worker, /betStakeIntent\.create/);
  assert.doesNotMatch(worker, /signAndBroadcast|offlineSigner|executeFounderWoloPayout/);
});

test("admin audit exposes preview evidence without claiming committed money", () => {
  const route = readFileSync(
    new URL("../app/api/admin/betting-bots/route.ts", import.meta.url),
    "utf8"
  );
  const panel = readFileSync(
    new URL("../components/admin/ai/BettingBotControlPanel.tsx", import.meta.url),
    "utf8"
  );

  for (const field of [
    "marketId: true",
    "sourceWagerId: true",
    "sourceSide: true",
    "counterSide: true",
    "marketExposureBeforeWolo: true",
    "dailyExposureBeforeWolo: true",
  ]) {
    assert.match(route, new RegExp(field.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  }
  assert.match(route, /shadowEvaluatorConnected: true/);
  assert.match(panel, /Shadow proposal/);
  assert.match(panel, /WOLO preview/);
  assert.match(panel, /custody proof/);
  assert.match(panel, /Preview amounts are proposals only/);
  assert.doesNotMatch(panel, /counter-wager was placed|WOLO moved/);
});

test("counter shadow evaluation occurs only after human wager transactions commit", () => {
  const single = readFileSync(
    new URL("../lib/betWagering.ts", import.meta.url),
    "utf8"
  );
  const ticket = readFileSync(
    new URL("../lib/betStakeTickets.ts", import.meta.url),
    "utf8"
  );

  const singleTx = single.indexOf("await prisma.$transaction(async (tx) =>");
  const singleWorker = single.lastIndexOf(
    "runBetCounterShadowWorkerBestEffort(prisma, [createdWagerId])"
  );
  const singleReturn = single.indexOf('return { kind: "created" };', singleWorker);
  assert.ok(singleTx >= 0);
  assert.ok(singleWorker > singleTx);
  assert.ok(singleReturn > singleWorker);
  assert.doesNotMatch(
    single.slice(singleTx, single.indexOf("} catch (error)", singleTx)),
    /runBetCounterShadowWorkerBestEffort/
  );

  const ticketTx = ticket.indexOf("await prisma.$transaction(async (tx) =>", ticket.indexOf("export async function commitBetStakeTicket"));
  const ticketWorker = ticket.lastIndexOf(
    "runBetCounterShadowWorkerBestEffort(prisma, createdWagerIds)"
  );
  assert.ok(ticketTx >= 0);
  assert.ok(ticketWorker > ticketTx);

  assert.match(
    single,
    /existingIntentWager[\s\S]*runBetCounterShadowWorkerBestEffort\(prisma, \[existingIntentWager\.id\]\)/
  );
  assert.match(
    single,
    /duplicateStake[\s\S]*runBetCounterShadowWorkerBestEffort\(prisma, \[duplicateStake\.id\]\)/
  );
});
