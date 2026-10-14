import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const schema=readFileSync("prisma/schema.prisma","utf8");
const sql=readFileSync("prisma/migrations/20261014_144000_war_satchel_immutable_journal/migration.sql","utf8");
const contract=readFileSync("tests/sql/war_satchel_journal_contract.sql","utf8");
const workflow=readFileSync(".github/workflows/war-satchel-sql-proof.yml","utf8");

test("Satchel journal has no live spendable transfer endpoints or mutating imports",()=>{
  for(const name of ["WarSatchelLedgerAccount","WarSatchelLedgerJournal","WarSatchelLedgerPosting"]){
    assert.ok(schema.includes("model "+name+" {"),name);
  }
  assert.match(schema,/@@unique\(\[journalId, accountId\]/);
  assert.match(schema,/@@unique\(\[id, userId\]/);
  assert.doesNotMatch(sql,/ALTER TABLE "bet_wagers"|ALTER TABLE "pending_wolo_claims"|ALTER TABLE "staking_positions"/);
  assert.doesNotMatch(sql,/INSERT INTO "war_satchel_ledger_postings"|UPDATE "users"/);
  assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql,/lines < 2 OR total<>0/);
  assert.match(sql,/journal_txid<>txid_current\(\)/);
  assert.match(sql,/BEFORE UPDATE OR DELETE ON "war_satchel_ledger_postings"/);
  assert.match(sql,/BEFORE UPDATE OR DELETE ON "war_satchel_ledger_journals"/);
  assert.match(sql,/BEFORE UPDATE OR DELETE ON "war_satchel_ledger_accounts"/);
});
test("database contract covers receipt idempotency, owner binding, zero sum and immutability",()=>{
  for(const marker of ["duplicate use of a chain deposit receipt","cross-user deposit proof",
      "append postings to a past committed journal","zero-line journal at commit",
      "reassign liability account to another user","SATCHEL_APPEND_ONLY_JOURNAL_SQL_PASS"]){
    assert.ok(contract.includes(marker),marker);
  }
  assert.ok(workflow.includes("war_satchel_journal_contract.sql"));
  assert.ok(workflow.includes("20261014_144000_war_satchel_immutable_journal/migration.sql"));
});
