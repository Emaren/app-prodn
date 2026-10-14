import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

const source = readFileSync("scripts/wolo-maintenance-drain-readonly.mjs", "utf8");

test("finance maintenance scanner is read-only and checks all known in-flight rails", () => {
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source, /default_transaction_read_only=on/);
  assert.match(source, /statement_timeout=8000/);
  for (const table of [
    "pending_wolo_claims",
    "trophy_payouts",
    "trophy_payout_allocations",
    "scheduled_match_settlements",
    "bet_stake_intents",
  ]) assert.match(source, new RegExp("FROM " + table));
  assert.match(source, /maintenanceAuthorized: false/);
  assert.match(source, /NOT a global settlement drain certificate/);
  assert.doesNotMatch(source, /\b(UPDATE|DELETE FROM|INSERT INTO|TRUNCATE|CREATE TABLE|ALTER TABLE|DROP TABLE)\b/i);
});

test("missing protected database authority fails closed without a write", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const out = spawnSync(process.execPath, ["scripts/wolo-maintenance-drain-readonly.mjs"], {
    env, encoding: "utf8", timeout: 10000,
  });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /BLOCKED: protected DATABASE_URL/);
  assert.doesNotMatch(out.stdout, /password|token|wolo1/i);
});
