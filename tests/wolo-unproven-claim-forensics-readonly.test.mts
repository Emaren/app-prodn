import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync("scripts/wolo-unproven-claim-forensics-readonly.mjs", "utf8");

test("unproven-claim triage is read-only, excludes identities/amounts, and tracks drain predicate", () => {
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source, /default_transaction_read_only=on/);
  assert.match(source, /payout_attempted_at IS NOT NULL AND payout_tx_hash IS NULL/);
  assert.match(source, /status NOT IN \('claimed','rescinded'\)/);
  assert.match(source, /ORDER BY payout_attempted_at ASC, id ASC/);
  assert.match(source, /LIMIT 12/);
  assert.match(source, /rawErrorPresent/);
  assert.match(source, /releaseAuthorized: false/);
  assert.match(source, /Absence of a payout_tx_hash does NOT prove/);
  assert.doesNotMatch(source, /\b(INSERT INTO|DELETE FROM|UPDATE\s+pending|TRUNCATE|DROP TABLE|ALTER TABLE)\b/i);
  assert.doesNotMatch(source, /console\.log\([^\n]*(DATABASE_URL|error_state|amount_wolo|wallet_address)/i);
});

test("diagnostic command fails closed on missing protected DB authority", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ["scripts/wolo-unproven-claim-forensics-readonly.mjs"], { env, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED: protected DATABASE_URL missing/);
  assert.equal(result.stdout, "");
});
