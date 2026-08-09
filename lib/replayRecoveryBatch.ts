export type ReplayRecoveryGapCandidate = {
  id: number;
  missingIdentityProjection: boolean;
  missingAcceptedResult: boolean;
  staleIdentityResultProjection: boolean;
};

type ReplayRecoveryBatchInput<
  Candidate extends ReplayRecoveryGapCandidate,
> = {
  candidates: readonly Candidate[];
  batchSize: number;
  targetGameStatsId: number | null;
  minuteBucket: number;
};

type ReplayParserRecoveryBatchInput<
  Candidate extends {
    id: number;
  },
> = {
  candidates: readonly Candidate[];
  batchSize: number;
  targetGameStatsId: number | null;
  minuteBucket: number;
};

function boundedBatchSize(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function normalizedBucket(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(Math.trunc(value));
}

function rotatingWindow<Candidate>(
  candidates: readonly Candidate[],
  limit: number,
  minuteBucket: number
) {
  const count = Math.min(limit, candidates.length);
  if (count <= 0) return [];

  const offset =
    (normalizedBucket(minuteBucket) * count) % candidates.length;

  return Array.from(
    { length: count },
    (_entry, index) => candidates[(offset + index) % candidates.length]
  );
}

/**
 * Rotate parser dispatch through the full configured lookback. A replay whose
 * archive or parser plan is permanently unusable may fail every time it is
 * selected, but it cannot monopolize the next timer run or starve older rows.
 */
export function selectReplayParserRecoveryBatch<
  Candidate extends {
    id: number;
  },
>(input: ReplayParserRecoveryBatchInput<Candidate>): Candidate[] {
  const batchSize = boundedBatchSize(input.batchSize);
  if (batchSize === 0 || input.candidates.length === 0) return [];

  if (input.targetGameStatsId !== null) {
    const targeted = input.candidates.find(
      (candidate) => candidate.id === input.targetGameStatsId
    );
    return targeted ? [targeted] : [];
  }

  return rotatingWindow(
    input.candidates,
    batchSize,
    input.minuteBucket
  );
}

/**
 * Select a bounded, progressing recovery batch.
 *
 * Identity gaps retain a 3:1 priority over result-only gaps when both exist,
 * but each lane rotates through its full candidate window. With a one-row
 * batch, three minute buckets serve identity work and the fourth serves result
 * work. A permanently ineligible row therefore cannot monopolize either lane.
 */
export function selectRecurrentReplayRecoveryBatch<
  Candidate extends ReplayRecoveryGapCandidate,
>(input: ReplayRecoveryBatchInput<Candidate>): Candidate[] {
  const batchSize = boundedBatchSize(input.batchSize);
  if (batchSize === 0 || input.candidates.length === 0) return [];

  if (input.targetGameStatsId !== null) {
    const targeted = input.candidates.find(
      (candidate) => candidate.id === input.targetGameStatsId
    );
    return targeted ? [targeted] : [];
  }

  const identityGaps = input.candidates.filter(
    (candidate) =>
      candidate.missingIdentityProjection ||
      candidate.staleIdentityResultProjection
  );
  const resultOnlyGaps = input.candidates.filter(
    (candidate) =>
      !candidate.missingIdentityProjection &&
      candidate.missingAcceptedResult &&
      !candidate.staleIdentityResultProjection
  );

  if (identityGaps.length === 0) {
    return rotatingWindow(resultOnlyGaps, batchSize, input.minuteBucket);
  }
  if (resultOnlyGaps.length === 0) {
    return rotatingWindow(identityGaps, batchSize, input.minuteBucket);
  }

  if (batchSize === 1) {
    const bucket = normalizedBucket(input.minuteBucket);
    const identityTurn = bucket % 4 !== 3;
    const laneBucket = identityTurn
      ? bucket - Math.floor((bucket + 1) / 4)
      : Math.floor(bucket / 4);
    return identityTurn
      ? rotatingWindow(identityGaps, 1, laneBucket)
      : rotatingWindow(resultOnlyGaps, 1, laneBucket);
  }

  let identityQuota = Math.min(
    identityGaps.length,
    Math.max(1, Math.min(batchSize - 1, Math.ceil(batchSize * 0.75)))
  );
  let resultQuota = Math.min(
    resultOnlyGaps.length,
    batchSize - identityQuota
  );

  let remaining = batchSize - identityQuota - resultQuota;
  if (remaining > 0) {
    const extraIdentity = Math.min(
      remaining,
      identityGaps.length - identityQuota
    );
    identityQuota += extraIdentity;
    remaining -= extraIdentity;
  }
  if (remaining > 0) {
    resultQuota += Math.min(
      remaining,
      resultOnlyGaps.length - resultQuota
    );
  }

  return [
    ...rotatingWindow(identityGaps, identityQuota, input.minuteBucket),
    ...rotatingWindow(resultOnlyGaps, resultQuota, input.minuteBucket),
  ];
}
