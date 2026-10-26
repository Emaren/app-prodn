/** Preserve the dated review independently of a mutable agent feed.
 * Dimension bars must never label expired/unverified agent claims as history.
 * Only an already-authorized live score may select agent dimensions.
 */
export type KingdomScoreDimensions = {
  correctness: number;
  functionality: number;
  performance: number;
  maintainability: number;
  tests: number;
};
export type KingdomScoreEvidence = {
  score: number;
  dimensions?: KingdomScoreDimensions;
  checkedAt?: string;
  sourceVersion?: string;
  evidenceRefs?: string[];
};
export type KingdomHistoricalReview = {
  checkedAt: string | null;
  sourceVersion: string | null;
  evidenceRefs: string[];
};

export function displayedKingdomReviewAt(entry: {
  score: number | null;
  provisionalReviewScore: number | null;
  lastReviewScore: number | null;
  checkedAt: string | null;
  historicalReview: KingdomHistoricalReview | null;
}): string | null {
  return entry.score === null && entry.provisionalReviewScore === null && entry.lastReviewScore !== null
    ? entry.historicalReview?.checkedAt ?? null : entry.checkedAt;
}

export function selectKingdomScoreLineage(
  review: KingdomScoreEvidence | null,
  observation: KingdomScoreEvidence | null,
  liveScore: number | null,
): {
  lastReviewScore: number | null;
  historicalReview: KingdomHistoricalReview | null;
  dimensions: KingdomScoreDimensions | null;
} {
  return {
    lastReviewScore: review?.score ?? null,
    // Never borrow provenance from a newer operator observation. Missing
    // historical metadata remains unknown even when a current feed exists.
    historicalReview: review ? {
      checkedAt: review.checkedAt ?? null,
      sourceVersion: review.sourceVersion ?? null,
      evidenceRefs: [...(review.evidenceRefs ?? [])],
    } : null,
    dimensions: liveScore !== null
      ? (observation?.dimensions ?? null)
      : (review?.dimensions ?? null),
  };
}
