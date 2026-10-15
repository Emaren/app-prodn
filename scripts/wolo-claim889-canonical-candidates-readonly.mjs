#!/usr/bin/env node
/**
 * Claim #889: cross-examine the app's SAME-AMOUNT historical transfer
 * candidates against independently fetched public wolo-1 transaction bytes.
 * Strictly read-only and ALWAYS non-authoritative for payout/retry/release.
 *
 * This deliberately does not assert a negative about unindexed history.
 * The claim recipient and independently certified payout signer are not
 * inferred from a cached match. They must be reconciled separately.
 */
import { createRequire } from "node:module";
import { classifyClaim889CanonicalCandidate } from "./wolo-claim889-canonical-match.mjs";

const require = createRequire(process.env.AOE2WAR_PACKAGE_JSON?.trim() ||
  new URL("../package.json", import.meta.url));
const { Client } = require("pg");
const CHAIN_RPC = "https://rpc-mainnet.aoe2war.com";
const CHAIN_REST = "https://rest-mainnet.aoe2war.com";
const MAX_CANDIDATES = 12;
const MAX_BYTES = 512 * 1024;
const HASH = /^[a-fA-F0-9]{64}$/;
const required = process.env.DATABASE_URL?.trim();
if (!required) {
  console.error("BLOCKED: isolated read-only production database authority unavailable");
  process.exit(2);
}

async function fetchPublicJson(url) {
  const response = await fetch(url, {
    method: "GET", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(7500), headers: { Accept: "application/json" },
  });
  if (response.status !== 200 || !response.body ||
      Number(response.headers.get("content-length") || 0) > MAX_BYTES) {
    throw new Error("canonical evidence unavailable or too large");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value?.byteLength || 0;
      if (size > MAX_BYTES) throw new Error("oversized chain response");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf8"));
}

const client = new Client({
  connectionString: required,
  application_name: "aoe2war_claim889_canonical_candidate_readonly",
  connectionTimeoutMillis: 7000, statement_timeout: 8000,
  query_timeout: 8000,
  options: "-c default_transaction_read_only=on -c statement_timeout=8000",
});

let connected = false;
try {
  await client.connect();
  connected = true;
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const { rows: claims } = await client.query(
    "SELECT id, claim_kind, claim_group_key, source_founder_bonus_id, " +
    "source_market_id, status, payout_tx_hash, amount_wolo, payout_attempted_at " +
    "FROM pending_wolo_claims WHERE id=889"
  );
  const claim = claims[0];
  if (claims.length !== 1 || claim?.id !== 889 ||
      claim.claim_kind !== "founders_win" ||
      claim.source_founder_bonus_id !== 15 ||
      claim.source_market_id !== 4476 || claim.status !== "pending" ||
      claim.payout_tx_hash !== null || !claim.payout_attempted_at ||
      !Number.isSafeInteger(claim.amount_wolo) || claim.amount_wolo < 1) {
    throw new Error("original claim identity/state drifted");
  }
  const amount = (BigInt(claim.amount_wolo) * 1000000n).toString();
  const { rows: indexed } = await client.query(
    "SELECT DISTINCT tx_hash FROM wolo_indexed_transfers " +
    "WHERE chain_id='wolo-1' AND denom='uwolo' AND amount_uwolo=$1::bigint " +
    "ORDER BY tx_hash LIMIT 13",
    [amount]
  );
  await client.query("ROLLBACK");
  await client.end();
  connected = false;
  if (indexed.length > MAX_CANDIDATES) {
    throw new Error("app cache has more exact-amount candidates than bounded evidence limit");
  }
  if (indexed.some(x => !HASH.test(String(x.tx_hash || "")))) {
    throw new Error("app cache contains an invalid transaction hash");
  }

  const status = await fetchPublicJson(CHAIN_RPC + "/status");
  const node = status?.result?.node_info;
  const sync = status?.result?.sync_info;
  if (node?.network !== "wolo-1" || sync?.catching_up !== false ||
      !/^[1-9][0-9]*$/.test(String(sync?.latest_block_height || ""))) {
    throw new Error("canonical RPC chain authority or synchronization unproven");
  }

  const classifications = [];
  for (const tx of indexed) {
    const hash = String(tx.tx_hash).toUpperCase();
    const data = await fetchPublicJson(CHAIN_REST + "/cosmos/tx/v1beta1/txs/" + hash);
    const result = classifyClaim889CanonicalCandidate({
      claim, cachedTxHash: hash, response: data,
    });
    const txHeight = BigInt(String(data?.tx_response?.height || "0"));
    const currentHeight = BigInt(sync.latest_block_height);
    classifications.push({
      txHash: hash,
      result: result.status,
      canonicalTxSucceeded: result.canonicalTxSucceeded,
      exactFounderMemoMatched: result.exactMemoMatched,
      exactAmountMsgSendCount: result.exactAmountMsgSendCount,
      confirmedBlockHeight: txHeight.toString(),
      confirmationDepth: currentHeight >= txHeight
        ? (currentHeight - txHeight + 1n).toString() : "0",
      recipientVerifiedAgainstClaim: false,
      payoutSignerIndependentlyAttested: false,
    });
  }
  const potential = classifications.filter(x =>
    x.result === "CANONICAL_POSSIBLE_PAYOUT_REQUIRES_RECIPIENT_AND_SIGNER_PROOF");
  console.log(JSON.stringify({
    observedAtUtc: new Date().toISOString(),
    mode: "bounded_canonical_readonly_claim889_candidate_analysis",
    claimId: 889,
    chain: "wolo-1",
    canonicalRpcHealthy: true,
    cachedSameAmountTransactions: indexed.length,
    candidatesAuthenticatedByCanonicalRest: classifications.length,
    possibleChainPayoutCandidates: potential.length,
    candidates: classifications,
    verdict: potential.length
      ? "NEEDS_EXACT_RECIPIENT_SIGNER_AND_COMPLETE_HISTORY_PROOF"
      : "NO_EXACT_CANDIDATE_IN_PARTIAL_CACHE_CHAIN_ABSENCE_UNPROVEN",
    historicalTransferIndexComplete: false,
    claimUnresolved: true,
    balanceOrPayoutMutated: false,
    databaseWrites: false,
    broadcastTransactions: false,
    retryAuthorized: false,
    releaseAuthorized: false,
  }, null, 2));
  process.exitCode = 3;
} catch {
  console.error("BLOCKED: protected claim identity, chain responses, or bounded evidence checks failed");
  process.exitCode = 2;
} finally {
  if (connected) await client.end().catch(() => {});
}
