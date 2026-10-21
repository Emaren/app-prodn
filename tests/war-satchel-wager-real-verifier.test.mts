import assert from "node:assert/strict";
import {createHash, generateKeyPairSync, sign} from "node:crypto";
import {mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  authenticateWarSatchelFinancialProof, assertExpectedWarSatchelFinancialProof, financialProofFreshAt,
  type ExpectedWarSatchelFinancialProof,
} from "../lib/warSatchelAuthenticatedFinancialProof.ts";
import {
  assertAuthenticatedSatchelWager, buildSatchelWagerAuthorization,
  wagerFinancialContext, wagerFinancialContextDigest,
  type SatchelWagerSnapshot,
} from "../lib/warSatchelWagerAuthorization.ts";
import {wagerReservationSignBytes, type SatchelWagerReservation} from "../lib/warSatchelWagerReservation.ts";

// Real signed SDK bank execution and Comet commits, but exclusively synthetic
// validator/reviewer authority. This never proves mainnet custody, player
// admission, ledger credit or a production reviewer service.
test("real SDK wager authenticates through the pinned offline financial verifier", {
  skip: process.env.RUN_SATCHEL_REAL_CREDIT_TESTS !== "1",
}, async t => {
  const binary = process.env.SATCHEL_TEST_BINARY!;
  const fixture = JSON.parse(readFileSync(path.join(path.dirname(binary), "isolated-sdk-proof.json"), "utf8"));
  assert.equal(fixture.fixture_only, true); assert.equal(fixture.mainnet_authority, false);
  const intent = fixture.intent, observation = fixture.transfer_observation;
  const txHash: string = observation.TxHash;
  const memo = "AoE2HDBets bet ticket v1 · ticket 1";
  assert.equal(intent.Memo, memo); assert.equal(intent.AmountUWolo, "12000000");
  assert.equal(observation.TransferIndex, 1, "actual SDK ante fee precedes the one bank-send effect");
  const root = realpathSync(mkdtempSync("/tmp/hd-wager-real-proof-"));
  // Ephemeral TEST reviewer, unrelated to production signers or keyrings.
  const {privateKey, publicKey} = generateKeyPairSync("ed25519");
  const publicKeyHex = publicKey.export({format: "der", type: "spki"}).subarray(-32).toString("hex");
  // THREE physically distinct public authority files: the Go offline
  // signed-wager proof, the wager reviewer, and the withdrawal reviewer.
  const authority = path.join(root, "synthetic-wager-financial-proof.json");
  const wagerRole = path.join(root, "synthetic-wager-approval-public.json");
  const withdrawalRole = path.join(root, "synthetic-withdrawal-approval-public.json");
  const withdrawalKeyHex = generateKeyPairSync("ed25519").publicKey
    .export({format: "der", type: "spki"}).subarray(-32).toString("hex");
  assert.notEqual(withdrawalKeyHex,publicKeyHex);
  const nativeAuthority={trust_anchor: fixture.anchor, vault: intent.Sender,
    betting_escrow: intent.Vault, approval_public_key_hex: withdrawalKeyHex,
    wager_approval_public_key_hex: publicKeyHex};
  writeFileSync(authority, JSON.stringify(nativeAuthority), {mode: 0o600});
  writeFileSync(wagerRole,JSON.stringify({wager_approval_public_key_hex:publicKeyHex}),{mode:0o600});
  writeFileSync(withdrawalRole,JSON.stringify({approval_public_key_hex:withdrawalKeyHex}),{mode:0o600});
  Object.assign(process.env, {WAR_SATCHEL_PROOF_VERIFIER_ENABLED: "true",
    WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED: "true", WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS: intent.Sender,
    WAR_SATCHEL_SIGNER_AUTH_TOKEN: "t".repeat(64), WAR_SATCHEL_VERIFIER_BINARY: binary,
    WAR_SATCHEL_VERIFIER_AUTHORITY_FILE: withdrawalRole,
    WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE: wagerRole,
    WAR_SATCHEL_WAGER_PROOF_VERIFIER_AUTHORITY_FILE: authority,
    WAR_SATCHEL_VERIFIER_SHA256: process.env.SATCHEL_TEST_BINARY_SHA256});
  const snapshot: SatchelWagerSnapshot = {executionId: 1, ownerUserId: 1, ownerUid: intent.OwnerID,
    ownerWallet: intent.Vault, reservationId: "satchel:reserve:1", operationId: "satchel:ticket:1", ticketId: 1,
    vault: intent.Sender, recipient: intent.Vault, amountUwolo: intent.AmountUWolo, memo,
    gameIdentityKey: "watcher:isolated-sdk-execution", propositionHash: "a".repeat(64), presetId: 1, presetVersion: 1,
    consentId: "isolated-fixture-consent", challengeText: "isolated context only; no mainnet owner mandate",
    ownerSignatureJson: {fixture_only: true}, ledgerVersion: "1", availableUwolo: "3000000",
    reservedUwolo: "12000000", journalId: "1",
    legs: [{id: 1, marketId: 1, side: "left", amountWolo: 12, propositionHash: "a".repeat(64)}]};
  const authorized = buildSatchelWagerAuthorization(snapshot);
  const issued = Math.floor(Date.now() / 1000) - 1;
  function review(a = authorized, patch: Partial<SatchelWagerReservation> = {}): SatchelWagerReservation {
    const s = a.snapshot;
    const unsigned: SatchelWagerReservation = {version: 1, operation_id: a.operationId, owner_id: s.ownerUid,
      vault: s.vault, recipient: s.recipient, amount_uwolo: s.amountUwolo, memo: s.memo,
      reservation_digest: a.reservationDigest, ledger_revision: a.ledgerRevision, consent_digest: a.consentDigest,
      fee_uwolo: "1", issued_at: issued, expires_at: issued + 120, signature: "", ...patch};
    return {...unsigned, signature: sign(null, wagerReservationSignBytes(unsigned), privateKey).toString("base64")};
  }
  const reservation = review();
  function envelope(a = authorized, r = reservation) {
    return {protocol: 1, chain_id: "wolo-1", denom: "uwolo", context: wagerFinancialContext(a, r, txHash),
      context_digest: wagerFinancialContextDigest(a, r, txHash), tx_hash: txHash,
      receipt_id: `wolo-1:${txHash}:1`, transfer_index: 1, message_index: 0,
      height: observation.Height, block_hash: observation.BlockHash, consensus_authenticated: true,
      credit_authorized: false, proof: structuredClone(fixture.transfer_proof)};
  }
  const body = envelope();
  const contextDigest = (context: unknown) => createHash("sha256").update(JSON.stringify(context)
    .replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))).digest("hex");
  assert.equal(body.context_digest, contextDigest(body.context), "fixed Go field ordering must agree with HD context helper");
  const expected = (c = body.context): ExpectedWarSatchelFinancialProof => ({kind: "wager", ownerUid: c.owner_id,
    operationId: c.operation_id, txHash: c.tx_hash, vault: c.sender, expectedContext: c,
    requestPath: "/satchel/v1/proofs/operation", requestBody: {operation_id: c.operation_id}});
  const reader = (value: unknown) => (async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8094/satchel/v1/proofs/operation");
    assert.equal(options?.method, "POST");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer " + "t".repeat(64));
    return Response.json(value);
  }) as typeof fetch;
  try {
    const authenticated = await authenticateWarSatchelFinancialProof(expected(), reader(body));
    await t.test("genuine bank execution and original signed approval issue an opaque wager proof", () => {
      assert.equal(financialProofFreshAt(authenticated), true);
      assert.ok(Object.isFrozen(authenticated));
      assert.equal(authenticated.txHash, txHash); assert.equal(authenticated.height, BigInt(observation.Height));
      assert.equal(authenticated.receiptId, `wolo-1:${txHash}:1`); assert.equal(authenticated.contextDigest, body.context_digest);
      const commit = fixture.transfer_proof.responses.find((r: {source: string; path: string; query: string}) =>
        r.source === "primary" && r.path === "/commit" && r.query === "height=" + observation.Height);
      assert.ok(commit); assert.equal(authenticated.txTimestamp, commit.body.result.signed_header.header.time);
      assert.doesNotThrow(() => assertAuthenticatedSatchelWager(authenticated, authorized, reservation, txHash));
    });
    await t.test("HTTP JSON and symbol-copied receipts cannot satisfy the financial consumer", () => {
      for (const copied of [body, {...authenticated}, JSON.parse(JSON.stringify(body))]) {
        assert.equal(financialProofFreshAt(copied), false);
        assert.throws(() => assertAuthenticatedSatchelWager(copied, authorized, reservation, txHash), /authenticated_wager_proof_required/);
      }
      const another = buildSatchelWagerAuthorization({...snapshot, ownerUid: "other-owner"});
      assert.throws(() => assertAuthenticatedSatchelWager(authenticated, another, review(another), txHash), /authenticated_wager_proof_required/);
    });
    await t.test("native wager verification refuses omitted, substituted or wrong-role public authority",async()=>{
      const unrelated=generateKeyPairSync("ed25519").publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
      try{
        for(const changed of [
          {...nativeAuthority,wager_approval_public_key_hex:undefined},
          {...nativeAuthority,approval_public_key_hex:publicKeyHex,wager_approval_public_key_hex:undefined},
          {...nativeAuthority,wager_approval_public_key_hex:withdrawalKeyHex},
          {...nativeAuthority,wager_approval_public_key_hex:unrelated},
        ]){
          writeFileSync(authority,JSON.stringify(changed),{mode:0o600});
          await assert.rejects(authenticateWarSatchelFinancialProof(expected(),reader(body)),/financial proof UNVERIFIABLE/);
        }
      }finally{writeFileSync(authority,JSON.stringify(nativeAuthority),{mode:0o600});}
    });
    await t.test("valid review of a different fee cannot override the actual SDK transaction fee", async () => {
      const wrongFee = review(authorized, {fee_uwolo: "2"});
      const bad = envelope(authorized, wrongFee);
      assert.doesNotThrow(() => assertExpectedWarSatchelFinancialProof(expected(bad.context), publicKeyHex),
        "the altered fee is a genuinely signed expectation; actual transaction bytes must reject it");
      // The production CLI deliberately returns a sanitized refusal, never
      // private proof contents or internal error detail.
      await assert.rejects(authenticateWarSatchelFinancialProof(expected(bad.context), reader(bad)), /financial proof UNVERIFIABLE/);
    });
    await t.test("cryptographically valid different amount or memo cannot change the actual bank transfer", async () => {
      for (const a of [
        buildSatchelWagerAuthorization({...snapshot, amountUwolo: "13000000", reservedUwolo: "13000000",
          legs: [{...snapshot.legs[0], amountWolo: 13}]}),
        buildSatchelWagerAuthorization({...snapshot, ticketId: 2, memo: "AoE2HDBets bet ticket v1 · ticket 2"}),
      ]) {
        const bad = envelope(a, review(a));
        await assert.rejects(authenticateWarSatchelFinancialProof(expected(bad.context), reader(bad)));
      }
    });
    await t.test("forged operation, owner or approval cannot reuse the original independent signature", async () => {
      for (const field of ["operation", "owner", "approval"]) {
        const bad = structuredClone(body);
        if (field === "operation") { bad.context.operation_id = "satchel:ticket:2"; bad.context.reservation.operation_id = "satchel:ticket:2"; }
        if (field === "owner") { bad.context.owner_id = "other-owner"; bad.context.reservation.owner_id = "other-owner"; }
        if (field === "approval") bad.context.reservation.consent_digest = "b".repeat(64);
        bad.context_digest = contextDigest(bad.context);
        await assert.rejects(authenticateWarSatchelFinancialProof(expected(bad.context), reader(bad)), /independent_signature_invalid/);
      }
    });
    for (const mode of ["chain", "denom", "tx bytes", "failed execution", "commit", "witness head", "stale head", "hash", "REST only"]) {
      await t.test(`forged ${mode} evidence cannot authenticate a wager`, async () => {
        const bad = structuredClone(body); let want = expected();
        if (mode === "chain") bad.chain_id = "another-chain";
        if (mode === "denom") bad.denom = "stake";
        if (mode === "tx bytes") {
          for (const r of bad.proof.responses) if (r.path === "/tx") {
            const bytes = Buffer.from(r.body.result.tx, "base64"); bytes[0] ^= 1; r.body.result.tx = bytes.toString("base64");
          }
        }
        if (mode === "failed execution") for (const r of bad.proof.responses) if (r.path === "/tx") r.body.result.tx_result.code = 7;
        if (mode === "commit") for (const r of bad.proof.responses) if (r.path === "/commit") {
          r.body.result.signed_header.header.time = new Date(Date.parse(r.body.result.signed_header.header.time) + 1000).toISOString();
        }
        if (mode === "witness head") for (const r of bad.proof.responses) if (r.source === "witness" && r.path === "/status") r.body.result.sync_info.latest_block_hash = "A".repeat(64);
        if (mode === "stale head") for (const r of bad.proof.responses) if (r.path === "/status") r.body.result.sync_info.latest_block_time = new Date(Date.now() - 60000).toISOString();
        if (mode === "hash") { bad.tx_hash = "B".repeat(64); bad.context.tx_hash = bad.tx_hash; bad.receipt_id = `wolo-1:${bad.tx_hash}:1`; bad.context_digest = contextDigest(bad.context); want = {...want, txHash: bad.tx_hash, expectedContext: bad.context}; }
        if (mode === "REST only") bad.proof.responses = bad.proof.responses.filter((r: {source: string}) => r.source === "rest");
        await assert.rejects(authenticateWarSatchelFinancialProof(want, reader(bad)));
      });
    }
  } finally { rmSync(root, {recursive: true, force: true}); }
});
