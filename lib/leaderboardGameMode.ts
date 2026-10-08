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

/**
 * The historical HD parse-match fallback sometimes saved its parser version
 * tuple as GameStats.game_type. Its key_events.settings.type survives as
 * independent, explicit HD lobby mode evidence. Recover RM/DM from that
 * source only when the stored scalar is absent, Unknown, or recognizably a
 * mistaken HD version tuple. Never reinterpret TurboRandom9/custom modes.
 *
 * If two explicit mode observations disagree, fail closed rather than
 * assigning a replay to an incorrect ladder. This remains read-only; it
 * does not repair GameStats or elevate any replay's result authority.
 */
export function resolveLeaderboardReplayMode(game: {
  game_type?: unknown;
  key_events?: unknown;
}): LeaderboardLane | null {
  const raw = typeof game.game_type === "string"
    ? game.game_type.trim()
    : "";
  const stored = classifyLeaderboardReplayMode(raw);

  const obj = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  const events = obj(game.key_events);
  const settings = obj(events?.settings);
  const embeddedValue = settings?.type;
  const directValue = events?.type;
  const nestedText = typeof embeddedValue === "string" ? embeddedValue.trim() : "";
  const directText = typeof directValue === "string" ? directValue.trim() : "";

  const isUnknown = (value: string) =>
    !value || value.toLowerCase() === "unknown";
  const nested = classifyLeaderboardReplayMode(nestedText);
  const direct = classifyLeaderboardReplayMode(directText);

  // Incompatible observed modes, including an explicit custom mode, are not
  // evidence for a single RM/DM ladder.
  if (!isUnknown(nestedText) && !isUnknown(directText) &&
      nestedText.toLowerCase() !== directText.toLowerCase()) {
    if (nested !== direct || !nested) return null;
  }
  const embedded = !isUnknown(nestedText) ? nestedText : directText;
  const embeddedLane = classifyLeaderboardReplayMode(embedded);

  if (stored) {
    // A conflicting explicit stored mode is unsafe even if the alternate
    // mode string is a non-RM/DM custom label.
    if (!isUnknown(embedded) && embeddedLane !== stored) return null;
    return stored;
  }

  // A valid non-ladder mode is authoritative negative evidence, not a
  // license to fall back to whichever other field says RM.
  const malformedHdVersion = /^\\(?<Version\\.HD(?::|\\s)/i.test(raw);
  if (raw && !isUnknown(raw) && !malformedHdVersion) return null;

  return embeddedLane;
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
