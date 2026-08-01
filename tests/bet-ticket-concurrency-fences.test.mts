import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path: string) => readFile(path, "utf8");

test("ticket preparation locks selected markets before final preflight and insert", async () => {
  const ticketSource = await source("lib/betStakeTickets.ts");
  const lockIndex = ticketSource.indexOf("await lockBetStakeTicketMarkets(");
  const preflightIndex = ticketSource.indexOf(
    "loadBetMarketPreflightContext(tx,",
    lockIndex
  );
  const conflictIndex = ticketSource.indexOf(
    "const conflictingTicketLeg = await tx.betStakeLeg.findFirst",
    preflightIndex
  );
  const createIndex = ticketSource.indexOf(
    "const created = await tx.betStakeTicket.create",
    conflictIndex
  );

  assert.ok(lockIndex >= 0);
  assert.ok(preflightIndex > lockIndex);
  assert.ok(conflictIndex > preflightIndex);
  assert.ok(createIndex > conflictIndex);
  assert.match(
    ticketSource,
    /SELECT "id"[\s\S]*?FROM "bet_markets"[\s\S]*?ORDER BY "id"[\s\S]*?FOR UPDATE/
  );
  assert.match(ticketSource, /buildBetStakeTicketMarketGuardWhere\(new Date\(\)\)/);
});

test("ticket commit reloads immutable legs under the ticket lock", async () => {
  const ticketSource = await source("lib/betStakeTickets.ts");
  const commitIndex = ticketSource.indexOf("export async function commitBetStakeTicket");
  const ticketLockIndex = ticketSource.indexOf(
    "await acquireBetStakeTicketLock(",
    commitIndex
  );
  const reloadIndex = ticketSource.indexOf(
    "const lockedTicket = await tx.betStakeTicket.findUnique",
    ticketLockIndex
  );
  const snapshotIndex = ticketSource.indexOf(
    "canonicalTicketLegState(lockedTicket) !==",
    reloadIndex
  );
  const transferLockIndex = ticketSource.indexOf(
    "await acquireBetStakeTransferLock(",
    snapshotIndex
  );
  const wagerCreateIndex = ticketSource.indexOf(
    "await tx.betWager.create",
    transferLockIndex
  );

  assert.ok(ticketLockIndex >= 0);
  assert.ok(reloadIndex > ticketLockIndex);
  assert.ok(snapshotIndex > reloadIndex);
  assert.ok(transferLockIndex > snapshotIndex);
  assert.ok(wagerCreateIndex > transferLockIndex);
  assert.match(
    ticketSource,
    /Ticket legs changed while the transfer was being verified\. Retry recovery against the canonical market\./
  );
});

test("public ticket preparation cannot forge automated attribution", async () => {
  const routeSource = await source("app/api/bets/tickets/route.ts");
  const spreadIndex = routeSource.indexOf("...payload");
  const sourceIndex = routeSource.indexOf('source: "manual"', spreadIndex);
  const routePathIndex = routeSource.indexOf(
    "routePath: request.nextUrl.pathname",
    sourceIndex
  );

  assert.ok(spreadIndex >= 0);
  assert.ok(sourceIndex > spreadIndex);
  assert.ok(routePathIndex > sourceIndex);
  assert.doesNotMatch(routeSource, /routePath: payload\.routePath/);
});


test("legacy and ticket preparation share the pending-side fence", async () => {
  const wageringSource = await source("lib/betWagering.ts");
  const intentRouteSource = await source("app/api/bets/stake-intents/route.ts");

  assert.match(wageringSource, /const freshUnsignedCutoff = new Date/);
  assert.match(
    wageringSource,
    /status: "awaiting_signature"[\s\S]*?createdAt: \{ gte: freshUnsignedCutoff \}/
  );
  assert.match(
    wageringSource,
    /prisma\.betStakeIntent\.findFirst[\s\S]*?prisma\.betStakeLeg\.findFirst/
  );

  const transactionIndex = intentRouteSource.indexOf(
    "const intent = await prisma.$transaction"
  );
  const rowLockIndex = intentRouteSource.indexOf(
    'FROM "bet_markets"',
    transactionIndex
  );
  const preflightIndex = intentRouteSource.indexOf(
    "await preflightPooledBetWager(tx,",
    rowLockIndex
  );
  const createIndex = intentRouteSource.indexOf(
    "return createBetStakeIntent(tx,",
    preflightIndex
  );

  assert.ok(transactionIndex >= 0);
  assert.ok(rowLockIndex > transactionIndex);
  assert.ok(preflightIndex > rowLockIndex);
  assert.ok(createIndex > preflightIndex);
  assert.match(intentRouteSource, /routePath: request\.nextUrl\.pathname/);
});

test("legacy broadcast binding is immutable and checks every transfer claimant", async () => {
  const intentSource = await source("lib/betStakeIntents.ts");
  const fundingSource = await source("lib/betStakeFunding.ts");

  const intentLockIndex = intentSource.indexOf(
    "await acquireBetStakeIntentLock("
  );
  const transferLockIndex = intentSource.indexOf(
    "await acquireBetStakeTransferLock(",
    intentLockIndex
  );
  const currentHashIndex = intentSource.indexOf(
    "existing.stakeTxHash &&",
    transferLockIndex
  );
  const claimantIndex = intentSource.indexOf(
    "wagerClaim.stakeIntentId !== input.intentId",
    currentHashIndex
  );

  assert.ok(intentLockIndex >= 0);
  assert.ok(transferLockIndex > intentLockIndex);
  assert.ok(currentHashIndex > transferLockIndex);
  assert.ok(claimantIndex > currentHashIndex);
  assert.match(
    fundingSource,
    /aoe2hdbets:bet-stake-intent:\$\{intentId\}/
  );
  assert.match(intentSource, /tx\.betStakeTicket\.findUnique/);
  assert.match(intentSource, /tx\.betWager\.findUnique/);
  assert.match(
    intentSource,
    /tx\.betStakeIntent\.findUnique\(\{[\s\S]*?where: \{ stakeTxHash \}/
  );
  assert.match(
    intentSource,
    /This stake intent is already bound to another transaction hash\./
  );
  assert.match(
    intentSource,
    /existing\.status === "verified_unrecorded"[\s\S]*?"verified_unrecorded"/
  );
});
