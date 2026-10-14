import assert from "node:assert/strict";
import test from "node:test";
import { readOnlyWarSatchelChainCandidate } from "../lib/warSatchelReadOnlyChainAdapter.ts";
import { satchelDepositMemo } from "../lib/warSatchelCustodyEvidence.ts";

const wallet = "wolo1" + "q".repeat(38);
const vault = "wolo1" + "p".repeat(38);
const betVault = "wolo1" + "z".repeat(38);
const memo = satchelDepositMemo("warrior-11", "n".repeat(24));
const hash = "A".repeat(64);

function fixture() {
  const now = Date.now();
  const created = new Date(now - 8 * 60_000).toISOString();
  const expires = new Date(now + 12 * 60_000).toISOString();
  const txAt = new Date(now - 6 * 60_000).toISOString();
  const proof = {
    ok: true, deposit_found: true, escrow_address: vault,
    expected_sender: wallet, expected_amount_uwolo: "200000000",
    lookup: {
      ok: true, found: true, chain_id: "wolo-1", tx_hash: hash,
      tx_success: true, code: 0, height: "10420",
      timestamp: txAt, memo, matched_expected: true,
      matching_transfer_count: 1, matched_transfer_index: 0,
      matched_transfer: { sender: wallet, recipient: vault, amount: "200000000", denom: "uwolo" },
      transfers: [{ sender: wallet, recipient: vault, amount: "200000000", denom: "uwolo" }],
    },
  };
  const responses: Record<string, unknown> = {
    health: { ok: true, chain_id: "wolo-1" },
    status: { result: { node_info: { network: "wolo-1" }, sync_info: {
      catching_up: false, latest_block_height: "10422",
    } } },
    proof,
  };
  const fetched: string[] = [];
  const reader = async (url: string, init: RequestInit) => {
    fetched.push(url);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.ok(url.startsWith("http://127.0.0.1:"));
    if (url.endsWith("/settlement/v1/health")) return Response.json(responses.health);
    if (url.endsWith("/status")) return Response.json(responses.status);
    if (url.includes("/escrow/txs/")) return Response.json(responses.proof);
    throw new Error("unexpected endpoint");
  };
  const query = {
    intent: { ownerUid: "warrior-11", senderAddress: wallet, vaultAddress: vault,
      amountUwolo: "200000000", memo, chainId: "wolo-1", nonce: "n".repeat(24),
      createdAt: created, expiresAt: expires },
    authenticatedUid: "warrior-11",
    authenticatedWalletAddress: wallet,
    claimedTxHash: hash,
  };
  return { reader, responses, query, fetched, proof };
}

function allowReadonlyEvidence() {
  process.env.WAR_SATCHEL_PROOF_AUDIT_ENABLED = "true";
  process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS = vault;
  process.env.WOLO_BET_ESCROW_ADDRESS = betVault;
  process.env.WOLO_CHALLENGE_ESCROW_ADDRESS = betVault;
}

test("off by default, including no accidental network call", async () => {
  const x = fixture();
  delete process.env.WAR_SATCHEL_PROOF_AUDIT_ENABLED;
  await assert.rejects(readOnlyWarSatchelChainCandidate(x.query, x.reader), /read-only audit feature disabled/);
  assert.equal(x.fetched.length, 0);
});

test("trusted local health, canonical head and exact unique receipt yields only uncredited evidence", async () => {
  allowReadonlyEvidence();
  const x = fixture();
  const result = await readOnlyWarSatchelChainCandidate(x.query, x.reader);
  assert.equal(result.kind, "uncredited_deposit_candidate");
  assert.equal(result.receiptKey, "wolo-1:" + hash + ":0");
  assert.equal(result.confirmations, "3");
  assert.equal(result.evidenceOrigin, "pinned_local_escrow_and_canonical_rpc");
  assert.equal(result.creditAuthorized, false);
  assert.equal(result.wagerAuthorized, false);
  assert.equal(result.mutationPerformed, false);
  assert.equal(x.fetched.length, 3);
  assert.ok(x.fetched[2].includes("expected_sender=" + wallet));
});

test("missing or shared custody vault blocks before contacting either chain service", async () => {
  allowReadonlyEvidence();
  const x = fixture();
  process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS = betVault;
  await assert.rejects(readOnlyWarSatchelChainCandidate(x.query, x.reader), /cannot reuse betting/);
  assert.equal(x.fetched.length, 0);
  process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS = vault;
  process.env.WOLO_BET_ESCROW_ADDRESS = "";
  delete process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS;
  await assert.rejects(readOnlyWarSatchelChainCandidate(x.query, x.reader), /missing certified vault/);
  assert.equal(x.fetched.length, 0);
});

test("wrong owner, wallet and amount cannot reach chain proof", async () => {
  allowReadonlyEvidence();
  for (const corrupt of [
    (x: ReturnType<typeof fixture>) => { x.query.authenticatedUid = "other"; },
    (x: ReturnType<typeof fixture>) => { x.query.authenticatedWalletAddress = betVault; },
    (x: ReturnType<typeof fixture>) => { x.query.intent.amountUwolo = "0"; },
    (x: ReturnType<typeof fixture>) => { x.query.intent.vaultAddress = betVault; },
    (x: ReturnType<typeof fixture>) => { x.query.claimedTxHash = "bogus"; },
  ]) {
    const x = fixture();
    corrupt(x);
    await assert.rejects(readOnlyWarSatchelChainCandidate(x.query, x.reader), /SATCHEL_CHAIN_READ_REFUSED/);
    assert.equal(x.fetched.length, 0);
  }
});

test("wrong chain, syncing head, missing health and failed transaction all refuse evidence", async () => {
  allowReadonlyEvidence();
  for (const corrupt of [
    (x: ReturnType<typeof fixture>) => { (x.responses.health as any).ok = false; },
    (x: ReturnType<typeof fixture>) => { (x.responses.health as any).chain_id = "cosmoshub-4"; },
    (x: ReturnType<typeof fixture>) => { (x.responses.status as any).result.node_info.network = "cosmoshub-4"; },
    (x: ReturnType<typeof fixture>) => { (x.responses.status as any).result.sync_info.catching_up = true; },
    (x: ReturnType<typeof fixture>) => { (x.responses.status as any).result.sync_info.latest_block_height = "10420"; },
    (x: ReturnType<typeof fixture>) => { x.proof.lookup.tx_success = false; },
    (x: ReturnType<typeof fixture>) => { x.proof.lookup.code = 7; },
    (x: ReturnType<typeof fixture>) => { x.proof.lookup.transfers[0].denom = "ufake"; },
    (x: ReturnType<typeof fixture>) => { x.proof.lookup.transfers.push({ ...x.proof.lookup.transfers[0] }); },
  ]) {
    const x = fixture();
    corrupt(x);
    await assert.rejects(readOnlyWarSatchelChainCandidate(x.query, x.reader));
  }
});

test("canonical reader rejects unavailable, failed, malformed and oversized HTTP responses", async () => {
  allowReadonlyEvidence();
  for (const reader of [
    async () => { throw new Error("offline"); },
    async () => new Response("not found", { status: 404 }),
    async () => new Response("no-json", { status: 200 }),
    async () => new Response("x".repeat(1024 * 1024 + 1), { status: 200 }),
  ]) {
    const x = fixture();
    await assert.rejects(readOnlyWarSatchelChainCandidate(x.query, reader),
      /SATCHEL_CHAIN_READ_REFUSED/);
  }
});
