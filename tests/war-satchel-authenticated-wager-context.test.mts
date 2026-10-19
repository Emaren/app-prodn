import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertExpectedWarSatchelFinancialProof, financialProofFreshAt,
  type ExpectedWarSatchelFinancialProof,
} from "../lib/warSatchelAuthenticatedFinancialProof.ts";

// Exact public TEST reservation from Wolo's cross-language fixture. This is
// verified at its original issuance: authenticating a payment proof does not
// renew the execution window or authorize another broadcast.
const reservation = {
  version: 1, operation_id: "satchel:ticket:1", owner_id: "owner-1",
  vault: "wolo1dehxumnwdehxumnwdehxumnwdehxumnwep0k7e",
  recipient: "wolo1dahk7mm0dahk7mm0dahk7mm0dahk7mm0c3wh5c",
  amount_uwolo: "1000000", memo: "AoE2HDBets bet ticket v1 · ticket 1",
  reservation_digest: "48630f339617bfc7b2aef016fa87d8786ed6b4af44f4095efff2c22f5aa68953",
  ledger_revision: "a".repeat(64), consent_digest: "b".repeat(64), fee_uwolo: "5000",
  issued_at: 1799999999, expires_at: 1800000120,
  signature: "tDQduBhnMo38u8OrU0ZyFow1JvJ3recPWxAOTAEZT3ryMA+CyI5/QMZjHwa0NPQZTVhyr6c7j5WOjhMwREfhBQ==",
};
const key = "62a611b472d89b0e5fc93c069b9f700b4c552d55bc0e87b56008ef17b6b2bebe";
function expected(): ExpectedWarSatchelFinancialProof {
  return { kind: "wager", ownerUid: reservation.owner_id,
    operationId: reservation.operation_id, txHash: "C".repeat(64), vault: reservation.vault,
    requestPath: "/satchel/v1/proofs/operation", requestBody: {operation_id: reservation.operation_id},
    expectedContext: {protocol:1, kind:"wager", owner_id:reservation.owner_id,
      operation_id:reservation.operation_id, sender:reservation.vault,
      recipient:reservation.recipient, amount_uwolo:reservation.amount_uwolo,
      memo:reservation.memo, tx_hash:"C".repeat(64), reservation:{...reservation}},
  };
}
function check(x = expected(), publicKey = key) {
  return assertExpectedWarSatchelFinancialProof(x, publicKey);
}
function changedContext(patch: Record<string, unknown>) {
  const e = expected();
  return {...e, expectedContext:{...e.expectedContext, ...patch}};
}
function changedReservation(patch: Record<string, unknown>) {
  return changedContext({reservation:{...reservation, ...patch}});
}

test("signed original wager context is admitted only as an expectation, never authenticated JSON", () => {
  assert.doesNotThrow(() => check());
  assert.equal(check(), undefined);
  assert.equal(financialProofFreshAt(expected()), false);
  assert.equal(financialProofFreshAt({...expected(), consensus_authenticated:true, credit_authorized:true}), false);
});

test("wager proof lookup is original operation-only, never REST, return or caller hash routing", () => {
  for (const patch of [
    {requestPath:"/satchel/v1/proofs/return"},
    {requestPath:"https://attacker.invalid/txs"},
    {requestBody:{operation_id:"satchel:ticket:2"}},
    {requestBody:{operation_id:reservation.operation_id, tx_hash:"C".repeat(64)}},
    {requestBody:{}},
  ]) assert.throws(() => check({...expected(), ...patch} as ExpectedWarSatchelFinancialProof), /durable_wager_expectations_invalid/);
});

test("outer owner, vault, recipient, amount, memo and operation must agree with signed reservation", () => {
  const e = expected();
  for (const patch of [
    {ownerUid:"owner-2", expectedContext:{...e.expectedContext,owner_id:"owner-2"}},
    {operationId:"satchel:ticket:2", requestBody:{operation_id:"satchel:ticket:2"}, expectedContext:{...e.expectedContext,operation_id:"satchel:ticket:2"}},
    {vault:reservation.recipient, expectedContext:{...e.expectedContext,sender:reservation.recipient,recipient:reservation.vault}},
  ]) assert.throws(() => check({...e, ...patch}), /immutable_context_mismatch/);
  for (const patch of [
    {amount_uwolo:"2000000"}, {memo:"AoE2HDBets bet ticket v1 · ticket 2"},
    {recipient:reservation.vault}, {sender:reservation.recipient},
  ]) assert.throws(() => check(changedContext(patch)), /immutable_context_mismatch|durable_.*expectations_invalid/);
});

test("fees exist only inside exact Go reservation and cannot be changed or asserted separately", () => {
  assert.throws(() => check(changedReservation({fee_uwolo:"5001"})), /independent_signature_invalid/);
  for (const fee of ["0", "05000", "1000001", 5000]) {
    assert.throws(() => check(changedReservation({fee_uwolo:fee})), /invalid_economics/);
  }
  assert.throws(() => check(changedContext({fee_uwolo:"5000"})), /durable_wager_expectations_invalid/);
});

test("malformed, forged or aliased reservation never reaches authenticated proof admission", () => {
  for (const value of [null, [], {}, {...reservation,ownerId:reservation.owner_id}]) {
    assert.throws(() => check(changedContext({reservation:value})), /offline_receipt_malformed|noncanonical_fields/);
  }
  for (const patch of [
    {signature:"A".repeat(86)+"=="}, {signature:reservation.signature+"\n"},
    {reservation_digest:"0".repeat(64)}, {ledger_revision:"A".repeat(64)},
    {consent_digest:"c".repeat(64)}, {expires_at:reservation.issued_at+301},
    {issued_at:"1799999999"}, {amount_uwolo:1000000},
  ]) assert.throws(() => check(changedReservation(patch)), /invalid_economics|invalid_time_window|noncanonical_signature|independent_signature_invalid/);
});

test("independent public authority cannot be omitted or supplied by a proof context", () => {
  assert.throws(() => assertExpectedWarSatchelFinancialProof(expected()), /independent_public_key_invalid/);
  assert.throws(() => check(expected(), "f".repeat(64)), /independent_signature_invalid/);
  assert.throws(() => check(changedContext({approval_public_key_hex:key})), /durable_wager_expectations_invalid/);
  assert.equal(financialProofFreshAt({kind:"wager",verifiedAtMs:Date.now(),authenticatedHeadExpiresAtMs:Date.now()+30000}),false);
});

test("withdrawal requirements and protected founder claim889 remain unchanged", () => {
  const e = expected();
  assert.throws(() => check({...e,kind:"withdrawal",expectedContext:{...e.expectedContext,kind:"withdrawal"}}), /durable_withdrawal_expectations_invalid/);
  const returned: ExpectedWarSatchelFinancialProof = {...e,kind:"claim_return",
    requestPath:"/satchel/v1/proofs/return",requestBody:{claim_id:"889"},
    expectedContext:{...e.expectedContext,kind:"claim_return",sender:reservation.recipient,
      recipient:reservation.vault,return_approval:{claim_id:"889"}}};
  assert.throws(() => check(returned), /durable_return_expectations_invalid/);
});

test("new verifier pin and only real offline verifier can issue opaque financial evidence", () => {
  const source=readFileSync(new URL("../lib/warSatchelAuthenticatedFinancialProof.ts",import.meta.url),"utf8");
  assert.match(source,/d431c580a47ff020d997534145c5c53959c70c6f2d00d13029582ee8ec8709ac/);
  assert.doesNotMatch(source,/3c2f89936802d016a43efdb8b2ec914bd388e78e0b1251f76a837c793d5da92e/);
  assert.match(source,/await readWithdrawalReviewerKey\(\)/);
  assert.match(source,/await snapshotBinary\(/);
  assert.match(source,/await invoke\(binaryPath, \["verify-financial-proof"/);
  assert(source.indexOf("issued.add(result)")>source.indexOf("await invoke(binaryPath"));
});
