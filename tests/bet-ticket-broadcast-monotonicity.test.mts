import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  bindBetStakeTicketBroadcast,
  loadViewerBetStakeTickets,
} from "../lib/betStakeTickets.ts";

type TicketStatus =
  | "awaiting_signature"
  | "broadcast_submitted"
  | "verified_unrecorded"
  | "recorded"
  | "suspect";

type TicketRow = {
  id: number;
  status: TicketStatus;
  stakeTxHash: string | null;
  broadcastSubmittedAt: Date | null;
  errorDetail: string | null;
  orphanedAt: Date | null;
};

function fixture(options: {
  status?: TicketStatus;
  existingHash?: string | null;
  otherTicketClaim?: number | null;
  legacyWagerClaim?: boolean;
  legacyIntentClaim?: boolean;
} = {}) {
  const originalTimestamp = new Date("2026-08-03T12:00:00.000Z");
  const ticket: TicketRow = {
    id: 812,
    status: options.status ?? "awaiting_signature",
    stakeTxHash: options.existingHash ?? null,
    broadcastSubmittedAt: originalTimestamp,
    errorDetail: null,
    orphanedAt: null,
  };
  let updates = 0;
  let locks = 0;
  let reads = 0;
  const tx = {
    $executeRaw: async (_parts: TemplateStringsArray, _lockId: bigint) => {
      // Preserve the SQL-template mock signature while explicitly consuming
      // the parameters unused by this lock-counting regression fixture.
      void _parts;
      void _lockId;
      locks += 1;
      return 1;
    },
    betStakeTicket: {
      findUnique: async ({
        where,
      }: {
        where: { id?: number; stakeTxHash?: string };
      }) => {
        reads += 1;
        if (where.id !== undefined) {
          return where.id === ticket.id ? { ...ticket } : null;
        }
        if (where.stakeTxHash === undefined) return null;
        if (options.otherTicketClaim) {
          return { id: options.otherTicketClaim, status: "recorded" };
        }
        return ticket.stakeTxHash === where.stakeTxHash
          ? { id: ticket.id, status: ticket.status }
          : null;
      },
      update: async ({ data }: { data: Partial<TicketRow> }) => {
        updates += 1;
        Object.assign(ticket, data);
        return { ...ticket };
      },
    },
    betWager: {
      findUnique: async () => options.legacyWagerClaim ? { id: 111 } : null,
    },
    betStakeIntent: {
      findUnique: async () => options.legacyIntentClaim ? { id: 112 } : null,
    },
  };
  const prisma = {
    $transaction: async (
      callback: (client: typeof tx) => Promise<unknown>
    ) => callback(tx),
  };
  return {
    prisma: prisma as never,
    ticket,
    get updates() { return updates; },
    get locks() { return locks; },
    get reads() { return reads; },
    originalTimestamp,
  };
}

const request = (stakeTxHash = "TRANS-812") => ({
  ticketId: 812,
  stakeTxHash,
  broadcastSubmittedAt: new Date("2026-08-05T17:00:00.000Z"),
});

test("a replayed exact broadcast must never downgrade a verified-unrecorded ticket", async () => {
  const f = fixture({
    status: "verified_unrecorded",
    existingHash: "TRANS-812",
  });
  const result = await bindBetStakeTicketBroadcast(f.prisma, request());

  assert.equal(result.status, "verified_unrecorded");
  assert.equal(f.ticket.status, "verified_unrecorded");
  assert.equal(f.ticket.stakeTxHash, "TRANS-812");
  assert.equal(f.ticket.broadcastSubmittedAt, f.originalTimestamp);
  assert.equal(f.updates, 0);
  assert.equal(f.locks, 2);
  assert.ok(f.reads >= 2);
});

test("recorded ticket remains immutable under an exact duplicate broadcast", async () => {
  const f = fixture({ status: "recorded", existingHash: "TRANS-812" });
  const returned = await bindBetStakeTicketBroadcast(f.prisma, request());
  assert.equal(returned.status, "recorded");
  assert.equal(f.updates, 0);
  assert.equal(f.ticket.broadcastSubmittedAt, f.originalTimestamp);
});

test("a new broadcast binds one immutable transfer only once", async () => {
  const f = fixture();
  const first = await bindBetStakeTicketBroadcast(f.prisma, request());
  assert.equal(first.status, "broadcast_submitted");
  assert.equal(first.stakeTxHash, "TRANS-812");
  assert.equal(f.updates, 1);
  assert.equal(f.ticket.broadcastSubmittedAt, f.originalTimestamp);

  const second = await bindBetStakeTicketBroadcast(f.prisma, request());
  assert.equal(second.status, "broadcast_submitted");
  assert.equal(second.stakeTxHash, "TRANS-812");
  assert.equal(f.ticket.broadcastSubmittedAt, f.originalTimestamp);
  assert.equal(f.locks, 4);
});

test("a conflicting transfer hash is rejected without changing verified proof", async () => {
  const f = fixture({
    status: "verified_unrecorded",
    existingHash: "TRANS-812",
  });
  await assert.rejects(
    bindBetStakeTicketBroadcast(f.prisma, request("ATTACK-OTHER-HASH")),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 409,
  );
  assert.equal(f.updates, 0);
  assert.equal(f.ticket.status, "verified_unrecorded");
  assert.equal(f.ticket.stakeTxHash, "TRANS-812");
});

test("a transfer already claimed by another ticket, legacy wager, or intent is denied", async () => {
  for (const conflict of [
    { otherTicketClaim: 999 },
    { legacyWagerClaim: true },
    { legacyIntentClaim: true },
  ]) {
    const f = fixture(conflict);
    await assert.rejects(
      bindBetStakeTicketBroadcast(f.prisma, request()),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 409,
    );
    assert.equal(f.updates, 0);
    assert.equal(f.ticket.stakeTxHash, null);
    assert.equal(f.ticket.status, "awaiting_signature");
  }
});


test("viewer ticket retrieval scopes the database query to that viewer ID", async () => {
  const originalPreview = process.env.AOE2WAR_PROD_DB_PREVIEW;
  process.env.AOE2WAR_PROD_DB_PREVIEW = "true";
  const rows = [
    { id: 111, userId: 5, status: "broadcast_submitted" },
    { id: 222, userId: 8, status: "verified_unrecorded" },
  ];
  let observed: Record<string, unknown> | null = null;
  const prisma = {
    betStakeTicket: {
      findMany: async ({
        where,
        take,
      }: {
        where: { userId: number };
        take: number;
      }) => {
        observed = { ...where, take };
        return rows.filter((row) => row.userId === where.userId);
      },
    },
  };
  try {
    const userFive = await loadViewerBetStakeTickets(prisma as never, 5);
    const userEight = await loadViewerBetStakeTickets(prisma as never, 8);
    assert.deepEqual(userFive.map((row) => row.id), [111]);
    assert.deepEqual(userEight.map((row) => row.id), [222]);
    assert.equal(observed?.userId, 8);
    assert.equal(observed?.take, 8);
  } finally {
    if (originalPreview === undefined) delete process.env.AOE2WAR_PROD_DB_PREVIEW;
    else process.env.AOE2WAR_PROD_DB_PREVIEW = originalPreview;
  }
});

test("bet commit ownership check precedes transfer binding and chain verification", () => {
  const source = readFileSync(new URL("../lib/betStakeTickets.ts", import.meta.url), "utf8");
  const loaded = source.indexOf("const ticket = await loadOwnedTicket", source.indexOf("export async function commitBetStakeTicket"));
  const matched = source.indexOf("ticket.userId !== userId", source.indexOf("async function loadOwnedTicket"));
  const bind = source.indexOf("await bindBetStakeTicketBroadcast(", loaded);
  const chain = source.indexOf("await verifyStakeTransfer(", bind);
  assert.ok(matched >= 0, "missing exact-owner decision from ticket load");
  assert.ok(loaded >= 0, "ticket owner must be loaded first");
  assert.ok(bind > loaded, "transaction binding requires ticket owner check");
  assert.ok(chain > bind, "remote chain verification happens after identity binding");
  const custody = source.indexOf("assertCustodyProof();", loaded);
  assert.ok(custody > loaded && custody < bind, "custody proof must match the owned durable ticket before binding");
  assert.match(source.slice(bind, chain), /custodialAuto[\s\S]*input\.satchelFundingProof!\.txTimestamp/);
});
