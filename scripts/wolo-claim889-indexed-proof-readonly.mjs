#!/usr/bin/env node
/**
 * Historical founder claim #889 vs existing successful MsgSend index.
 * PROOF HUNT ONLY. No tx search REST dependency, signer, broadcast or DB write.
 * The index is an incomplete cache and never certifies absence of a transfer.
 * All addresses, amounts, memos, error strings and DB credentials withheld.
 */
import { createRequire } from "node:module";

const require = createRequire(process.env.AOE2WAR_PACKAGE_JSON?.trim() || new URL("../package.json", import.meta.url));
const { Client } = require("pg");
const CLAIM_ID = 889;
const CHAIN = "wolo-1";
const DENOM = "uwolo";
if (!process.env.DATABASE_URL?.trim()) {
  console.error("BLOCKED: protected production database connection not provided");
  process.exit(2);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  application_name: "aoe2war_claim889_indexed_tx_read_only",
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

  const { rows: claimRows } = await client.query(
    "SELECT id, claim_kind, source_founder_bonus_id, source_market_id, " +
    "status, amount_wolo, payout_attempted_at, payout_tx_hash " +
    "FROM pending_wolo_claims WHERE id=$1", [CLAIM_ID],
  );
  if (claimRows.length !== 1) throw new Error("claim not found");
  const claim = claimRows[0];
  if (claim.claim_kind !== "founders_win" || claim.source_founder_bonus_id !== 15 ||
      claim.source_market_id !== 4476 || !claim.payout_attempted_at ||
      claim.payout_tx_hash != null || claim.status !== "pending" ||
      !Number.isSafeInteger(claim.amount_wolo) || claim.amount_wolo < 1) {
    throw new Error("claim identity or unresolved payout status changed");
  }

  const { rows: scopeRows } = await client.query(
    "SELECT COUNT(*)::integer AS total, " +
    "MIN(timestamp) AS oldest, MAX(timestamp) AS newest, " +
    "COUNT(*) FILTER (WHERE timestamp >= ($1::timestamp - INTERVAL '48 hours') " +
    "AND timestamp <= ($1::timestamp + INTERVAL '48 hours'))::integer AS around_attempt " +
    "FROM wolo_indexed_transfers WHERE chain_id=$2 AND denom=$3",
    [claim.payout_attempted_at, CHAIN, DENOM],
  );
  if (scopeRows.length !== 1) throw new Error("index completeness cannot be measured");
  const coverage = scopeRows[0];
  const memoPattern = "(founder[-_: ]?15|bonus[[:space:]]+15|claim[-_: ]?889|market[-_: ]?4476)";
  const { rows: matches } = await client.query(
    "SELECT tx_hash, transfer_index, timestamp, amount_uwolo, " +
    "memo ~* $2 AS has_identifier, " +
    "timestamp >= ($3::timestamp - INTERVAL '48 hours') " +
    "AND timestamp <= ($3::timestamp + INTERVAL '48 hours') AS near_attempt " +
    "FROM wolo_indexed_transfers " +
    "WHERE chain_id=$1 AND denom='uwolo' AND memo ~* $2 " +
    "ORDER BY timestamp ASC, tx_hash ASC, transfer_index ASC LIMIT 40",
    [CHAIN, memoPattern, claim.payout_attempted_at],
  );
  const { rows: totals } = await client.query(
    "SELECT COUNT(*)::integer AS matches " +
    "FROM wolo_indexed_transfers WHERE chain_id=$1 AND denom='uwolo' AND memo ~* $2",
    [CHAIN, memoPattern],
  );
  await client.query("ROLLBACK");

  const amount = BigInt(claim.amount_wolo) * 1_000_000n;
  const candidates = matches.map((row) => ({
    timestampUtc: new Date(row.timestamp).toISOString(),
    transferIndex: row.transfer_index,
    publicTxHash: /^[0-9A-Fa-f]{64}$/.test(String(row.tx_hash)) ? row.tx_hash : "invalid/withheld",
    memoIdentifierMatch: row.has_identifier === true,
    aroundRecordedAttempt: row.near_attempt === true,
    amountMatchesClaim: BigInt(row.amount_uwolo) === amount,
    chainTxSuccessIndependentlyConfirmed: false,
    exactRecipientIndependentlyConfirmed: false,
  }));
  const clipped = totals[0]?.matches > candidates.length;
  const strictCandidates = candidates.filter(x => x.memoIdentifierMatch && x.amountMatchesClaim);
  console.log(JSON.stringify({
    observedAtUtc: new Date().toISOString(),
    kind: "read_only_app_index_candidate_hunt",
    claimId: CLAIM_ID,
    claimStillPendingWithoutTxProof: true,
    indexedTransferScope: {
      chain: CHAIN,
      denom: DENOM,
      indexedRows: coverage.total,
      oldestIndexedUtc: coverage.oldest ? new Date(coverage.oldest).toISOString() : null,
      newestIndexedUtc: coverage.newest ? new Date(coverage.newest).toISOString() : null,
      rowsWithin48HoursOfAttempt: coverage.around_attempt,
      completeness: "UNKNOWN: app transfer index is partial, source sync may omit historical txs",
    },
    memoPatternHits: totals[0]?.matches,
    responseTruncated: clipped,
    strongestCandidateCountInReturnedPage: strictCandidates.length,
    candidates,
    verdict: strictCandidates.length ? "POSSIBLE_MATCHES_REQUIRE_EXACT_CHAIN_TX_PROOF" : "INCONCLUSIVE_NO_PROOF_FROM_PARTIAL_INDEX",
    writesPerformed: false,
    transferBroadcasts: false,
    claimStatusChanged: false,
    releaseAuthorized: false,
    limitations: "Neither presence nor absence in the app index proves this claim was paid. Check success code, exact sender, recipient, uwolo amount, memo and transfer ordinal directly on wolo-1 before any resolution.",
  }, null, 2));
  process.exitCode = 3;
} catch {
  console.error("BLOCKED: historical claim/index could not be read consistently, or schema drifted");
  process.exitCode = 2;
} finally {
  if (connected) await client.end().catch(() => {});
}
