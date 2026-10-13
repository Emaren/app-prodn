import assert from "node:assert/strict";
import test from "node:test";
import {
  projectWarSatchelResearch,
  WAR_SATCHEL_MAX_GAME_UWOLO,
  type WarSatchelResearchEvent,
} from "../lib/warSatchelAccountingResearch.ts";

const uid = "owner-1";
const deposit = (amountUwolo = "2000000000", receiptId = "tx-deposit:0", id = "deposit-1"): WarSatchelResearchEvent =>
  ({ kind: "verified_deposit", ownerUid: uid, id, chainId: "wolo-1", denom: "uwolo", receiptId, amountUwolo });
const reserve = (amountUwolo = "500000000", reservationId = "reserve-1", gameId = "game-101"): WarSatchelResearchEvent =>
  ({ kind: "reserve", ownerUid: uid, id: "event-" + reservationId, reservationId, gameId, policyVersion: 1, amountUwolo });
const release = (reservationId = "reserve-1"): WarSatchelResearchEvent =>
  ({ kind: "release", ownerUid: uid, id: "release-" + reservationId, reservationId, reason: "unmatched" });
const commit = (reservationId = "reserve-1", acceptedTicketId = "ticket-1"): WarSatchelResearchEvent =>
  ({ kind: "commit", ownerUid: uid, id: "commit-" + reservationId, reservationId, acceptedTicketId });

test("one verified deposit and unmatched release conserve every uwolo with zero fee", () => {
  const state = projectWarSatchelResearch(uid, [deposit(), reserve(), release()]);
  assert.equal(state.availableUwolo, "2000000000");
  assert.equal(state.reservedUwolo, "0");
  assert.equal(state.committedUwolo, "0");
  assert.equal(state.lifetimeVerifiedDepositUwolo, "2000000000");
});

test("future ticket consumption and proven partial/full refunds cannot mint extra WOLO", () => {
  const p = [deposit(), reserve(), commit()] as WarSatchelResearchEvent[];
  const after = projectWarSatchelResearch(uid, p);
  assert.equal(after.availableUwolo, "1500000000");
  assert.equal(after.committedUwolo, "500000000");
  const refund = (id: string, receiptId: string, amountUwolo: string): WarSatchelResearchEvent => ({
    kind: "verified_refund", ownerUid: uid, id, receiptId,
    chainId: "wolo-1", denom: "uwolo", acceptedTicketId: "ticket-1", amountUwolo,
  });
  const full = projectWarSatchelResearch(uid, [...p, refund("refund-1", "tx-refund:0", "300000000"), refund("refund-2", "tx-refund:1", "200000000")]);
  assert.equal(full.availableUwolo, "2000000000");
  assert.equal(full.committedUwolo, "0");
  assert.throws(() => projectWarSatchelResearch(uid, [...p, refund("refund-1", "tx-refund:0", "500000001")]), /exceeds committed/);
});

test("idempotent retry of exact event does not duplicate funds; receipt reuse never credits twice", () => {
  const same = deposit();
  const state = projectWarSatchelResearch(uid, [same, { ...same }]);
  assert.equal(state.availableUwolo, "2000000000");
  assert.equal(state.uniqueEventCount, 1);
  assert.throws(() => projectWarSatchelResearch(uid, [same, { ...same, amountUwolo: "123" }]), /collision/);
  assert.throws(() => projectWarSatchelResearch(uid, [same, deposit("100", "tx-deposit:0", "deposit-2")]), /receipt has already/);
});

test("fail closed on external ledger identity, denomination, malformed amounts and wrong chain", () => {
  assert.throws(() => projectWarSatchelResearch(uid, [{ ...deposit(), ownerUid: "other" }]), /Cross-owner/);
  assert.throws(() => projectWarSatchelResearch(uid, [{ ...deposit(), chainId: "cosmoshub-4" }]), /Wrong chain/);
  assert.throws(() => projectWarSatchelResearch(uid, [{ ...deposit(), denom: "wolo" }]), /Wrong chain/);
  for (const amountUwolo of ["0", "-1", "01", "1.5", "abc", "9".repeat(80)]) {
    assert.throws(() => projectWarSatchelResearch(uid, [deposit(amountUwolo)]), /positive canonical/);
  }
});

test("reserve is owner-bounded, versioned per canonical game and capped at 1,000 WOLO", () => {
  assert.equal(WAR_SATCHEL_MAX_GAME_UWOLO, BigInt(1_000_000_000));
  assert.throws(() => projectWarSatchelResearch(uid, [deposit(), reserve(), { ...release(), reason: "arbitrary_fee" } as unknown as WarSatchelResearchEvent]), /Unknown release reason/);
  assert.throws(() => projectWarSatchelResearch(uid, [deposit("100"), reserve()]), /Insufficient/);
  assert.throws(() => projectWarSatchelResearch(uid, [deposit("2000000000"), reserve("1000000001")]), /Per-game cap/);
  const sameGameDifferentReservation: WarSatchelResearchEvent = {
    kind: "reserve", id: "event-reserve-2", ownerUid: uid,
    reservationId: "reserve-2", gameId: "game-101", policyVersion: 1, amountUwolo: "100",
  };
  assert.throws(() => projectWarSatchelResearch(uid, [deposit(), reserve(), sameGameDifferentReservation]), /Duplicate reservation or game policy/);
  const otherVersion = { ...sameGameDifferentReservation, policyVersion: 2 };
  const state = projectWarSatchelResearch(uid, [deposit(), reserve(), otherVersion]);
  assert.equal(state.reservedUwolo, "500000100");
});

test("concurrent-like double settle, cancel and ticket reuse are rejected", () => {
  assert.throws(() => projectWarSatchelResearch(uid, [deposit(), reserve(), release(), commit()]), /not available to commit/);
  assert.throws(() => projectWarSatchelResearch(uid, [deposit(), reserve(), commit(), release()]), /not available to release/);
  const another: WarSatchelResearchEvent = {
    kind: "reserve", ownerUid: uid, id: "event-reserve-2",
    reservationId: "reserve-2", gameId: "game-102", policyVersion: 1, amountUwolo: "10",
  };
  const reuse: WarSatchelResearchEvent = { kind: "commit", ownerUid: uid, id: "commit-reserve-2", reservationId: "reserve-2", acceptedTicketId: "ticket-1" };
  assert.throws(() => projectWarSatchelResearch(uid, [deposit(), reserve(), commit(), another, reuse]), /Duplicate accepted ticket/);
});

test("withdraw hold, chain-confirmed finality and cancellation conserve the satchel balance", () => {
  const hold: WarSatchelResearchEvent = { kind: "withdraw_hold", ownerUid: uid, id: "hold-1", withdrawalId: "withdraw-1", amountUwolo: "800000000" };
  const settle: WarSatchelResearchEvent = {
    kind: "withdraw_confirmed", ownerUid: uid, id: "settle-1", withdrawalId: "withdraw-1",
    receiptId: "tx-withdraw:0", chainId: "wolo-1", denom: "uwolo",
  };
  const paused = projectWarSatchelResearch(uid, [deposit(), hold]);
  assert.equal(paused.availableUwolo, "1200000000");
  assert.equal(paused.withdrawalPendingUwolo, "800000000");
  const done = projectWarSatchelResearch(uid, [deposit(), hold, settle]);
  assert.equal(done.withdrawalPendingUwolo, "0");
  assert.equal(done.withdrawnUwolo, "800000000");
  const cancel: WarSatchelResearchEvent = { kind: "withdraw_cancelled", ownerUid: uid, id: "cancel-1", withdrawalId: "withdraw-1" };
  assert.equal(projectWarSatchelResearch(uid, [deposit(), hold, cancel]).availableUwolo, "2000000000");
  assert.throws(() => projectWarSatchelResearch(uid, [deposit(), hold, settle, cancel]), /not pending/);
  assert.throws(() => projectWarSatchelResearch(uid, [deposit(), hold, cancel, settle]), /not pending/);
  assert.throws(() => projectWarSatchelResearch(uid, [deposit("100"), hold]), /Insufficient/);
});
