import assert from "node:assert/strict";
import test from "node:test";

// Dynamically import the service AFTER configuring a strictly synthetic escrow
// so the existing source-level rail gate permits an ownership-denial exercise.
// No RPC, real wallet, DB connection or onchain submission is ever reached.
const keys = [
  "BET_STAKE_TICKETS_ENABLED",
  "NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS",
  "WOLO_BET_ESCROW_ADDRESS",
] as const;
const oldEnv = keys.map((key) => process.env[key]);
process.env.BET_STAKE_TICKETS_ENABLED = "true";
process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS = "wolo1synthetic-unit-test-never-use";
process.env.WOLO_BET_ESCROW_ADDRESS = "wolo1synthetic-unit-test-never-use";
const { commitBetStakeTicket } = await import("../lib/betStakeTickets.ts");
for (let i = 0; i < keys.length; i += 1) {
  const key = keys[i];
  const old = oldEnv[i];
  if (old === undefined) delete process.env[key];
  else process.env[key] = old;
}

function viewer(id: number) {
  return {
    id,
    uid: "player-" + id,
    inGameName: null,
    steamPersonaName: null,
    walletAddress: null,
  };
}

test("cross-account commit refuses an existing foreign ticket before any side effect", async () => {
  let ticketLookups = 0;
  let writes = 0;
  const prisma = {
    betStakeTicket: {
      findUnique: async () => {
        ticketLookups += 1;
        return {
          id: 803,
          userId: 18,
          stakeTxHash: null,
          status: "awaiting_signature",
        };
      },
    },
    $transaction: async () => {
      writes += 1;
      throw new Error("unauthorized transaction reached");
    },
    betStakeIntent: {
      findUnique: async () => {
        writes += 1;
        throw new Error("unauthorized intent reached");
      },
    },
    betWager: {
      findUnique: async () => {
        writes += 1;
        throw new Error("unauthorized wager reached");
      },
    },
  };
  await assert.rejects(
    commitBetStakeTicket(prisma as never, {
      ticketId: 803,
      viewer: viewer(73),
      stakeTxHash: "SYNTHETIC-FOREIGN-TX",
    }),
    (error: unknown) =>
      error !== null &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 404 &&
      "message" in error &&
      error.message === "Bet ticket not found.",
  );
  assert.equal(ticketLookups, 1);
  assert.equal(writes, 0);
});

test("missing and foreign tickets have the same non-disclosing 404 result", async () => {
  for (const row of [null, { id: 803, userId: 18 }]) {
    let transactions = 0;
    const prisma = {
      betStakeTicket: { findUnique: async () => row },
      $transaction: async () => {
        transactions += 1;
        throw new Error("must not be called");
      },
    };
    await assert.rejects(
      commitBetStakeTicket(prisma as never, {
        ticketId: 803,
        viewer: viewer(73),
        stakeTxHash: "SYNTHETIC-UNAUTHORIZED-TX",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 404 &&
        "message" in error &&
        error.message === "Bet ticket not found.",
    );
    assert.equal(transactions, 0);
  }
});
