/**
 * Public directory result authority.
 *
 * A previously accepted player snapshot identifies the participant but is not
 * a fresh win/loss permission. In particular, Watcher finals acquired a
 * persisted disconnect/desync veto after some snapshot rows were accepted.
 *
 * Do not use this function as betting or financial settlement authority.
 */
import { normalizeLeaderboardIdentityName, normalizeLeaderboardSteamId } from "./leaderboardIdentity.ts";
import { publicReplayWinnerTruth, type PublicGameStatsLike } from "./publicReplayTruth.ts";
import { resolveReplayResultForPlayer } from "./replayPlayerResult.ts";

export type DirectoryPlayerSnapshotResult = {
  resultEligible: boolean;
  resultStatus: string;
  steamId: string | null;
  playerSlot: number | null;
  normalizedName: string;
};

export function canonicalDirectoryParticipantResult(
  game: PublicGameStatsLike,
  snapshot: DirectoryPlayerSnapshotResult,
): "win" | "loss" | "unknown" {
  // A snapshot from an incomplete/non-final original never grants W/L.
  // Do not let a postgame-looking payload from an intermediate save through.
  if (game.is_final !== true && game.isFinal !== true) return "unknown";

  if (!snapshot.resultEligible ||
    (snapshot.resultStatus !== "win" && snapshot.resultStatus !== "loss")) {
    return "unknown";
  }

  // Public result adjudications remain a separate statistics-only authority.
  // This is the same owning resolver used by the Workshop/Observatory.
  const authority = publicReplayWinnerTruth(game);
  if (!authority.statsEligible) return "unknown";

  // A preserved Watcher row can contain structured participant flags even
  // after its original result-resolution packet explicitly said "review".
  // Those raw flags are observations, not independent terminal authority.
  // A separately accepted stats-only adjudication remains the exception.
  const acceptedStatsAdjudication =
    authority.truthReasons.includes("replay_result_adjudication");
  if (!acceptedStatsAdjudication) {
    const keyEvents = (() => {
      const raw = game.key_events ?? game.keyEvents;
      if (typeof raw === "string") {
        try { return JSON.parse(raw) as unknown; } catch { return null; }
      }
      return raw;
    })();
    const key = keyEvents && typeof keyEvents === "object" &&
      !Array.isArray(keyEvents) ? keyEvents as Record<string, unknown> : {};
    const rawResolution = key.result_resolution;
    const resolution = rawResolution && typeof rawResolution === "object" &&
      !Array.isArray(rawResolution)
      ? rawResolution as Record<string, unknown> : {};
    const status = String(resolution.result_status ?? "").toLowerCase();
    const reason = String(game.parse_reason ?? game.parseReason ?? "").toLowerCase();
    if (
      resolution.result_trusted === false ||
      status === "review_required" ||
      reason === "watcher_final_unparsed" ||
      reason === "hd_final_parse_match_fallback" ||
      reason.startsWith("watcher_inferred_")
    ) return "unknown";
  }

  const steamId = normalizeLeaderboardSteamId(snapshot.steamId);
  const slot = snapshot.playerSlot;
  const name = normalizeLeaderboardIdentityName(snapshot.normalizedName);
  // Never fall back to a matching display name when an exact Steam identity
  // exists; aliases and personas are not independent identity evidence.
  const projected = resolveReplayResultForPlayer(game, (player) => {
    if (steamId) return player.steamId === steamId;
    if (slot !== null && Number.isSafeInteger(slot) && slot > 0) {
      return player.playerNumber === slot &&
        normalizeLeaderboardIdentityName(player.name) === name;
    }
    return Boolean(name) && !player.steamId &&
      normalizeLeaderboardIdentityName(player.name) === name;
  });

  // Even a fresh resolved participant must agree with the saved snapshot.
  // Mismatched or ambiguous identity/side results are evidence for review,
  // never a reason to silently invert a public win into a loss.
  return projected === snapshot.resultStatus ? projected : "unknown";
}
