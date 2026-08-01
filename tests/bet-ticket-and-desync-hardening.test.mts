import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BET_STAKE_TICKET_VERSION,
  buildBetStakeTicketMemo,
} from "../lib/betStakeMemo.ts";
import {
  effectiveBetWagerStakeTxHash,
  isRecordedBetStakeTicket,
} from "../lib/betStakeFunding.ts";
import { updateBetStakeIntentBroadcast } from "../lib/betStakeIntents.ts";
import {
  BET_STAKE_TICKET_UNSIGNED_MARKET_GUARD_MS,
  bindBetStakeTicketBroadcast,
  buildBetStakeTicketMarketGuardWhere,
  canonicalBetStakeTicketPropositionSetHash,
} from "../lib/betStakeTickets.ts";

const read = (path: string) =>
  readFileSync(path, "utf8");

test("ticket memo is exact and versioned", () => {
  assert.equal(BET_STAKE_TICKET_VERSION, 1);
  assert.equal(
    buildBetStakeTicketMemo(2820),
    "AoE2HDBets bet ticket v1 · ticket 2820"
  );
  assert.throws(() => buildBetStakeTicketMemo(0));
  assert.throws(() => buildBetStakeTicketMemo(1, 2));
});

test("ticket-funded wager resolves one shared recorded chain proof", () => {
  const ticket = {
    id: 17,
    status: "recorded",
    stakeTxHash: "ABC123",
  };
  assert.equal(isRecordedBetStakeTicket(ticket), true);
  assert.equal(
    effectiveBetWagerStakeTxHash({
      stakeTxHash: null,
      stakeLeg: { ticket },
    }),
    "ABC123"
  );
  assert.equal(
    effectiveBetWagerStakeTxHash({
      stakeTxHash: null,
      stakeLeg: {
        ticket: {
          ...ticket,
          status: "verified_unrecorded",
        },
      },
    }),
    null
  );
});

test("concurrent different hashes cannot replace one ticket binding", async () => {
  const state: {
    id: number;
    status: string;
    stakeTxHash: string | null;
    broadcastSubmittedAt: Date | null;
  } = {
    id: 73,
    status: "awaiting_signature",
    stakeTxHash: null,
    broadcastSubmittedAt: null,
  };

  const lockTails = new Map<string, Promise<void>>();
  const acquireLock = async (key: string) => {
    const prior = lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockTails.set(key, prior.then(() => held));
    await prior;
    return release;
  };

  let firstCurrentReadReached!: () => void;
  const firstCurrentRead = new Promise<void>((resolve) => {
    firstCurrentReadReached = resolve;
  });
  let releaseFirstCurrentRead!: () => void;
  const allowFirstCurrentRead = new Promise<void>((resolve) => {
    releaseFirstCurrentRead = resolve;
  });
  let currentReadCount = 0;

  const prisma = {
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const releases: Array<() => void> = [];
      const tx = {
        $executeRaw: async (_query: TemplateStringsArray, lockId: bigint) => {
          releases.push(await acquireLock(lockId.toString()));
          return 1;
        },
        betWager: { findUnique: async () => null },
        betStakeIntent: { findUnique: async () => null },
        betStakeTicket: {
          findUnique: async ({ where }: { where: Record<string, unknown> }) => {
            if (typeof where.id === "number") {
              currentReadCount += 1;
              const snapshot = { ...state };
              if (currentReadCount === 1) {
                firstCurrentReadReached();
                await allowFirstCurrentRead;
              }
              return snapshot;
            }
            if (typeof where.stakeTxHash === "string") {
              return state.stakeTxHash === where.stakeTxHash
                ? { id: state.id, status: state.status }
                : null;
            }
            return null;
          },
          update: async ({ data }: { data: Partial<typeof state> }) => {
            Object.assign(state, data);
            return { ...state };
          },
        },
      };
      try {
        return await callback(tx);
      } finally {
        for (const release of releases.reverse()) release();
      }
    },
  };

  const firstSubmittedAt = new Date("2026-08-01T17:00:00.000Z");
  const secondSubmittedAt = new Date("2026-08-01T17:01:00.000Z");
  const first = bindBetStakeTicketBroadcast(prisma as never, {
    ticketId: state.id,
    stakeTxHash: "FIRST-TX-HASH",
    broadcastSubmittedAt: firstSubmittedAt,
  });
  await firstCurrentRead;
  const second = bindBetStakeTicketBroadcast(prisma as never, {
    ticketId: state.id,
    stakeTxHash: "SECOND-TX-HASH",
    broadcastSubmittedAt: secondSubmittedAt,
  });
  releaseFirstCurrentRead();

  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  if (results[1].status === "rejected") {
    assert.equal(results[1].reason?.status, 409);
  }
  assert.equal(state.stakeTxHash, "FIRST-TX-HASH");
  assert.equal(state.broadcastSubmittedAt, firstSubmittedAt);
});

test("concurrent different hashes cannot replace one legacy intent binding", async () => {
  const state: {
    id: number;
    status: string;
    stakeTxHash: string | null;
    broadcastSubmittedAt: Date | null;
  } = {
    id: 91,
    status: "awaiting_signature",
    stakeTxHash: null,
    broadcastSubmittedAt: null,
  };

  const lockTails = new Map<string, Promise<void>>();
  const acquireLock = async (key: string) => {
    const prior = lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockTails.set(key, prior.then(() => held));
    await prior;
    return release;
  };

  let firstCurrentReadReached!: () => void;
  const firstCurrentRead = new Promise<void>((resolve) => {
    firstCurrentReadReached = resolve;
  });
  let releaseFirstCurrentRead!: () => void;
  const allowFirstCurrentRead = new Promise<void>((resolve) => {
    releaseFirstCurrentRead = resolve;
  });
  let currentReadCount = 0;

  const prisma = {
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const releases: Array<() => void> = [];
      const tx = {
        $executeRaw: async (_query: TemplateStringsArray, lockId: bigint) => {
          releases.push(await acquireLock(lockId.toString()));
          return 1;
        },
        betStakeTicket: { findUnique: async () => null },
        betWager: { findUnique: async () => null },
        betStakeIntent: {
          findUnique: async ({ where }: { where: Record<string, unknown> }) => {
            if (typeof where.id === "number") {
              currentReadCount += 1;
              const snapshot = { ...state };
              if (currentReadCount === 1) {
                firstCurrentReadReached();
                await allowFirstCurrentRead;
              }
              return snapshot;
            }
            if (typeof where.stakeTxHash === "string") {
              return state.stakeTxHash === where.stakeTxHash
                ? { id: state.id }
                : null;
            }
            return null;
          },
          update: async ({ data }: { data: Partial<typeof state> }) => {
            Object.assign(state, data);
            return { ...state };
          },
        },
      };
      try {
        return await callback(tx);
      } finally {
        for (const release of releases.reverse()) release();
      }
    },
  };

  const first = updateBetStakeIntentBroadcast(prisma as never, {
    intentId: state.id,
    stakeTxHash: "FIRST-LEGACY-TX",
  });
  await firstCurrentRead;
  const second = updateBetStakeIntentBroadcast(prisma as never, {
    intentId: state.id,
    stakeTxHash: "SECOND-LEGACY-TX",
  });
  releaseFirstCurrentRead();

  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  if (results[1].status === "rejected") {
    assert.equal(results[1].reason?.status, 409);
  }
  assert.equal(state.stakeTxHash, "FIRST-LEGACY-TX");
});

test("ticket API freezes one winner plus optional attached Desync leg", () => {
  const source = read("lib/betStakeTickets.ts");
  const prepareRoute = read("app/api/bets/tickets/route.ts");
  const commitRoute = read(
    "app/api/bets/tickets/[ticketId]/commit/route.ts"
  );
  const recoverRoute = read(
    "app/api/bets/tickets/[ticketId]/recover/route.ts"
  );

  assert.match(source, /winner\.length !== 1/);
  assert.match(source, /desync\.length > 1/);
  assert.match(source, /parentMarketId !== winner\[0\]\.context\.market\.id/);
  assert.match(source, /Ticket total must exactly equal the sum of its legs/);
  assert.match(source, /propositionSetHash/);
  assert.match(source, /expectedMemo: buildBetStakeTicketMemo/);
  assert.match(source, /expectedAmountWolo: ticket\.totalAmountWolo/);
  assert.match(source, /stakeLegId: leg\.id/);
  assert.match(source, /stakeTxHash: null/);
  assert.match(source, /acquireBetStakeTransferLock/);
  assert.match(source, /SELECT "id"[\s\S]*?FROM "bet_markets"[\s\S]*?FOR UPDATE/);
  assert.match(source, /conflictingTicketLeg/);
  assert.match(
    source,
    /canonicalTicketLegState\(lockedTicket\)\s*!==\s*canonicalTicketLegState\(ticket\)/
  );
  assert.match(source, /Ticket legs changed while the transfer was being verified/);
  assert.match(prepareRoute, /prepareBetStakeTicket/);
  assert.match(prepareRoute, /source: "manual"/);
  assert.match(commitRoute, /handleBetStakeTicketCommit/);
  assert.match(recoverRoute, /handleBetStakeTicketCommit/);
});

test("schema and migration preserve legacy wagers while adding tickets", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260801184500_harden_bet_tickets_and_desync_parents/migration.sql"
  );

  assert.match(schema, /model BetStakeTicket \{/);
  assert.match(schema, /model BetStakeLeg \{/);
  assert.match(schema, /stakeLegId\s+Int\?\s+@unique/);
  assert.match(schema, /stakeTxHash\s+String\?\s+@unique\(map: "uq_bet_wagers_stake_tx_hash"\)/);
  assert.match(migration, /CREATE TABLE "bet_stake_tickets"/);
  assert.match(migration, /CREATE TABLE "bet_stake_legs"/);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|CONSTRAINT)/i);
});

test("orphan Desync markets have explicit parents and terminal propagation", () => {
  const source = read("lib/bets.ts");
  const migration = read(
    "prisma/migrations/20260801184500_harden_bet_tickets_and_desync_parents/migration.sql"
  );

  assert.match(source, /market\.parentMarketId/);
  assert.match(source, /desync_parent_terminal_unresolved/);
  assert.match(source, /market_expired_without_stakes/);
  assert.match(source, /status: "voided"/);
  assert.match(source, /market\.parentMarket\.marketType ===\s*WINNER_MARKET_TYPE/);
  assert.match(migration, /ADD COLUMN "parent_market_id" INTEGER/);
  assert.match(migration, /child\."slug" = 'desync-' \|\| parent\."slug"/);
  assert.match(migration, /parent\."status" = 'settled' AND parent\."winner_side" IS NULL/);
});

test("market cleanup and challenge merges preserve a two-leg ticket", () => {
  const source = read("lib/bets.ts");

  const now = new Date("2026-08-01T20:00:00.000Z");
  const guard = buildBetStakeTicketMarketGuardWhere(now);
  const serializedGuard = JSON.stringify(guard);
  assert.equal(BET_STAKE_TICKET_UNSIGNED_MARKET_GUARD_MS, 15 * 60 * 1000);
  assert.match(serializedGuard, /"status":"awaiting_signature"/);
  assert.match(serializedGuard, /"createdAt":\{"gte":"2026-08-01T19:45:00\.000Z"/);
  assert.match(serializedGuard, /"stakeTxHash":\{"not":null\}/);
  assert.match(serializedGuard, /"broadcast_submitted"/);
  assert.match(serializedGuard, /"verified_unrecorded"/);
  assert.match(serializedGuard, /"recorded"/);
  assert.match(source, /stakeTicketLegs:\s*\{[\s\S]*?ticket: \{ is: ticketMarketGuard \}/);
  assert.match(source, /shadowDesyncMarkets/);
  assert.match(source, /canonicalDesyncMarkets/);
  assert.match(source, /marketPairs\.push\(\{[\s\S]*?source: shadowDesync,[\s\S]*?target: canonicalDesync/);
  assert.match(source, /tx\.betStakeLeg\.update\(\{[\s\S]*?marketId: pair\.target\.id/);
  assert.match(source, /acquireBetStakeTicketLock\(tx, ticketId\)/);
  assert.match(source, /canonicalBetStakeTicketPropositionSetHash\(ticket\.legs\)/);
  assert.match(source, /received new financial state during challenge merge/);

  const original = canonicalBetStakeTicketPropositionSetHash([
    {
      marketId: 10,
      legRole: "winner",
      side: "left",
      amountWolo: 10,
      propositionHash: "roster-proof",
    },
    {
      marketId: 11,
      legRole: "desync",
      side: "right",
      amountWolo: 2,
      propositionHash: "roster-proof",
    },
  ]);
  const merged = canonicalBetStakeTicketPropositionSetHash([
    {
      marketId: 20,
      legRole: "winner",
      side: "left",
      amountWolo: 10,
      propositionHash: "roster-proof",
    },
    {
      marketId: 21,
      legRole: "desync",
      side: "right",
      amountWolo: 2,
      propositionHash: "roster-proof",
    },
  ]);
  assert.notEqual(original, merged);
  assert.equal(merged.length, 64);
});

test("founder quick actions are retry-safe but remain intentionally stackable", () => {
  const source = read("lib/betFounderBonuses.ts");
  const route = read(
    "app/api/admin/bets/markets/[marketId]/founders/route.ts"
  );
  const schema = read("prisma/schema.prisma");

  assert.match(source, /createdByUserId_requestId/);
  assert.match(source, /different immutable bonus/);
  assert.match(source, /error\.code === "P2002"/);
  assert.match(route, /idempotency-key/);
  assert.match(route, /duplicate: created\.duplicate/);
  assert.match(
    schema,
    /@@unique\(\[createdByUserId, requestId\], map: "uq_bet_market_founder_bonuses_creator_request"\)/
  );
});

test("public pool and settlement count a ticket only after atomic recording", () => {
  const source = read("lib/bets.ts");
  assert.match(source, /isRecordedBetStakeTicket/);
  assert.match(source, /effectiveBetWagerStakeTxHash/);
  assert.match(source, /status: "recorded",\s*stakeTxHash: \{ not: null \}/);
  assert.match(source, /some: buildCountableActiveWagerWhere\(\)/);
});
