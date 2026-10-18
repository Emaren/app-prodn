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
};

export function selectKingdomScoreLineage(
  review: KingdomScoreEvidence | null,
  observation: KingdomScoreEvidence | null,
  liveScore: number | null,
): {
  lastReviewScore: number | null;
  dimensions: KingdomScoreDimensions | null;
} {
  return {
    lastReviewScore: review?.score ?? null,
    dimensions: liveScore !== null
      ? (observation?.dimensions ?? null)
      : (review?.dimensions ?? null),
  };
}
