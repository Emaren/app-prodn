import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../prisma/migrations/20261013185000_war_satchel_dormant_ledger_gate_b/migration.sql", import.meta.url),
  "utf8",
);

function model(name: string) {
  const start = schema.indexOf("model " + name + " {");
  assert.ok(start >= 0, name + " must exist in Prisma schema");
  const end = schema.indexOf("\n}\n", start);
  assert.ok(end > start, name + " needs a bounded schema body");
  return schema.slice(start, end);
}

test("Satchel accounts are unique per user, zeroed and disabled by default", () => {
  const account = model("WarSatchelAccount");
  assert.match(account, /userId\s+Int\s+@unique/);
  assert.match(account, /status\s+String\s+@default\("inactive"\)/);
  for (const name of ["availableUwolo","reservedUwolo","committedUwolo","withdrawalHeldUwolo"]) {
    assert.match(account, new RegExp(name + "\\s+BigInt\\s+@default\\(0\\)"));
  }
  assert.match(migration, /"ck_war_satchel_account_nonnegative" CHECK/);
  assert.match(migration, /"ck_war_satchel_account_chain" CHECK/);
  assert.match(migration, /FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE RESTRICT/);
});

test("signed deposit intent state is separate from balance credit", () => {
  const intent = model("WarSatchelDepositIntent");
  assert.match(intent, /@@unique\(\[userId, nonce\]/);
  assert.match(intent, /@@unique\(\[chainId, exactMemo\]/);
  assert.match(intent, /status\s+String\s+@default\("created"\)/);
  assert.match(migration, /"ck_war_satchel_intent_amount" CHECK \("amount_uwolo" > 0\)/);
  assert.doesNotMatch(migration, /INSERT INTO "war_satchel_accounts"/);
  assert.doesNotMatch(migration, /UPDATE "bet_stake_tickets"/);
});

test("one global transfer claim cannot be duplicated or reassigned to another owner/rail", () => {
  const claim = model("WoloTransferClaim");
  assert.match(claim, /@@unique\(\[chainId, txHash, transferIndex\]/);
  assert.match(migration, /"uq_wolo_transfer_claims_chain_tx_event" UNIQUE/);
  assert.match(migration, /"tx_hash" ~ '\^\[0-9A-F\]\{64\}\$'/);
  assert.match(migration, /"protect_wolo_transfer_claim_identity"/);
  assert.match(migration, /NEW\."user_id", NEW\."rail"/);
  assert.match(migration, /'transfer claim identity and evidence are immutable'/);
  assert.match(migration, /'transfer claim status cannot regress'/);
  assert.match(migration, /a transfer claim cannot be deleted/);
});

test("journal entries cannot be rewritten or deleted, and cannot report negative post-balances", () => {
  const journal = model("WarSatchelJournal");
  assert.match(journal, /eventKey\s+String\s+@unique/);
  assert.match(journal, /transferClaimId\s+BigInt\?\s+@unique/);
  assert.match(migration, /"uq_war_satchel_journal_event_key" UNIQUE/);
  assert.match(migration, /"uq_war_satchel_journal_transfer_claim" UNIQUE/);
  assert.match(migration, /"ck_war_satchel_journal_post_nonnegative" CHECK/);
  assert.match(migration, /"ck_war_satchel_journal_nonzero" CHECK/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "war_satchel_journal"/);
  assert.match(migration, /'war_satchel_journal is append only'/);
  assert.match(migration, /"guard_war_satchel_journal_claim"/);
  assert.match(migration, /claim_owner <> owner_id/);
  assert.match(migration, /claim_state <> 'allocated'/);
  assert.match(migration, /claim_amount <> expected_amount/);
  assert.match(migration, /claim_rail <> 'satchel'/);
  assert.match(migration, /"war_satchel_journal_claim_guard"/);
});

test("the schema-only milestone cannot silently enable deposits or the funded executor", () => {
  const cli = readFileSync(new URL("../lib/betAutomation.ts", import.meta.url), "utf8");
  const evidence = readFileSync(new URL("../lib/warSatchelCustodyEvidence.ts", import.meta.url), "utf8");
  assert.match(cli, /LIVE_EXECUTOR_IMPLEMENTED\s*=\s*false/);
  assert.match(evidence, /creditAuthorized:\s*false/);
  assert.match(evidence, /wagerAuthorized:\s*false/);
});
