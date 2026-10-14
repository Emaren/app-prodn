#!/usr/bin/env node
/**
 * Read-only, fail-closed financial activity snapshot for Wolo settlement maintenance.
 *
 * This is NOT a global drain certificate. Independent ingress/timer, chain and
 * settlement-record reconciliation is still required before a two-lane cutover.
 *
 * Run as an isolated one-shot process with production EnvironmentFile supplied
 * by systemd; NEVER echo, log or include DATABASE_URL in the command line.
 */
import { createRequire } from "node:module";

const packageAuthority = process.env.AOE2WAR_PACKAGE_JSON?.trim();
const require = createRequire(packageAuthority || new URL("../package.json", import.meta.url));
const pg = require("pg");

const { Client } = pg;
const expected = [
  "bet_claim_payout_attempt_without_proof",
  "bet_claim_execution_status",
  "trophy_payout_executing",
  "trophy_allocation_executing_or_uncertain",
  "scheduled_match_settlement_executing_or_uncertain",
  "stake_intent_broadcast_without_proof",
];

if (!process.env.DATABASE_URL?.trim()) {
  console.error("BLOCKED: protected DATABASE_URL not supplied to isolated process");
  process.exit(2);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  application_name: "aoe2war_wolo_maintenance_drain_observer",
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
  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM pending_wolo_claims
       WHERE payout_attempted_at IS NOT NULL AND payout_tx_hash IS NULL
         AND status NOT IN ('claimed','rescinded')) AS bet_claim_payout_attempt_without_proof,
      (SELECT COUNT(*)::integer FROM pending_wolo_claims
       WHERE status IN ('executing','processing','retrying','uncertain')) AS bet_claim_execution_status,
      (SELECT COUNT(*)::integer FROM trophy_payouts
       WHERE status = 'executing') AS trophy_payout_executing,
      (SELECT COUNT(*)::integer FROM trophy_payout_allocations
       WHERE status IN ('executing','uncertain')) AS trophy_allocation_executing_or_uncertain,
      (SELECT COUNT(*)::integer FROM scheduled_match_settlements
       WHERE status IN ('executing','processing','broadcasting','uncertain')
         OR (last_attempt_at IS NOT NULL AND tx_hash IS NULL
             AND status NOT IN ('completed','executed','refunded','cancelled','voided'))) AS scheduled_match_settlement_executing_or_uncertain,
      (SELECT COUNT(*)::integer FROM bet_stake_intents
       WHERE broadcast_submitted_at IS NOT NULL AND stake_tx_hash IS NULL
         AND status NOT IN ('cancelled','failed','expired','orphaned')) AS stake_intent_broadcast_without_proof
  `);
  await client.query("ROLLBACK");
  if (rows.length !== 1 || expected.some((key) => !Number.isInteger(rows[0][key]) || rows[0][key] < 0)) {
    throw new Error("missing/incomplete integer financial count");
  }
  const counts = Object.fromEntries(expected.map((key) => [key, rows[0][key]]));
  const blocked = Object.values(counts).some((value) => value > 0);
  console.log(JSON.stringify({
    observedAtUtc: new Date().toISOString(),
    source: "app-prodn production postgres read-only repeatable-read snapshot",
    status: blocked ? "BLOCKED_UNRESOLVED_FINANCIAL_ACTIVITY" : "NO_UNRESOLVED_ACTIVITY_IN_SCANNED_TABLES",
    counts,
    limitation: "NOT a global settlement drain certificate: web/timers/requests, live locks, chain and other signer rails require separate evidence",
    writesPerformed: false,
    maintenanceAuthorized: false,
  }, null, 2));
  process.exitCode = blocked ? 3 : 0;
} catch (err) {
  // Do not expose Postgres connection strings or verbose exceptions.
  console.error("BLOCKED: read-only financial snapshot unavailable or query/schema mismatch");
  process.exitCode = 2;
} finally {
  if (connected) {
    await client.end().catch(() => {});
  }
}
