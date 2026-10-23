import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateOwnerDeposit, isAuthenticatedWarSatchelDeposit,
} from "../lib/warSatchelAuthenticatedDeposit.ts";

const sample = {
  intentId: "a1158a93-a5c8-48d6-9002-b72ecfb086b4",
  ownerUid: "player.with.dot", sender: "wolo1" + "q".repeat(42),
  vault: "wolo1" + "p".repeat(42),
  amountUwolo: "1000000",
  memo: "aoe2war/satchel/v1/player.with.dot/abcdefghijklmnopq",
  createdAtUtc: "2026-10-17T16:00:00.000Z",
  expiresAtUtc: "2026-10-17T16:30:00.000Z",
  txHash: "A".repeat(64),
};
type Reader = typeof fetch;
function neverNetwork() {
  let count = 0;
  const reader = (async () => {count++; throw Error("network_must_not_be_reached");}) as Reader;
  return {reader, count: () => count};
}

test("untrusted JSON or an exported receipt cannot impersonate the private symbol", () => {
  assert.equal(isAuthenticatedWarSatchelDeposit({
    ...sample, receiptId: "wolo-1:" + sample.txHash + ":0",
    height: BigInt(300), consensus_authenticated: true, credit_authorized: false,
  }), false);
});

test("offline deposit bridge rejects absent operator authority before any network", async () => {
  const names = [
    "WAR_SATCHEL_PROOF_VERIFIER_ENABLED",
    "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
    "WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS",
    "WAR_SATCHEL_SIGNER_AUTH_TOKEN",
    "WAR_SATCHEL_VERIFIER_BINARY",
    "WAR_SATCHEL_VERIFIER_SHA256",
    "WAR_SATCHEL_VERIFIER_AUTHORITY_FILE",
  ];
  const before = Object.fromEntries(names.map(k => [k,process.env[k]]));
  try {
    for (const k of names) delete process.env[k];
    const {reader,count} = neverNetwork();
    await assert.rejects(authenticateOwnerDeposit(sample,reader), /operator_proof_authority_not_certified/);
    assert.equal(count(),0);
    process.env.WAR_SATCHEL_PROOF_VERIFIER_ENABLED = "true";
    process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED = "true";
    process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS = sample.vault;
    await assert.rejects(authenticateOwnerDeposit(sample,reader), /pinned_offline_verifier_not_provisioned/);
    assert.equal(count(),0);
  } finally {
    for (const k of names) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
});

test("malformed owner, amount, source, tx, memo and unbounded intent never trigger IO", async () => {
  const cases = [
    {...sample, ownerUid:"bad owner"},
    {...sample, sender:sample.vault},
    {...sample, amountUwolo:"0"},
    {...sample, amountUwolo:"-1000"},
    {...sample, memo:"arbitrary memo"},
    {...sample, txHash:"B"},
    {...sample, expiresAtUtc:"2026-10-17T16:31:00.000Z"},
    {...sample, createdAtUtc:"nonsense"},
  ];
  const {reader,count}=neverNetwork();
  for(const item of cases){
    await assert.rejects(authenticateOwnerDeposit(item,reader), /durable_deposit_expectations_invalid/);
  }
  assert.equal(count(),0);
});

test("the source-level custody hold remains an immutable explicit hard stop", async () => {
  const {SATCHEL_FINANCIAL_BRIDGE_READY} = await import("../lib/warSatchelFinancialBridgeHold.ts");
  assert.equal(SATCHEL_FINANCIAL_BRIDGE_READY,false);
});
