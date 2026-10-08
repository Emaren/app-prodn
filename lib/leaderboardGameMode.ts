import type { LeaderboardLane } from "@/lib/leaderboardLane";

/**
 * Only a known parser-labeled replay mode may contribute competitive results
 * to an RM or DM lane. Unknown/custom modes must not be guessed from maps,
 * names, player ratings, or upload context.
 */
export function classifyLeaderboardReplayMode(value: unknown): LeaderboardLane | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "rm" || normalized === "randommap" || normalized === "rankedmatch") {
    return "rm";
  }
  if (normalized === "dm" || normalized === "deathmatch") {
    return "dm";
  }
  return null;
}

export function summarizeLeaderboardLaneEvidence<T extends {
  gameMode: LeaderboardLane | null;
  result: string;
  observedAt: string | null;
}>(evidence: readonly T[], lane: LeaderboardLane) {
  const selected = evidence.filter((row) => row.gameMode === lane);
  const wins = selected.filter((row) => row.result === "win").length;
  const losses = selected.filter((row) => row.result === "loss").length;
  const unknowns = selected.length - wins - losses;
  const lastPlayedAt = selected.reduce<string | null>((latest, row) => {
    return row.observedAt && (!latest || row.observedAt > latest)
      ? row.observedAt
      : latest;
  }, null);

  return {
    evidence: selected,
    totalMatches: selected.length,
    wins,
    losses,
    unknowns,
    lastPlayedAt,
  };
}
