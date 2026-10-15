import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inspectCanonicalSatchelDeposit } from "../lib/warSatchelCanonicalReceipt.ts";

const uid = "warrior:alpha";
const wallet = "wolo1" + "q".repeat(38);
const vault = "wolo1" + "p".repeat(38);
const hash = "AB".repeat(32);
const memo = "aoe2war/satchel/v1/" + uid + "/" + "n".repeat(32);
const intent = {
  id: "11111111-1111-4111-8111-111111111111",
  chainId: "wolo-1", senderAddress: wallet, vaultAddress: vault,
  amountUwolo: "100000000", memo, status: "prepared",
  createdAtUtc: "2026-10-15T04:00:00.000Z",
  expiresAtUtc: "2026-10-15T04:30:00.000Z",
};
const head = {
  result: { node_info: { network: "wolo-1" },
    sync_info: { catching_up: false, latest_block_height: "300" } },
};
function tx(overrides: Record<string, unknown> = {}) {
  return { tx_response: {
    txhash: hash, code: 0, height: "296",
    timestamp: "2026-10-15T04:01:00Z",
    tx: { body: { memo,
      messages: [{ "@type": "/cosmos.bank.v1beta1.MsgSend",
        from_address: wallet, to_address: vault, amount: [{ denom: "uwolo", amount: "100000000" }] }] } },
    ...overrides,
  } };
}
function inspect(overrides: Record<string, unknown> = {}) {
  return inspectCanonicalSatchelDeposit({
    immutableIntent: intent, ownerUid: uid, ownerWallet: wallet,
    certifiedVault: vault, hash, chainStatus: head,
    txResponse: tx(), nowUtc: "2026-10-15T04:07:00.000Z",
    ...overrides,
  });
}

test("canonical wolo send has precise owner, memo, amount, vault, finality; returns no money authority", () => {
  const proof = inspect();
  assert.equal(proof.receiptKey, "wolo-1:" + hash + ":0");
  assert.equal(proof.confirmations, "5");
  assert.equal(proof.canonicalSendCount, 1);
  assert.equal(proof.creditAuthorized, false);
  assert.equal(proof.depositAuthorized, false);
  assert.equal(proof.wagerAuthorized, false);
  assert.equal(proof.kind, "canonical_chain_candidate_uncredited");
});

test("rejects every cross-owner, wrong-vault, failed tx or equivocal chain response", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["other owner UID", { ownerUid: "impostor" }],
    ["other owner wallet", { ownerWallet: "wolo1" + "r".repeat(38) }],
    ["other certified vault", { certifiedVault: wallet }],
    ["wrong hash", { hash: "CD".repeat(32) }],
    ["wrong chain", { chainStatus: { result: { ...head.result, node_info: { network: "testnet" } } } }],
    ["syncing chain", { chainStatus: { result: { ...head.result, sync_info: { ...head.result.sync_info, catching_up: true } } } }],
    ["not final", { chainStatus: { result: { ...head.result, sync_info: { catching_up: false, latest_block_height: "297" } } } }],
    ["failed execution", { txResponse: tx({ code: 6 }) }],
    ["fraudulent tx hash", { txResponse: tx({ txhash: "CD".repeat(32) }) }],
    ["outside intent lifetime", { txResponse: tx({ timestamp: "2026-10-15T04:31:00Z" }) }],
    ["no real tx body", { txResponse: tx({ tx: { body: { memo, messages: [] } } }) }],
    ["wrong memo", { txResponse: tx({ tx: { body: { memo: "other", messages: [] } } }) }],
  ];
  for (const [label, change] of bad) {
    assert.throws(() => inspect(change), /SATCHEL_CANONICAL_AUDIT_REFUSED/, label);
  }
});

test("does not treat mixed or duplicated transfers as one approved credit", () => {
  const correct = {
    "@type": "/cosmos.bank.v1beta1.MsgSend",
    from_address: wallet, to_address: vault,
    amount: [{ denom: "uwolo", amount: "100000000" }],
  };
  for (const candidate of [
    [correct, correct],
    [{ ...correct, to_address: wallet }],
    [{ ...correct, from_address: vault }],
    [{ ...correct, amount: [{ denom: "uatom", amount: "100000000" }] }],
    [{ ...correct, amount: [{ denom: "uwolo", amount: "99000000" }] }],
    [{ ...correct, amount: [...correct.amount, { denom: "uatom", amount: "1" }] }],
  ]) {
    assert.throws(() => inspect({
      txResponse: tx({ tx: { body: { memo, messages: candidate } } }),
    }), /SATCHEL_CANONICAL_AUDIT_REFUSED/);
  }
});

test("public route remains nonfundable, authenticated, strict-URL, bounded, and write-free", () => {
  const route = readFileSync("app/api/user/war-satchel/deposit-evidence/route.ts", "utf8");
  assert.match(route, /WAR_SATCHEL_CANONICAL_RECEIPT_AUDIT_ENABLED !== "true"/);
  assert.match(route, /WAR_SATCHEL_OWNER_PROOF_ENABLED !== "true"/);
  assert.match(route, /getSessionUid\(request\)/);
  assert.match(route, /userId: owner.id/);
  assert.match(route, /senderAddress: owner.walletAddress/);
  assert.match(route, /vaultAddress: vault, status: "prepared"/);
  assert.match(route, /redirect: "error"/);
  assert.match(route, /readWarSatchelBoundedUtf8\(response.body, LIMIT\)/);
  assert.match(route, /state: recorded\\?\\.state \\|\\| "CANONICAL_EVIDENCE_ONLY_UNCREDITED"/);
  assert.match(route, /creditAuthorized: false, wagerAuthorized: false/);
  assert.doesNotMatch(route, /signAndBroadcast|sendTokens|executeWoloPayout|\.create\(|\.update\(|\.delete\(|BetStakeTicket/);
  assert.doesNotMatch(route, /vaultAddress: vault, transferMemo: /);
});
