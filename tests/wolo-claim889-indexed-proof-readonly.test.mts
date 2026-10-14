import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const source = readFileSync("scripts/wolo-claim889-indexed-proof-readonly.mjs", "utf8");

test("historical index probe checks exact claim without disclosing financial data", () => {
  assert.match(source, /const CLAIM_ID = 889/);
  assert.match(source, /source_founder_bonus_id !== 15/);
  assert.match(source, /source_market_id !== 4476/);
  assert.match(source, /const CHAIN = "wolo-1"/);
  assert.match(source, /const DENOM = "uwolo"/);
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source, /default_transaction_read_only=on/);
  assert.match(source, /wolo_indexed_transfers/);
  assert.match(source, /responseTruncated/);
  assert.match(source, /INCONCLUSIVE_NO_PROOF_FROM_PARTIAL_INDEX/);
  assert.match(source, /chainTxSuccessIndependentlyConfirmed: false/);
  assert.match(source, /exactRecipientIndependentlyConfirmed: false/);
  assert.match(source, /releaseAuthorized: false/);
  assert.doesNotMatch(source, /\b(INSERT INTO|UPDATE pending|DELETE FROM|DROP TABLE|ALTER TABLE|TRUNCATE)\b/i);
  assert.doesNotMatch(source, /console\.log\([^\n]*(amount_wolo|wallet_address|recipient_address|sender_address|DATABASE_URL|memo)/i);
});

test("probe refuses database access without protected authority", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ["scripts/wolo-claim889-indexed-proof-readonly.mjs"], {
    env, encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED: protected production database connection/);
  assert.equal(result.stdout, "");
});
