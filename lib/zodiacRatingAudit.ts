import type { PublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import type { CurrentWatcherAccountState } from "@/lib/currentWatcherAccountState";
import type { VerifiedWatcherSteamRating } from "@/lib/verifiedWatcherSteamRatings";
import { selectLatestSteamObservation } from "@/lib/verifiedWatcherSteamRatings";
import { PLAYER_RESULT_RECOVERY_TARGETS } from "@/lib/playerResultRecovery";
import type { LeaderboardLane } from "@/lib/leaderboardLane";

type RatingSource =
  | "watcher_current_receipt"
  | "watcher_qualified_upload"
  | "accepted_hd_header"
  | "unavailable";

type RatingEvidence = {
  rating: number | null;
  observedAt: string | null;
  source: RatingSource;
  currentReceipt: { rating: number | null; observedAt: string | null };
  qualifiedWatcherUpload: { rating: number | null; observedAt: string | null };
  historicalHeader: { rating: number | null; observedAt: string | null };
  differsFromDirectory: boolean;
};

const validRating = (rating: number | null) =>
  typeof rating === "number" && Number.isInteger(rating) &&
  rating >= 1 && rating <= 5000 ? rating : null;

function historicalRating(
  entry: PublicPlayerDirectory["allEntries"][number] | undefined,
  lane: LeaderboardLane,
) {
  const candidates = (entry?.replayEvidence ?? []).flatMap(item => {
    const rating = validRating(lane === "dm" ? item.steamDmRating : item.steamRmRating);
    const when = item.ratingObservedAt ? new Date(item.ratingObservedAt).getTime() : NaN;
    return rating !== null && Number.isFinite(when)
      ? [{ rating, observedAt: item.ratingObservedAt!, when }]
      : [];
  }).sort((a,b) => b.when - a.when);
  const best = candidates[0];
  return { rating: best?.rating ?? null, observedAt: best?.observedAt ?? null };
}

function explainLane(
  entry: PublicPlayerDirectory["allEntries"][number] | undefined,
  current: CurrentWatcherAccountState | undefined,
  uploaded: VerifiedWatcherSteamRating | undefined,
  lane: LeaderboardLane,
): RatingEvidence {
  const receipt = {
    rating: validRating(lane === "dm" ? current?.steamDmRating ?? null : current?.steamRmRating ?? null),
    observedAt: (lane === "dm" ? current?.steamDmObservedAt : current?.steamRmObservedAt) ?? null,
  };
  const qualified = {
    rating: validRating(lane === "dm" ? uploaded?.steamDmRating ?? null : uploaded?.steamRmRating ?? null),
    observedAt: (lane === "dm" ? uploaded?.steamDmObservedAt : uploaded?.steamRmObservedAt) ?? null,
  };
  const prior = historicalRating(entry, lane);
  const latest = selectLatestSteamObservation(
    receipt.rating, receipt.observedAt,
    qualified.rating, qualified.observedAt,
  );
  const value = latest.rating ?? prior.rating;
  const observedAt = latest.observedAt ?? prior.observedAt;
  const source: RatingSource = latest.rating !== null
    ? receipt.rating === latest.rating && receipt.observedAt === latest.observedAt
      ? "watcher_current_receipt" : "watcher_qualified_upload"
    : prior.rating !== null ? "accepted_hd_header" : "unavailable";
  const directoryValue = validRating(lane === "dm"
    ? entry?.steamDmRating ?? null : entry?.steamRmRating ?? null);
  return {
    rating: value, observedAt, source,
    currentReceipt: receipt,
    qualifiedWatcherUpload: qualified,
    historicalHeader: prior,
    differsFromDirectory: value !== directoryValue,
  };
}

/**
 * Pure read-only evidence projection. Exact Steam IDs are authoritative,
 * not current display names or a human's asserted set of aliases.
 * This does not update ratings, winners, results, wagers or identities.
 */
export function buildZodiacRatingAudit(
  directory: PublicPlayerDirectory,
  currentStates: readonly CurrentWatcherAccountState[],
  qualifiedUploads: readonly VerifiedWatcherSteamRating[],
  generatedAt = new Date().toISOString(),
) {
  const byKey = new Map(directory.allEntries.map(entry => [entry.key, entry]));
  const currentById = new Map(currentStates.map(x => [x.steamId, x]));
  const uploadsById = new Map(qualifiedUploads.map(x => [x.steamId, x]));
  return {
    schema: "aoe2war-zodiac-rating-audit/v1",
    generatedAt,
    readOnly: true,
    rules: {
      rating: "Steam RM/DM observations from exact Watcher account receipt or qualifying signed/historical Watcher upload, then accepted HD-header fallback",
      winLoss: "Accepted public replay/player adjudication only; unresolved outcomes do not change Steam rating",
      identity: "One independent rating per exact SteamID64; historical names on that ID are aliases, not proof of extra Steam accounts",
    },
    players: PLAYER_RESULT_RECOVERY_TARGETS.map(target => {
      const entry = byKey.get(`steam:${target.steamId}`);
      const current = currentById.get(target.steamId);
      const uploaded = uploadsById.get(target.steamId);
      const unknown = (entry?.replayEvidence ?? [])
        .filter(x => x.result === "unknown")
        .sort((a,b) => (b.observedAt ?? "").localeCompare(a.observedAt ?? ""));
      return {
        key: target.key,
        steamId: target.steamId,
        expectedName: target.name,
        displayedName: entry?.name ?? null,
        aliases: entry?.nameHistory.map(n => n.name) ?? [],
        counts: {
          total: entry?.totalMatches ?? null,
          wins: entry?.wins ?? null,
          losses: entry?.losses ?? null,
          unresolved: entry?.unknowns ?? null,
          sampleUnresolvedGameIds: unknown.slice(0, 12).map(x => x.gameStatsId),
        },
        lastAcceptedBattleAt: entry?.lastPlayedAt ?? null,
        latestWatcherAccountObservationAt: current?.lastObservedAt ?? null,
        dm: explainLane(entry, current, uploaded, "dm"),
        rm: explainLane(entry, current, uploaded, "rm"),
        evidenceMissing: !entry,
      };
    }),
  };
}
