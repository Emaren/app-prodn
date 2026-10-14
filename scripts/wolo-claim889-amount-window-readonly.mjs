#!/usr/bin/env node
/**
 * Strictly read-only, amount-and-time crosscheck of founder claim #889
 * against incomplete app-cached WOLO transfers (not chain settlement proof).
 *
 * Avoids false negatives from memo-only lookup. No account addresses, memo
 * strings, amounts, player identity, error text, or DB connection are printed.
 */
import { createRequire } from "node:module";
const require = createRequire(process.env.AOE2WAR_PACKAGE_JSON?.trim() || new URL("../package.json", import.meta.url));
const { Client } = require("pg");

if (!process.env.DATABASE_URL?.trim()) {
  console.error("BLOCKED: isolated read-only database authority unavailable");
  process.exit(2);
}
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  application_name: "aoe2war_claim889_amount_window_read_only",
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
  const { rows: claims } = await client.query(
    "SELECT id, claim_kind, source_founder_bonus_id, source_market_id, status, " +
    "amount_wolo, payout_attempted_at, payout_tx_hash " +
    "FROM pending_wolo_claims WHERE id = 889"
  );
  const claim = claims[0];
  if (claims.length !== 1 || claim.claim_kind !== "founders_win" ||
      claim.source_founder_bonus_id !== 15 || claim.source_market_id !== 4476 ||
      claim.status !== "pending" || claim.payout_attempted_at == null ||
      claim.payout_tx_hash != null ||
      !Number.isSafeInteger(claim.amount_wolo) || claim.amount_wolo < 1) {
    throw new Error("claim not the recorded unresolved founder bonus");
  }
  const exactUwolo = (BigInt(claim.amount_wolo) * 1000000n).toString();
  const attemptAt = claim.payout_attempted_at;
  // The app's index does NOT attest transaction success/finality, and need
  // not contain all history. No match in this cache cannot clear a claim.
  const { rows: counts } = await client.query(
    "SELECT COUNT(*)::integer AS amount_matches_any_time, " +
    "COUNT(*) FILTER (WHERE timestamp BETWEEN $2::timestamp - INTERVAL '10 minutes' " +
    "AND $2::timestamp + INTERVAL '10 minutes')::integer AS within_10_minutes, " +
    "COUNT(*) FILTER (WHERE timestamp BETWEEN $2::timestamp - INTERVAL '2 hours' " +
    "AND $2::timestamp + INTERVAL '2 hours')::integer AS within_2_hours, " +
    "COUNT(*) FILTER (WHERE timestamp BETWEEN $2::timestamp - INTERVAL '48 hours' " +
    "AND $2::timestamp + INTERVAL '48 hours')::integer AS within_48_hours " +
    "FROM wolo_indexed_transfers " +
    "WHERE chain_id='wolo-1' AND denom='uwolo' AND amount_uwolo=$1::bigint",
    [exactUwolo, attemptAt]
  );
  const { rows: candidateRows } = await client.query(
    "SELECT tx_hash, transfer_index, timestamp, height, " +
    "NULLIF(memo,'') IS NOT NULL AS has_nonempty_memo " +
    "FROM wolo_indexed_transfers " +
    "WHERE chain_id='wolo-1' AND denom='uwolo' " +
    "AND amount_uwolo=$1::bigint " +
    "AND timestamp BETWEEN $2::timestamp - INTERVAL '48 hours' " +
    "AND $2::timestamp + INTERVAL '48 hours' " +
    "ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - $2::timestamp))), " +
    "tx_hash, transfer_index LIMIT 12",
    [exactUwolo, attemptAt]
  );
  await client.query("ROLLBACK");
  const row = counts[0];
  const fields = ["amount_matches_any_time", "within_10_minutes", "within_2_hours", "within_48_hours"];
  if (counts.length !== 1 || fields.some(k=>!Number.isInteger(row[k]) || row[k]<0) ||
      candidateRows.length !== Math.min(12,row.within_48_hours)) {
    throw new Error("missing count or partial query result");
  }
  const candidates = candidateRows.map(tx => ({
    publicTxHash: /^[A-Fa-f0-9]{64}$/.test(String(tx.tx_hash)) ? tx.tx_hash : "invalid/withheld",
    transferIndex: tx.transfer_index,
    observedAtUtc: new Date(tx.timestamp).toISOString(),
    chainHeightFromCache: String(tx.height),
    hadMemoInCache: tx.has_nonempty_memo === true,
    verifiedOnCanonicalChain: false,
    verifiedRecipient: false,
    verifiedSender: false,
    verdict: "UNVERIFIED_CANDIDATE",
  }));
  console.log(JSON.stringify({
    observedAtUtc: new Date().toISOString(),
    mode: "read_only_same_amount_window_index_crosscheck",
    claimId: 889,
    claimStillUnresolved: true,
    index: "INCOMPLETE: app cache, not authoritative wolo-1 blockchain proof",
    counts: Object.fromEntries(fields.map(k=>[k,row[k]])),
    candidatesTruncated: row.within_48_hours > candidates.length,
    candidates,
    interpretation: row.within_48_hours > 0
      ? "Possible same-amount/time transactions; verify exact sender, recipient, fee, memo, tx code and transfer ordinal independently before any action."
      : "No same-amount transfer in this incomplete cache window; this does not prove nonpayment.",
    status: "BLOCKED_NO_INDEPENDENT_PAYOUT_PROOF",
    payoutsAuthorized: false,
    releaseAuthorized: false,
    databaseWrites: false,
    chainBroadcasts: false,
  },null,2));
  process.exitCode = 3;
} catch {
  console.error("BLOCKED: claim/index amounts could not be evaluated consistently or production schema drifted");
  process.exitCode = 2;
} finally {
  if (connected) await client.end().catch(()=>{});
}
