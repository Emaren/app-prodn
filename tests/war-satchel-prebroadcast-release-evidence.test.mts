import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prebroadcastReleaseEvidenceIssue } from "../lib/warSatchelPrebroadcastReleaseEvidence.ts";

const fresh = () => ({
  reservation: {
    id: "satchel:reserve:29", ticketRequestId: "satchel:ticket:29",
    txHash: null as string | null, ticketId: null as number | null,
  },
  ownerUserId: 42,
  execution: {
    reservationId: "satchel:reserve:29", ticketId: null as number | null,
    status: "funded_reserved", attemptCount: 1,
  },
  authority: null as null | {
    reservationId: string; ownerUserId: number; broadcast: null | object;
  },
  ticket: null as null | {
    status: string; stakeTxHash: string | null; broadcastSubmittedAt: Date | null;
  },
});
const auth = () => ({
  reservationId: "satchel:reserve:29", ownerUserId: 42, broadcast: null,
});
const awaitingTicket = () => ({
  status: "awaiting_signature", stakeTxHash: null, broadcastSubmittedAt: null,
});

test("prebroadcast release admits only consistent never-sent reserved evidence", () => {
  assert.equal(prebroadcastReleaseEvidenceIssue(fresh()), null);
  const approved = fresh();
  approved.authority = auth();
  approved.ticket = awaitingTicket();
  assert.equal(prebroadcastReleaseEvidenceIssue(approved), null,
    "an independently reviewed but unattempted ticket must be recoverable");
});

test("any inconsistent execution or reservation evidence blocks full principal return", () => {
  for (const [name, patch] of [
    ["no execution", (e: ReturnType<typeof fresh>) => { e.execution = null as never; }],
    ["wrong reservation", (e: ReturnType<typeof fresh>) => { e.execution.reservationId = "other"; }],
    ["unknown attempt", (e: ReturnType<typeof fresh>) => { e.execution.status = "funded_submitting"; }],
    ["attempt already fenced", (e: ReturnType<typeof fresh>) => { e.execution.status = "funded_unknown_hold"; }],
    ["already rejected", (e: ReturnType<typeof fresh>) => { e.execution.status = "funded_rejected"; }],
    ["zero attempts", (e: ReturnType<typeof fresh>) => { e.execution.attemptCount = 0; }],
    ["two attempts", (e: ReturnType<typeof fresh>) => { e.execution.attemptCount = 2; }],
    ["ticket assigned", (e: ReturnType<typeof fresh>) => { e.execution.ticketId = 12; }],
    ["reservation ticket", (e: ReturnType<typeof fresh>) => { e.reservation.ticketId = 12; }],
    ["reservation hash", (e: ReturnType<typeof fresh>) => { e.reservation.txHash = "A".repeat(64); }],
  ] as const) {
    const e = fresh();
    patch(e);
    assert.equal(prebroadcastReleaseEvidenceIssue(e),
      "no_broadcast_execution_evidence_inconsistent", name);
  }
});

test("signed review identity and any recorded broadcast marker fence refunds", () => {
  const e = fresh();
  e.authority = {...auth(), broadcast: {operationId: "satchel:ticket:29"}};
  assert.equal(prebroadcastReleaseEvidenceIssue(e),
    "no_broadcast_wager_authority_inconsistent");
  e.authority = {...auth(), reservationId: "another"};
  assert.equal(prebroadcastReleaseEvidenceIssue(e),
    "no_broadcast_wager_authority_inconsistent");
  e.authority = {...auth(), ownerUserId: 43};
  assert.equal(prebroadcastReleaseEvidenceIssue(e),
    "no_broadcast_wager_authority_inconsistent");
});

test("recorded canonical ticket send or mutated status blocks no-broadcast refund", () => {
  for (const ticket of [
    {...awaitingTicket(), status: "recorded"},
    {...awaitingTicket(), status: "rejected"},
    {...awaitingTicket(), stakeTxHash: "B".repeat(64)},
    {...awaitingTicket(), broadcastSubmittedAt: new Date()},
  ]) {
    const e = fresh();
    e.ticket = ticket;
    assert.equal(prebroadcastReleaseEvidenceIssue(e),
      "no_broadcast_canonical_ticket_inconsistent");
  }
});

test("release checks persisted independent records BEFORE journal credit in exclusive vault transaction", () => {
  const ledger = readFileSync(new URL("../lib/warSatchelFundedLedger.ts", import.meta.url), "utf8");
  const from = ledger.indexOf("export async function releaseUnbroadcastSatchelReservation(");
  const to = ledger.indexOf("export async function markSatchelSubmissionAttempt(", from);
  assert.ok(from > 0 && to > from);
  const body = ledger.slice(from, to);
  const check = body.indexOf("prebroadcastReleaseEvidenceIssue({");
  const journal = body.indexOf("satchelFundedJournal.create({");
  const account = body.indexOf("satchelFundedBalance.update({");
  assert.ok(check > 0 && journal > check && account > journal,
    "inconsistent evidence must refuse before any monetary state mutation");
  assert.match(body, /withExclusiveSatchelTx\(prisma, async tx/);
  assert.match(body, /satchelWagerAuthorization\.findUnique\(/);
  assert.match(body, /betStakeTicket\.findUnique\(/);
  assert.match(body, /if \(!input\.independentlyNoBroadcast\)/);
  assert.match(body, /if \(issue\) stop\(issue\)/);
  assert.doesNotMatch(body, /signer\.submit|broadcastTx|request\(.*8094/);
});
