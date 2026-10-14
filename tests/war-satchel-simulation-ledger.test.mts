import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const schema = readFileSync("prisma/schema.prisma","utf8");
const sql = readFileSync("prisma/migrations/20261014_150000_war_satchel_simulated_double_entry/migration.sql","utf8");
const pgTests = readFileSync("tests/sql/war_satchel_simulation_double_entry_contract.sql","utf8");

test("Satchel has source-unique, owner-accounted integer ledger models",()=>{
  for (const type of ["WarSatchelLedgerAccount","WarSatchelLedgerJournal","WarSatchelLedgerPosting"]) {
    assert.match(schema,new RegExp("model " + type + " \\{"));
  }
  assert.match(schema,/deltaUwolo\s+BigInt/);
  assert.match(schema,/sourceKey\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[journalId, accountId\]/);
});

test("ledger cannot admit real chain events or available-for-betting balances",()=>{
  assert.match(sql,/CHECK \("source_kind" = 'simulation'\)/);
  assert.match(sql,/CHECK \("source_key" LIKE 'simulation:%'\)/);
  assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/g);
  assert.match(sql,/sum\("delta_uwolo"::NUMERIC\)/);
  assert.match(sql,/posting_count < 2 OR total <> 0/);
  assert.match(sql,/account_balance > 0/);
  assert.match(sql,/account_balance < 0/);
  assert.match(sql,/BEFORE UPDATE OR DELETE ON "war_satchel_ledger_postings"/);
  assert.doesNotMatch(sql,/ALTER TABLE "(pending_wolo_claims|bet_stake_tickets|bet_wagers|staking_positions)"/);
  assert.doesNotMatch(sql,/\b(TRANSFER TOKENS|SIGN_AND_BROADCAST|LIVE_EXECUTOR_IMPLEMENTED)\b/i);
});

test("runtime PostgreSQL fixture exercises failure outcomes, not scores",()=>{
  for (const failure of [
    "unbalanced journal",
    "overdrawn",
    "duplicate source",
    "cannot claim real",
    "historical posting",
  ]) {
    if (failure === "overdrawn") {
      assert.match(pgTests,/overdraw/);
    } else if (failure === "duplicate source") {
      assert.match(pgTests,/duplicate source/);
    } else if (failure === "cannot claim real") {
      assert.match(pgTests,/cannot claim real/);
    } else {
      assert.match(pgTests,new RegExp(failure.split(" ")[0],"i"));
    }
  }
  assert.match(pgTests,/SATCHEL_LEDGER_SIMULATION_PASS/);
});
