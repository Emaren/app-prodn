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
import { publicReplayWinnerTruth } from "./publicReplayTruth.ts";
import { resolveReplayResultForPlayer, type ReplayPlayerResultGame } from "./replayPlayerResult.ts";

export type DirectoryPlayerSnapshotResult = {
  resultEligible: boolean;
  resultStatus: string;
  steamId: string | null;
  playerSlot: number | null;
  normalizedName: string;
};

export function canonicalDirectoryParticipantResult(
  game: ReplayPlayerResultGame,
  snapshot: DirectoryPlayerSnapshotResult,
): "win" | "loss" | "unknown" {
  if (!snapshot.resultEligible ||
    (snapshot.resultStatus !== "win" && snapshot.resultStatus !== "loss")) {
    return "unknown";
  }

  // Public result adjudications remain a separate statistics-only authority.
  // This is the same owning resolver used by the Workshop/Observatory.
  const authority = publicReplayWinnerTruth(game);
  if (!authority.statsEligible) return "unknown";

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
