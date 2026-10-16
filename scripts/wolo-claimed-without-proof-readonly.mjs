#!/usr/bin/env node
/**
 * Historical claimed WOLO without stored tx proof: READ-ONLY aggregate census.
 * Run solely with the protected app EnvironmentFile (never print a DATABASE_URL).
 *
 * A missing payout hash does NOT prove nonpayment. This neither repairs claims
 * nor approves retries, release, signer access, vault custody or Bet automation.
 */
import { createRequire } from "node:module";
import { summarizeClaimedWoloWithoutHash } from "./wolo-claimed-without-proof-census.mjs";

const require = createRequire(
  process.env.AOE2WAR_PACKAGE_JSON?.trim() ||
  new URL("../package.json", import.meta.url)
);
const { Client } = require("pg");

if (!process.env.DATABASE_URL?.trim()) {
  console.error("BLOCKED: protected DATABASE_URL missing");
  process.exit(2);
}
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  application_name: "aoe2war_claimed_wolo_without_proof_readonly",
  connectionTimeoutMillis: 7000,
  query_timeout: 8000,
  statement_timeout: 8000,
  options: "-c default_transaction_read_only=on -c statement_timeout=8000",
});

let connected = false;
try {
  await client.connect();
  connected = true;
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  // Fixed buckets prevent raw player identity/amount/error strings from
  // reaching console or the returned aggregate receipt.
  const { rows } = await client.query(`
    SELECT
      CASE WHEN created_at >= TIMESTAMPTZ '2026-05-25T00:00:00Z'
        THEN 'mainnet_era' ELSE 'legacy_era' END AS era,
      CASE WHEN claim_kind IN
        ('bet_payout','bet_refund','winner_bounty','founders_bonus','founders_win')
        THEN claim_kind ELSE 'other' END AS kind,
      count(*)::integer AS claim_count,
      count(*) FILTER (WHERE payout_attempted_at IS NOT NULL)::integer AS attempted_count,
      count(*) FILTER (WHERE payout_proof_url IS NOT NULL)::integer AS proof_url_count
    FROM pending_wolo_claims
    WHERE status = 'claimed' AND payout_tx_hash IS NULL
    GROUP BY 1,2
    ORDER BY 1,2
  `);
  await client.query("ROLLBACK");
  const result = summarizeClaimedWoloWithoutHash(rows);
  console.log(JSON.stringify({
    observedAtUtc: new Date().toISOString(),
    mode: "historical_claimed_without_proof_read_only_aggregate",
    source: "app postgres, repeatable-read, protected environment",
    ...result,
    interpretation: "Hashless 'claimed' rows require independent current-chain and historical settlement reconciliation. Their presence does not prove nonpayment, fraud, a safe retry, or recipient identity. A stored hash alone also does not prove chain success.",
  }, null, 2));
  process.exitCode = result.totalRowsRequiringReview > 0 ? 3 : 0;
} catch {
  console.error("BLOCKED: read-only historical claim census unavailable or incomplete");
  process.exitCode = 2;
} finally {
  if (connected) await client.end().catch(() => {});
}
