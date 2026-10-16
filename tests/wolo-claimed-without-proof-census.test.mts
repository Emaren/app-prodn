import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { summarizeClaimedWoloWithoutHash } from "../scripts/wolo-claimed-without-proof-census.mjs";

const row = (era: string, kind: string, count: number, attempted = 0, proof = 0) => ({
  era, kind, claim_count: count, attempted_count: attempted, proof_url_count: proof,
});

test("zero historical hashless claims is an explicitly limited observed result", () => {
  assert.deepEqual(summarizeClaimedWoloWithoutHash([]), {
    totalRowsRequiringReview: 0,
    mainnetEraRowsRequiringReview: 0,
    legacyEraRowsRequiringReview: 0,
    rowsWithPriorAttemptWithoutHash: 0,
    rowsWithUnverifiedProofUrl: 0,
    groups: [],
    classification: "NO_HASHLESS_CLAIMED_ROWS_OBSERVED",
    writesPerformed: false,
    chainTransactionsPerformed: false,
    payoutAuthorized: false,
    releaseAuthorized: false,
  });
});

test("bounded historical buckets never expose owner names, amount, or raw error", () => {
  const sample = [
    {...row("mainnet_era", "bet_payout", 4, 2, 1),
      wallet_address: "SECRET", amount_wolo: 8_000_000, error_state: "SECRET",
      normalized_player_name: "SECRET", payout_memo: "SECRET"},
    row("legacy_era", "other", 3, 1, 0),
  ];
  const output = summarizeClaimedWoloWithoutHash(sample);
  assert.equal(output.totalRowsRequiringReview, 7);
  assert.equal(output.mainnetEraRowsRequiringReview, 4);
  assert.equal(output.legacyEraRowsRequiringReview, 3);
  assert.equal(output.rowsWithPriorAttemptWithoutHash, 3);
  assert.equal(output.rowsWithUnverifiedProofUrl, 1);
  assert.ok(!JSON.stringify(output).includes("SECRET"));
  assert.equal(output.payoutAuthorized, false);
  assert.equal(output.releaseAuthorized, false);
});

test("fail closed on unrecognized, duplicated, noninteger, inconsistent or excessive cohorts", () => {
  for (const input of [
    null, {}, [row("unknown", "bet_payout", 1)],
    [row("mainnet_era", "unknown_kind", 1)],
    [row("mainnet_era", "bet_refund", 1), row("mainnet_era", "bet_refund", 1)],
    [row("mainnet_era", "bet_refund", 0)],
    [row("mainnet_era", "bet_refund", 3, 4)],
    [row("mainnet_era", "bet_refund", 3, 1, 4)],
    [row("mainnet_era", "bet_refund", 1.1)],
    Array.from({ length: 13 }, () => row("legacy_era", "other", 1)),
  ]) {
    assert.throws(() => summarizeClaimedWoloWithoutHash(input), /CLAIM_CENSUS_/);
  }
});

test("real census script is read-only, credential-safe and never labels absent hash as unpaid", () => {
  const source = readFileSync(
    new URL("../scripts/wolo-claimed-without-proof-readonly.mjs", import.meta.url), "utf8");
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source, /default_transaction_read_only=on/);
  assert.match(source, /WHERE status = 'claimed' AND payout_tx_hash IS NULL/);
  assert.match(source, /GROUP BY 1,2/);
  assert.match(source, /ROLLBACK/);
  assert.match(source, /claimed_with(out|_)proof/i);
  assert.match(source, /does not prove nonpayment/i);
  assert.match(source, /result\.totalRowsRequiringReview > 0 \? 3 : 0/);
  assert.doesNotMatch(source, /SELECT\s+id\s*,|SELECT\s+\*|amount_wolo\b|wallet_address\b|normalized_player_name\b|error_state\b|payout_memo\b|UPDATE pending_|DELETE FROM|INSERT INTO|executeWoloPayout|signAndBroadcast/);
});
