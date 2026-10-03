export type ReplayTruthGameArtifactIdentity = {
  id: number;
  replayHash: string | null;
};

export type ReplayTruthParserArtifactAttempt = {
  inputHash: string | null;
};

const SHA256_RE = /^[0-9a-f]{64}$/;

function normalizedSha256(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SHA256_RE.test(normalized) ? normalized : null;
}

/**
 * Parser work is scoped to immutable source bytes, not the historical GameStats
 * row that happened to request the run. If the exact parser identity already
 * attempted a SHA, every GameStats row bound to that same SHA has exhausted
 * that parser attempt and must not be queued for the identical pass again.
 */
export function gameIdsWithExactParserArtifactAttempt(
  games: ReplayTruthGameArtifactIdentity[],
  attempts: ReplayTruthParserArtifactAttempt[],
) {
  const attemptedHashes = new Set(
    attempts
      .map((attempt) => normalizedSha256(attempt.inputHash))
      .filter((hash): hash is string => Boolean(hash)),
  );

  return new Set(
    games
      .filter((game) => {
        const replayHash = normalizedSha256(game.replayHash);
        return replayHash !== null && attemptedHashes.has(replayHash);
      })
      .map((game) => game.id),
  );
}
