import assert from "node:assert/strict";
import test from "node:test";
import {
  examineSatchelDepositEvidence,
  examineSatchelReserveArithmetic,
  satchelDepositMemo,
  type SatchelDepositIntent,
  type SatchelEscrowProof,
} from "../lib/warSatchelCustodyEvidence.ts";

const sender = "wolo1" + "q".repeat(38);
const vault = "wolo1" + "p".repeat(38);
const owner = "u_test_account";
const hash = "A".repeat(64);
const nonce = "n".repeat(24);
const amount = "700000000";

function fixture() {
  const intent: SatchelDepositIntent = {
    chainId: "wolo-1", ownerUid: owner, senderAddress: sender,
    vaultAddress: vault, amountUwolo: amount, nonce,
    memo: satchelDepositMemo(owner, nonce),
    createdAt: "2026-10-13T15:30:00Z",
    expiresAt: "2026-10-13T15:55:00Z",
  };
  const proof: SatchelEscrowProof = {
    ok: true, deposit_found: true, escrow_address: vault,
    expected_sender: sender, expected_amount_uwolo: amount,
    lookup: {
      ok: true, found: true, chain_id: "wolo-1", tx_hash: hash,
      tx_success: true, code: 0, height: "10420",
      timestamp: "2026-10-13T15:40:00.123456789Z", memo: intent.memo,
      matched_expected: true, matched_transfer_index: 1,
      matching_transfer_count: 1,
      matched_transfer: { sender, recipient: vault, amount, denom: "uwolo" },
      transfers: [
        { sender, recipient: vault, amount, denom: "ufake" },
        { sender, recipient: vault, amount, denom: "uwolo" },
      ],
    },
  };
  return {
    intent, proof, claimedTxHash: hash.toLowerCase(),
    authenticatedUid: owner, authenticatedWalletAddress: sender,
    expectedVaultAddress: vault,
    head: { chainId: "wolo-1", height: "10422", observedAt: "2026-10-13T15:41:00Z" },
    minConfirmations: 3, now: "2026-10-13T15:41:20Z",
  };
}

test("only one exact-denomination matching transfer yields an uncredited candidate", () => {
  const result = examineSatchelDepositEvidence(fixture());
  assert.equal(result.kind, "uncredited_deposit_candidate");
  assert.equal(result.receiptKey, "wolo-1:" + hash + ":1");
  assert.equal(result.amountUwolo, amount);
  assert.equal(result.confirmations, "3");
  assert.equal(result.creditAuthorized, false);
  assert.equal(result.wagerAuthorized, false);
});

test("wrong owner, Keplr binding, vault and chain all fail closed", () => {
  const cases: Array<(x: ReturnType<typeof fixture>) => void> = [
    x => { x.authenticatedUid = "u_thief"; },
    x => { x.authenticatedWalletAddress = "wolo1" + "a".repeat(38); },
    x => { x.expectedVaultAddress = "wolo1" + "a".repeat(38); },
    x => { x.head.chainId = "cosmoshub-4"; },
    x => { x.intent.chainId = "another"; },
    x => { x.proof.escrow_address = "wolo1" + "a".repeat(38); },
    x => { x.proof.expected_sender = "wolo1" + "a".repeat(38); },
    x => { x.proof.expected_amount_uwolo = "700000001"; },
  ];
  for (const mutate of cases) {
    const input = fixture();
    mutate(input);
    assert.throws(() => examineSatchelDepositEvidence(input), /SATCHEL_PROOF_REFUSED/);
  }
});

test("only the specific matched WOLO coin may be credited, never a foreign denom", () => {
  const x = fixture();
  x.proof.lookup!.matched_transfer_index = 0;
  assert.throws(() => examineSatchelDepositEvidence(x), /indexed uwolo transfer mismatch/);
  x.proof.lookup!.matched_transfer_index = 1;
  x.proof.lookup!.matched_transfer!.denom = "ufake";
  assert.throws(() => examineSatchelDepositEvidence(x), /indexed uwolo transfer mismatch/);
  x.proof.lookup!.matched_transfer!.denom = "uwolo";
  x.proof.lookup!.transfers![1].amount = "699999999";
  assert.throws(() => examineSatchelDepositEvidence(x), /indexed uwolo transfer mismatch/);
});

test("duplicated matching bank transfers cannot create a unique receipt", () => {
  const a = fixture();
  a.proof.lookup!.matching_transfer_count = 2;
  a.proof.lookup!.transfers!.push({ sender, recipient: vault, amount, denom: "uwolo" });
  a.proof.lookup!.matched_transfer_index = undefined;
  assert.throws(() => examineSatchelDepositEvidence(a), /ambiguous/);
  const b = fixture();
  b.proof.lookup!.matched_transfer_index = undefined;
  assert.throws(() => examineSatchelDepositEvidence(b), /missing canonical transfer index/);
  const c = fixture();
  c.proof.lookup!.matched_transfer_index = 99;
  assert.throws(() => examineSatchelDepositEvidence(c), /missing canonical transfer index/);
});

test("failed, unproven, wrong-tx and wrong-memo receipts cannot be candidates", () => {
  const cases: Array<(x: ReturnType<typeof fixture>) => void> = [
    x => { x.proof.ok = false; },
    x => { x.proof.deposit_found = false; },
    x => { x.proof.lookup!.tx_success = false; },
    x => { x.proof.lookup!.code = 5; },
    x => { x.proof.lookup!.found = false; },
    x => { x.proof.lookup!.chain_id = "cosmoshub-4"; },
    x => { x.proof.lookup!.tx_hash = "B".repeat(64); },
    x => { x.proof.lookup!.memo = "manual-stake"; },
    x => { x.intent.memo = "manual-stake"; },
    x => { x.proof.lookup!.matched_expected = false; },
  ];
  for (const mutate of cases) {
    const input = fixture();
    mutate(input);
    assert.throws(() => examineSatchelDepositEvidence(input), /SATCHEL_PROOF_REFUSED/);
  }
});

test("finality, intent expiry and fresh canonical chain height are mandatory", () => {
  const cases: Array<(x: ReturnType<typeof fixture>) => void> = [
    x => { x.head.height = "10421"; },
    x => { x.head.height = "10419"; },
    x => { x.head.observedAt = "2026-10-13T15:36:00Z"; },
    x => { x.head.observedAt = "2026-10-13T15:44:00Z"; },
    x => { x.proof.lookup!.timestamp = "2026-10-13T15:58:00Z"; },
    x => { x.proof.lookup!.timestamp = "2026-10-13T15:28:00Z"; },
    x => { x.intent.expiresAt = "2026-10-15T00:00:00Z"; },
    x => { x.minConfirmations = 0; },
    x => { x.minConfirmations = 101; },
    x => { x.proof.lookup!.height = "0"; },
    x => { x.claimedTxHash = "not-a-hash"; },
  ];
  for (const mutate of cases) {
    const input = fixture();
    mutate(input);
    assert.throws(() => examineSatchelDepositEvidence(input), /SATCHEL_PROOF_REFUSED/);
  }
});

test("amount must be positive canonical integer uwolo, never float or scientific notation", () => {
  for (const raw of ["0", "01", "1.5", "-2", "1e9", "WOLO", ""]) {
    const x = fixture();
    x.intent.amountUwolo = raw;
    assert.throws(() => examineSatchelDepositEvidence(x), /invalid intent uwolo|non-positive intent uwolo/);
  }
});

const receipt = (symbol: string) => symbol.repeat(64);
const segments = () => [
  { category: "existing-bet-escrow", liabilityUwolo: "600", sourceReceipt: receipt("a"), atHeight: "10422", independentlyAttested: true },
  { category: "satchel-owner-liabilities", liabilityUwolo: "300", sourceReceipt: receipt("b"), atHeight: "10422", independentlyAttested: true },
];

test("numerical reserve assessment never authorizes credit even with surplus", () => {
  const result = examineSatchelReserveArithmetic({
    vaultAddress: vault, bankBalanceUwolo: "1000",
    bankAtHeight: "10422", segments: segments(),
  });
  assert.equal(result.reportedLiabilitiesUwolo, "900");
  assert.equal(result.excessUwolo, "100");
  assert.equal(result.arithmeticCovered, true);
  assert.equal(result.custodyApproved, false);
  assert.equal(result.executionReady, false);
});

test("a bank shortfall is visible, not silently treated as solvent", () => {
  const result = examineSatchelReserveArithmetic({
    vaultAddress: vault, bankBalanceUwolo: "800",
    bankAtHeight: "10422", segments: segments(),
  });
  assert.equal(result.arithmeticCovered, false);
  assert.equal(result.shortfallUwolo, "100");
  assert.equal(result.executionReady, false);
});

test("reserve evidence rejects missing, duplicate, stale and incomplete partitions", () => {
  const bad = [
    [{ ...segments()[0], independentlyAttested: false }],
    [{ ...segments()[0], atHeight: "10421" }],
    [...segments(), { ...segments()[0], sourceReceipt: receipt("c") }],
    [...segments(), { ...segments()[1], category: "another" }],
    [{ ...segments()[0], liabilityUwolo: "-10" }],
  ];
  for (const rows of bad) {
    assert.throws(() => examineSatchelReserveArithmetic({
      vaultAddress: vault, bankBalanceUwolo: "1000",
      bankAtHeight: "10422", segments: rows,
    }), /SATCHEL_PROOF_REFUSED/);
  }
  assert.throws(() => examineSatchelReserveArithmetic({
    vaultAddress: vault, bankBalanceUwolo: "1000",
    bankAtHeight: "10422", segments: [],
  }), /missing liability census/);
});
