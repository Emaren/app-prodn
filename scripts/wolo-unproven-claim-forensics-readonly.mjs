#!/usr/bin/env node
/**
 * Read-only, deliberately narrow diagnostics for unproven payout-attempt rows.
 * Read the production database only through the protected systemd EnvironmentFile.
 * Never print names, addresses, amounts, secrets, payout memos or raw errors.
 * NOT chain confirmation and NOT authorization to replay, settle or clear a claim.
 */
import { createRequire } from "node:module";

const appPackage = process.env.AOE2WAR_PACKAGE_JSON?.trim();
const require = createRequire(appPackage || new URL("../package.json", import.meta.url));
const { Client } = require("pg");

if (!process.env.DATABASE_URL?.trim()) {
  console.error("BLOCKED: protected DATABASE_URL missing");
  process.exit(2);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  application_name: "aoe2war_wolo_unproven_claim_read_only",
  connectionTimeoutMillis: 7000,
  query_timeout: 8000,
  statement_timeout: 8000,
  options: "-c default_transaction_read_only=on -c statement_timeout=8000",
});

const toUtc = (value) => value instanceof Date
  ? value.toISOString()
  : value ? new Date(value).toISOString() : null;

const errorCategory = (value) => {
  const text = String(value || "").toLowerCase();
  if (!text) return "none";
  if (/await|wallet|link|verified account/.test(text)) return "wallet_or_identity";
  if (/timeout|timed out|deadline/.test(text)) return "timeout";
  if (/insufficient|balance|reserve/.test(text)) return "balance_or_reserve";
  if (/health|unavailable|connect|network|offline/.test(text)) return "network_or_service";
  if (/proof|tx |transaction|memo|broadcast|payout|settlement/.test(text)) return "transaction_or_validation";
  return "other";
};

let connected = false;
try {
  await client.connect();
  connected = true;
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

  // The predicate is *identical* to the first count in the existing drain tool.
  const { rows } = await client.query(`
    SELECT id, claim_kind, claim_group_key, target_scope, status,
           source_market_id, source_game_stats_id, source_founder_bonus_id,
           payout_attempted_at, created_at, updated_at,
           payout_proof_url IS NOT NULL AS has_proof_url,
           error_state
    FROM pending_wolo_claims
    WHERE payout_attempted_at IS NOT NULL AND payout_tx_hash IS NULL
      AND status NOT IN ('claimed','rescinded')
    ORDER BY payout_attempted_at ASC, id ASC
    LIMIT 12
  `);
  const countResult = await client.query(`
    SELECT count(*)::integer AS n FROM pending_wolo_claims
    WHERE payout_attempted_at IS NOT NULL AND payout_tx_hash IS NULL
      AND status NOT IN ('claimed','rescinded')
  `);
  await client.query("ROLLBACK");
  const total = countResult.rows[0]?.n;
  if (!Number.isInteger(total) || total < 0 || rows.length !== Math.min(total, 12)) {
    throw new Error("inconsistent counts or incomplete result");
  }

  console.log(JSON.stringify({
    observedAtUtc: new Date().toISOString(),
    mode: "read_only_unproven_claim_triage",
    total,
    truncated: total > rows.length,
    claims: rows.map((row) => ({
      id: row.id,
      kind: row.claim_kind,
      group: row.claim_group_key,
      scope: row.target_scope,
      status: row.status,
      marketId: row.source_market_id,
      gameStatsId: row.source_game_stats_id,
      founderBonusId: row.source_founder_bonus_id,
      attemptedAtUtc: toUtc(row.payout_attempted_at),
      createdAtUtc: toUtc(row.created_at),
      updatedAtUtc: toUtc(row.updated_at),
      proofUrlPresent: row.has_proof_url,
      rawErrorPresent: Boolean(row.error_state),
      errorHintOnly: errorCategory(row.error_state),
    })),
    limitations: "The error hint is heuristic. Absence of a payout_tx_hash does NOT prove that WOLO was not transferred. Independently reconcile against WoloChain before any retry or row update.",
    writesPerformed: false,
    chainTransactionsPerformed: false,
    releaseAuthorized: false,
  }, null, 2));
  process.exitCode = total > 0 ? 3 : 0;
} catch {
  console.error("BLOCKED: read-only claim triage failed or database schema changed");
  process.exitCode = 2;
} finally {
  if (connected) await client.end().catch(() => {});
}
