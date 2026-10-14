import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const sql = readFileSync(
  "prisma/migrations/20261014_103500_war_satchel_noncrediting_foundation/migration.sql",
  "utf8",
);

test("War Satchel has durable intent and separately identified receipt models", () => {
  assert.match(schema, /model WarSatchelDepositIntent \{/);
  assert.match(schema, /model WarSatchelProofCandidate \{/);
  assert.match(schema, /proofCandidate\s+WarSatchelProofCandidate\?/);
  assert.match(schema, /warSatchelDepositIntents\s+WarSatchelDepositIntent\[\]/);
  assert.match(schema, /warSatchelProofCandidates\s+WarSatchelProofCandidate\[\]/);
  assert.match(schema, /@@unique\(\[chainId, txHash, transferIndex\]/);
  assert.match(sql, /CREATE UNIQUE INDEX "uq_war_satchel_intents_nonce"/);
  assert.match(sql, /CREATE UNIQUE INDEX "uq_war_satchel_intents_memo"/);
  assert.match(sql, /CREATE UNIQUE INDEX "uq_war_satchel_proofs_chain_tx_ordinal"/);
  assert.match(sql, /CREATE UNIQUE INDEX "uq_war_satchel_proofs_intent"/);
  assert.match(schema, /@@unique\(\[id, userId\], map: "uq_war_satchel_intents_id_owner"/);
  assert.match(schema, /@relation\(fields: \[intentId, userId\], references: \[id, userId\]/);
  assert.match(sql, /FOREIGN KEY \("intent_id", "user_id"\) REFERENCES "war_satchel_deposit_intents" \("id", "user_id"\)/);
  assert.match(sql, /war_satchel_proofs_exact_intent/);
  assert.match(sql, /i\."sender_address" = NEW\."sender_address"/);
  assert.match(sql, /i\."vault_address" = NEW\."vault_address"/);
  assert.match(sql, /i\."amount_uwolo" = NEW\."amount_uwolo"/);
});

test("there is no spendable custody balance or deposit-crediting executor", () => {
  assert.match(sql, /CHECK \("status" = 'uncredited'\)/);
  assert.match(sql, /War Satchel proof candidates are immutable evidence, never funds/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "war_satchel_proof_candidates"/);
  assert.match(sql, /"chain_id" = 'wolo-1'/);
  assert.match(sql, /CHECK \("amount_uwolo" > 0\)/);
  assert.match(sql, /"expires_at" <= "created_at" \+ INTERVAL '30 minutes'/);
  assert.doesNotMatch(sql, /\b(CREATE TABLE "war_satchel_accounts"|INSERT INTO|TRANSFER|SIGN|BROADCAST)\b/i);
});

test("War Satchel artifacts remain isolated from betting and settlement state", () => {
  assert.doesNotMatch(sql, /ALTER TABLE "bet_wagers"|ALTER TABLE "bet_stake_tickets"|ALTER TABLE "pending_wolo_claims"|ALTER TABLE "staking_positions"/);
  assert.doesNotMatch(sql, /UPDATE "users"|DELETE FROM/);
  assert.match(sql, /ON DELETE RESTRICT ON UPDATE NO ACTION/);
});
