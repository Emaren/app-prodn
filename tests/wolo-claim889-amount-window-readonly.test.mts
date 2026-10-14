import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

const p = "scripts/wolo-claim889-amount-window-readonly.mjs";
const source = readFileSync(p, "utf8");

test("claim amount index hunt remains read-only and returns no custody authorization", () => {
  assert.match(source,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source,/default_transaction_read_only=on/);
  assert.match(source,/chain_id='wolo-1' AND denom='uwolo'/);
  assert.match(source,/amount_uwolo=\$1::bigint/);
  assert.match(source,/within_10_minutes/);
  assert.match(source,/within_2_hours/);
  assert.match(source,/within_48_hours/);
  assert.match(source,/LIMIT 12/);
  assert.match(source,/verifiedOnCanonicalChain: false/);
  assert.match(source,/SOURCE_MATCHED_NO_SETTLEMENT_SERVICE_CONFIG_ERROR/);
  assert.match(source,/historicalErrorProofLimit/);
  assert.doesNotMatch(source,/console\.log\([^\n]*errorText/);
  assert.match(source,/verifiedRecipient: false/);
  assert.match(source,/releaseAuthorized: false/);
  assert.match(source,/BLOCKED_NO_INDEPENDENT_PAYOUT_PROOF/);
  assert.doesNotMatch(source,/\b(INSERT INTO|DELETE FROM|TRUNCATE|ALTER TABLE|DROP TABLE|UPDATE pending_wolo_claims)\b/i);
});

test("missing DB authority fails closed with no private output", () => {
  const env = {...process.env};
  delete env.DATABASE_URL;
  const out=spawnSync(process.execPath,[p],{env,encoding:"utf8",timeout:10000});
  assert.equal(out.status,2);
  assert.match(out.stderr,/BLOCKED: isolated read-only database authority unavailable/);
  assert.equal(out.stdout,"");
});
