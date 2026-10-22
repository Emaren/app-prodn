import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import test from "node:test";
import {
  wagerReservationSignBytes, verifyIndependentWagerReservation,
  type SatchelWagerReservation, type SatchelWagerReservationContext,
} from "../lib/warSatchelWagerReservation.ts";

// Exact fixture from WoloChain internal/satchelservice/testdata/wager-reservation-v1.json.
// These are PUBLIC TEST bytes and confer no mainnet authority.
const fixture: SatchelWagerReservation = {
  version: 1, operation_id: "satchel:ticket:1", owner_id: "owner-1",
  vault: "wolo1dehxumnwdehxumnwdehxumnwdehxumnwep0k7e",
  recipient: "wolo1dahk7mm0dahk7mm0dahk7mm0dahk7mm0c3wh5c",
  amount_uwolo: "1000000", memo: "AoE2HDBets bet ticket v1 · ticket 1",
  reservation_digest: "48630f339617bfc7b2aef016fa87d8786ed6b4af44f4095efff2c22f5aa68953",
  ledger_revision: "a".repeat(64), consent_digest: "b".repeat(64), fee_uwolo: "5000",
  issued_at: 1799999999, expires_at: 1800000120,
  signature: "tDQduBhnMo38u8OrU0ZyFow1JvJ3recPWxAOTAEZT3ryMA+CyI5/QMZjHwa0NPQZTVhyr6c7j5WOjhMwREfhBQ==",
};
const fixtureKey = "62a611b472d89b0e5fc93c069b9f700b4c552d55bc0e87b56008ef17b6b2bebe";
const fixtureBytes = '["aoe2war/satchel/wager-reservation/v1",1,"wolo-1","uwolo","satchel:ticket:1","owner-1","wolo1dehxumnwdehxumnwdehxumnwdehxumnwep0k7e","wolo1dahk7mm0dahk7mm0dahk7mm0dahk7mm0c3wh5c","1000000","AoE2HDBets bet ticket v1 · ticket 1","48630f339617bfc7b2aef016fa87d8786ed6b4af44f4095efff2c22f5aa68953","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","5000",1799999999,1800000120]';
const now = 1800000000000;
function context(a: SatchelWagerReservation = fixture): SatchelWagerReservationContext {
  return { operationId: a.operation_id, ownerUid: a.owner_id, vault: a.vault,
    recipient: a.recipient, amountUwolo: a.amount_uwolo, memo: a.memo,
    reservationDigest: a.reservation_digest, ledgerRevision: a.ledger_revision,
    consentDigest: a.consent_digest, feeUwolo: a.fee_uwolo,
    issuedAt: a.issued_at, expiresAt: a.expires_at };
}
const testKey = createPrivateKey({ format: "der", type: "pkcs8", key: Buffer.concat([
  Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.alloc(32, 7),
]) });
const testPublicKey = createPublicKey(testKey).export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
function signed(patch: Partial<SatchelWagerReservation> = {}): SatchelWagerReservation {
  const value = { ...fixture, ...patch };
  return { ...value, signature: sign(null, wagerReservationSignBytes(value), testKey).toString("base64") };
}
const verifyFixture = (value: unknown, expected = context(), key = fixtureKey, time = now) =>
  verifyIndependentWagerReservation(value, expected, key, time);

test("Go cross-language signing bytes and existing Ed25519 fixture agree exactly", () => {
  assert.equal(wagerReservationSignBytes(fixture).toString("utf8"), fixtureBytes);
  const verified = verifyFixture(fixture);
  assert.deepEqual(verified, fixture);
  assert(Object.isFrozen(verified));
  assert.notEqual(verified, fixture, "verification returns a stable snapshot");
});

test("valid independent review remains bound to every original immutable field", () => {
  const cases: Array<[keyof SatchelWagerReservationContext, unknown]> = [
    ["operationId", "satchel:ticket:2"], ["ownerUid", "owner-2"],
    ["vault", fixture.recipient], ["recipient", fixture.vault],
    ["amountUwolo", "2000000"], ["memo", "AoE2HDBets bet ticket v1 · ticket 2"],
    ["reservationDigest", "c".repeat(64)], ["ledgerRevision", "c".repeat(64)],
    ["consentDigest", "c".repeat(64)], ["feeUwolo", "5001"],
    ["issuedAt", fixture.issued_at - 1], ["expiresAt", fixture.expires_at - 1],
  ];
  for (const [field, replacement] of cases) {
    assert.throws(() => verifyFixture(fixture, { ...context(), [field]: replacement }),
      /immutable_context_mismatch/, field);
  }
});

test("changing approval and expected context together cannot forge owner, memo, fee or hold", () => {
  for (const patch of [
    { owner_id: "owner-2" }, { operation_id: "satchel:ticket:2" },
    { memo: "AoE2HDBets bet ticket v1 · ticket 2" }, { amount_uwolo: "2000000" },
    { fee_uwolo: "6000" }, { reservation_digest: "c".repeat(64) },
    { ledger_revision: "c".repeat(64) }, { consent_digest: "c".repeat(64) },
  ]) {
    const changed = { ...fixture, ...patch };
    assert.throws(() => verifyFixture(changed, context(changed)), /independent_signature_invalid/);
  }
  assert.throws(() => verifyFixture(fixture, context(), testPublicKey), /independent_signature_invalid/);
});

test("exact second boundary and short maximum execution window are enforced", () => {
  const value = signed({ issued_at: 1800000000, expires_at: 1800000300 });
  const verifyAt = (ms: number) => verifyIndependentWagerReservation(value, context(value), testPublicKey, ms);
  assert.doesNotThrow(() => verifyAt(now));
  assert.doesNotThrow(() => verifyAt(now + 299999));
  assert.throws(() => verifyAt(now - 1), /expired_or_future_review/);
  assert.throws(() => verifyAt(now + 300000), /expired_or_future_review/);
  for (const patch of [
    { issued_at: -1 }, { issued_at: 1.5 }, { issued_at: Number.NaN },
    { expires_at: 1800000301 }, { expires_at: 1800000000 },
    { expires_at: Number.MAX_SAFE_INTEGER }, { expires_at: Infinity },
  ]) {
    const bad = { ...value, ...patch };
    assert.throws(() => verifyIndependentWagerReservation(bad, context(bad), testPublicKey, now), /invalid_time_window/);
  }
  for (const ms of [NaN, Infinity, -1, now + 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => verifyAt(ms), /expired_or_future_review/);
  }
});

test("canonical decimal, int64 and new exact whole-WOLO 10000/game ceiling fail closed", () => {
  for (const amount of ["0", "01", "1e6", "+1000000", "1000000.0", "1000001",
    "10001000000", "9223372036854775808", "9".repeat(1000), 1000000, null]) {
    assert.throws(() => verifyFixture({ ...fixture, amount_uwolo: amount }), /invalid_economics/);
  }
  const ceiling = signed({ amount_uwolo: "10000000000" });
  const previouslyCapped = signed({ amount_uwolo: "1001000000" });
  assert.doesNotThrow(() => verifyIndependentWagerReservation(previouslyCapped, context(previouslyCapped), testPublicKey, now));
  assert.doesNotThrow(() => verifyIndependentWagerReservation(ceiling, context(ceiling), testPublicKey, now));
  for (const fee of ["0", "05000", "5000.0", "1000001", "9223372036854775808", 5000, null]) {
    assert.throws(() => verifyFixture({ ...fixture, fee_uwolo: fee }), /invalid_economics/);
  }
});

test("only canonical nonzero digests and exact wager identity/address/memo survive validation", () => {
  for (const field of ["reservation_digest", "ledger_revision", "consent_digest"] as const) {
    for (const digest of ["0".repeat(64), "A".repeat(64), "a".repeat(63), "a".repeat(65), null]) {
      assert.throws(() => verifyFixture({ ...fixture, [field]: digest }), /invalid_economics/);
    }
  }
  for (const patch of [
    { version: 2 }, { owner_id: "owner/2" }, { owner_id: "x".repeat(101) },
    { operation_id: "satchel:ticket:01" }, { operation_id: "satchel:ticket:1000000000000" },
    { vault: fixture.vault.toUpperCase() }, { recipient: fixture.vault },
    { recipient: "wolo1" + "p".repeat(38) },
    { memo: fixture.memo + "\n" }, { memo: "other memo" },
  ]) assert.throws(() => verifyFixture({ ...fixture, ...patch }), /invalid_economics/);
});

test("strict canonical Ed25519 key and padded standard base64 refuse aliases and oversized input", () => {
  for (const key of ["", "0".repeat(64), fixtureKey.toUpperCase(), fixtureKey + "00", "f".repeat(63)]) {
    assert.throws(() => verifyFixture(fixture, context(), key), /independent_public_key_invalid/);
  }
  for (const signature of ["", fixture.signature + "\n", fixture.signature.slice(0, -2),
    fixture.signature.replaceAll("+", "-"), "A".repeat(100000), "A".repeat(86) + "==", null]) {
    assert.throws(() => verifyFixture({ ...fixture, signature }), /noncanonical_signature|independent_signature_invalid/);
  }
  // Base64 decoder would ignore nonzero padding bits without round-trip check.
  const noncanonical = fixture.signature.slice(0, -3) + "R==";
  assert.throws(() => verifyFixture({ ...fixture, signature: noncanonical }), /noncanonical_signature/);
});

test("unknown, missing, aliased, inherited, hidden or accessor fields are not JSON authority", () => {
  for (const bad of [null, [], { ...fixture, ownerId: fixture.owner_id },
    { ...fixture, fee_uwolo: undefined }, { ...fixture, extra: true }]) {
    assert.throws(() => verifyFixture(bad), /noncanonical_fields|invalid_economics/);
  }
  const missing: Record<string, unknown> = { ...fixture };
  delete missing.signature;
  assert.throws(() => verifyFixture(missing), /noncanonical_fields/);
  const inherited = Object.assign(Object.create({}), fixture);
  assert.throws(() => verifyFixture(inherited), /noncanonical_fields/);
  const accessor = { ...fixture };
  Object.defineProperty(accessor, "owner_id", { enumerable: true, get: () => { throw Error("getter ran"); } });
  assert.throws(() => verifyFixture(accessor), /noncanonical_fields/);
  const hidden = { ...fixture };
  Object.defineProperty(hidden, "extra", { value: true });
  assert.throws(() => verifyFixture(hidden), /noncanonical_fields/);
  assert.throws(() => verifyFixture(fixture, { ...context(), signer: "bearer" } as SatchelWagerReservationContext), /noncanonical_fields/);
});

test("another operation, hold, owner or ledger revision cannot reuse an authentic approval", () => {
  const first = verifyFixture(fixture);
  for (const expected of [
    { ...context(), operationId: "satchel:ticket:2" },
    { ...context(), reservationDigest: "c".repeat(64) },
    { ...context(), ownerUid: "owner-2" },
    { ...context(), ledgerRevision: "c".repeat(64) },
  ]) assert.throws(() => verifyFixture(first, expected), /immutable_context_mismatch/);
  // Same-object verification is deterministic, not a substitute for the
  // caller's durable one-use attempt journal or permission to broadcast again.
  assert.deepEqual(verifyFixture(first), first);
});
