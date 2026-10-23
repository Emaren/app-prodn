import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { satchelReserveDebitIssue } from "../lib/warSatchelReserveDebitEvidence.ts";

const initial = () => ({
  reservation: {
    id: "satchel:reserve:42", ownerUserId: 7,
    executionId: 42, amountUwolo: BigInt(12000000),
  },
  journal: {
    sourceKey: "satchel:reserve:42", ownerUserId: 7,
    executionId: 42 as number | null,
    eventKind: "wager_reserve", amountUwolo: BigInt(12000000),
    deltaAvailableUwolo: -BigInt(12000000),
    deltaReservedUwolo: BigInt(12000000),
    deltaCommittedUwolo: BigInt(0),
    deltaWithdrawalPendingUwolo: BigInt(0),
    receiptId: null as bigint | null,
    claimReturnId: null as bigint | null,
  },
});

test("source-of-funds journal exactly proves owner 12-WOLO reserve", () => {
  const x = initial();
  assert.equal(satchelReserveDebitIssue(x.reservation, x.journal), null);
});

test("debit proof refuses all identity, conservation, and receipt mismatches", () => {
  const bad: Array<[string, (x: ReturnType<typeof initial>) => void]> = [
    ["zero", x => { x.reservation.amountUwolo = BigInt(0); }],
    ["negative", x => { x.reservation.amountUwolo = -BigInt(1); }],
    ["source", x => { x.journal.sourceKey = "satchel:reserve:99"; }],
    ["owner", x => { x.journal.ownerUserId = 8; }],
    ["execution", x => { x.journal.executionId = 99; }],
    ["kind", x => { x.journal.eventKind = "wager_refund"; }],
    ["amount", x => { x.journal.amountUwolo = BigInt(11000000); }],
    ["available", x => { x.journal.deltaAvailableUwolo = -BigInt(11000000); }],
    ["reserved", x => { x.journal.deltaReservedUwolo = BigInt(13000000); }],
    ["committed", x => { x.journal.deltaCommittedUwolo = BigInt(12000000); }],
    ["withdrawal", x => { x.journal.deltaWithdrawalPendingUwolo = BigInt(12000000); }],
    ["receipt", x => { x.journal.receiptId = BigInt(5); }],
    ["claim", x => { x.journal.claimReturnId = BigInt(5); }],
  ];
  for (const [name, modify] of bad) {
    const x = initial();
    modify(x);
    assert.equal(satchelReserveDebitIssue(x.reservation, x.journal),
      "original_reserve_debit_missing_or_inconsistent", name);
  }
  assert.equal(satchelReserveDebitIssue(initial().reservation, null),
    "original_reserve_debit_missing_or_inconsistent", "absent original debit");
});

test("the same journal proof precedes both independent review and first submission fence", () => {
  const ledger = readFileSync(new URL("../lib/warSatchelFundedLedger.ts", import.meta.url), "utf8");
  const review = ledger.slice(ledger.indexOf("export async function prepareSatchelWagerReview("),
    ledger.indexOf("function decodeWagerAuthorization("));
  assert.ok(review.includes("satchelReserveDebitIssue(r, journal)"),
    "initial reviewer may not overlook missing full debit");
  const attempt = ledger.slice(ledger.indexOf("export async function markSatchelSubmissionAttempt("),
    ledger.indexOf("export async function commitVerifiedSatchelAutoTicket("));
  const debitLoad = attempt.indexOf("satchelFundedJournal.findUnique({where:{sourceKey:reservation.id}})");
  const debitGuard = attempt.indexOf("satchelReserveDebitIssue(reservation,reserveJournal)");
  const nonceFence = attempt.indexOf("status: \"unknown_hold\"");
  assert.ok(debitLoad > 0 && debitGuard > debitLoad,
    "first send must reload the original immutable journal inside the locked transaction");
  assert.ok(nonceFence < 0 || nonceFence > debitGuard,
    "no submission fence before debit is rechecked");
  assert.ok(attempt.includes("reserveJournal.id.toString()!==a.snapshot.journalId"),
    "must use the exact journal source that was independently reviewed");
  const refund = readFileSync(new URL("../lib/warSatchelPrebroadcastReleaseEvidence.ts", import.meta.url), "utf8");
  assert.ok(refund.includes("satchelReserveDebitIssue("),
    "refund and review must not diverge on what original debit means");
});
