export const LEADERBOARD_STEAM_ID64_PATTERN =
  /^\d{17}$/;

export type LeaderboardIdentityKind =
  | "steam"
  | "name"
  | "site";

export type LeaderboardReplayResult =
  | "win"
  | "loss"
  | "unknown";

export type LeaderboardNameHistoryEntry = {
  name: string;
  normalizedName: string;
  games: number;
  wins: number;
  losses: number;
  unknowns: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type LeaderboardNameObservation = {
  name: string;
  normalizedName?: string | null;
  observedAt: string | null;
  result: LeaderboardReplayResult;
};

export type LeaderboardRankDelta24hState =
  | "up"
  | "down"
  | "unchanged"
  | "new"
  | "unranked";

export type LeaderboardRankDelta24h = {
  rank24hAgo: number | null;
  rankDelta24h: number | null;
  rankDelta24hState:
    LeaderboardRankDelta24hState;
};

export function normalizeLeaderboardSteamId(
  value: unknown,
) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return LEADERBOARD_STEAM_ID64_PATTERN.test(
    normalized,
  )
    ? normalized
    : null;
}

export function readLeaderboardSteamId(
  player: Record<string, unknown>,
) {
  for (const key of [
    "steam_id",
    "steamId",
    "user_id",
  ]) {
    const steamId =
      normalizeLeaderboardSteamId(
        player[key],
      );

    if (steamId) {
      return steamId;
    }
  }

  return null;
}

export function normalizeLeaderboardIdentityName(
  value: string | null | undefined,
) {
  return normalizeLeaderboardDisplayName(
    value,
  )
    .toLocaleLowerCase("en-US");
}

export function normalizeLeaderboardDisplayName(
  value: string | null | undefined,
) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

export function buildLeaderboardNameHistory(
  observations: LeaderboardNameObservation[],
): LeaderboardNameHistoryEntry[] {
  const historyByName =
    new Map<
      string,
      LeaderboardNameHistoryEntry
    >();

  for (const observation of observations) {
    const name =
      normalizeLeaderboardDisplayName(
        observation.name,
      );
    const normalizedName =
      normalizeLeaderboardIdentityName(
        observation.normalizedName ??
          name,
      );

    if (!name || !normalizedName) {
      continue;
    }

    let history =
      historyByName.get(
        normalizedName,
      );

    if (!history) {
      history = {
        name,
        normalizedName,
        games: 0,
        wins: 0,
        losses: 0,
        unknowns: 0,
        firstSeenAt:
          observation.observedAt,
        lastSeenAt:
          observation.observedAt,
      };

      historyByName.set(
        normalizedName,
        history,
      );
    }

    history.games += 1;

    if (observation.result === "win") {
      history.wins += 1;
    } else if (
      observation.result === "loss"
    ) {
      history.losses += 1;
    } else {
      history.unknowns += 1;
    }

    if (observation.observedAt) {
      if (
        !history.firstSeenAt ||
        observation.observedAt <
          history.firstSeenAt
      ) {
        history.firstSeenAt =
          observation.observedAt;
      }

      if (
        !history.lastSeenAt ||
        observation.observedAt >
          history.lastSeenAt
      ) {
        history.lastSeenAt =
          observation.observedAt;
        history.name = name;
      }
    }
  }

  return Array.from(
    historyByName.values(),
  ).sort(
    (left, right) =>
      String(
        right.lastSeenAt ?? "",
      ).localeCompare(
        String(left.lastSeenAt ?? ""),
      ) ||
      left.name.localeCompare(
        right.name,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      ),
  );
}

export function buildLeaderboardIdentityKey(
  input: {
    steamId?: string | null;
    name?: string | null;
    normalizedName?: string | null;
    claimedUid?: string | null;
  },
) {
  const steamId =
    normalizeLeaderboardSteamId(
      input.steamId,
    );

  if (steamId) {
    return `steam:${steamId}`;
  }

  const claimedUid =
    String(input.claimedUid ?? "").trim();

  if (claimedUid) {
    return `claimed:${claimedUid}`;
  }

  const name =
    normalizeLeaderboardIdentityName(
      input.normalizedName ??
        input.name,
    );

  return name ? `replay:${name}` : null;
}

export function resolveRankDelta24h(
  input: {
    currentRank: number | null;
    previousRank: number | null;
    currentlyRanked: boolean;
    previouslyRanked: boolean;
  },
): LeaderboardRankDelta24h {
  if (
    !input.currentlyRanked ||
    input.currentRank === null
  ) {
    return {
      rank24hAgo: null,
      rankDelta24h: null,
      rankDelta24hState: "unranked",
    };
  }

  if (
    !input.previouslyRanked ||
    input.previousRank === null
  ) {
    return {
      rank24hAgo: null,
      rankDelta24h: null,
      rankDelta24hState: "new",
    };
  }

  const rankDelta24h =
    input.previousRank -
    input.currentRank;

  return {
    rank24hAgo: input.previousRank,
    rankDelta24h,
    rankDelta24hState:
      rankDelta24h > 0
        ? "up"
        : rankDelta24h < 0
          ? "down"
          : "unchanged",
  };
}
