/**
 * Pure presentation validation for a READ-ONLY historical WOLO claim census.
 * The SQL owns fixed classification; never return player names, addresses,
 * payout amounts, transaction memos or raw error text.
 * A missing tx hash is unresolved evidence, NOT proof of nonpayment.
 */
const KINDS = new Set(["bet_payout","bet_refund","winner_bounty","founders_bonus","founders_win","other"]);
const ERAS = new Set(["legacy_era","mainnet_era"]);
const asCount = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;

export function summarizeClaimedWoloWithoutHash(rows) {
  if (!Array.isArray(rows) || rows.length > 12) throw new Error("CLAIM_CENSUS_INVALID_ROWS");
  const seen = new Set();
  let total = 0, current = 0, priorAttempt = 0, proofUrlPresent = 0;
  const groups = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" ||
        !ERAS.has(row.era) || !KINDS.has(row.kind)) throw new Error("CLAIM_CENSUS_INVALID_GROUP");
    const key = row.era + ":" + row.kind;
    if (seen.has(key)) throw new Error("CLAIM_CENSUS_DUPLICATE_GROUP");
    seen.add(key);
    const count = asCount(row.claim_count);
    const attempted = asCount(row.attempted_count);
    const url = asCount(row.proof_url_count);
    if (count === null || attempted === null || url === null ||
        count < 1 || attempted > count || url > count) {
      throw new Error("CLAIM_CENSUS_INVALID_COUNTS");
    }
    total += count;
    if (row.era === "mainnet_era") current += count;
    priorAttempt += attempted;
    proofUrlPresent += url;
    groups.push(Object.freeze({
      era: row.era, kind: row.kind, rowsWithoutPayoutHash: count,
      attemptedWithoutHash: attempted, proofUrlPresentWithoutHash: url,
    }));
  }
  if (![total,current,priorAttempt,proofUrlPresent].every(Number.isSafeInteger)) {
    throw new Error("CLAIM_CENSUS_OVERFLOW");
  }
  return Object.freeze({
    totalRowsRequiringReview: total,
    mainnetEraRowsRequiringReview: current,
    legacyEraRowsRequiringReview: total-current,
    rowsWithPriorAttemptWithoutHash: priorAttempt,
    rowsWithUnverifiedProofUrl: proofUrlPresent,
    groups: Object.freeze(groups),
    classification: total ? "CLAIMED_WITHOUT_PAYOUT_HASH_REVIEW_REQUIRED" : "NO_HASHLESS_CLAIMED_ROWS_OBSERVED",
    writesPerformed: false,
    chainTransactionsPerformed: false,
    payoutAuthorized: false,
    releaseAuthorized: false,
  });
}
