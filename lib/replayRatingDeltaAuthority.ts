import type { EloTrophyLane } from "./champions/eloTrophy.ts";
import {
  normalizeReplayPlayer,
  type CanonicalReplayPlayer,
} from "./teamResolution.ts";

export const REPLAY_RATING_DELTA_POLICY_VERSION =
  "rating-delta-v1" as const;

export const REPLAY_RATING_DELTA_MAX_ABS = 128;

type JsonRecord = Record<string, unknown>;

export type ReplayRatingDeltaPlayer = {
  player: CanonicalReplayPlayer;
  rating: number;
};

export type ReplayRatingDeltaEvaluation =
  | {
      eligible: false;
      reason: string;
    }
  | {
      eligible: true;
      reason: "exact_zero_sum_rating_delta";
      lane: EloTrophyLane;
      delta: number;
      winner: ReplayRatingDeltaPlayer;
      loser: ReplayRatingDeltaPlayer;
      source: ReplayRatingDeltaPlayer[];
      later: ReplayRatingDeltaPlayer[];
      teams: Array<{
        teamKey: string;
        players: Array<{
          stablePlayerKey: string;
          name: string;
          normalizedName: string;
          steamId: string | null;
          sourceTeamId: string | null;
          playerNumber: number | null;
        }>;
      }>;
      winningTeamKey: string;
      evidence: {
        submittedVia: "automatic_rating_delta_policy";
        policyVersion: typeof REPLAY_RATING_DELTA_POLICY_VERSION;
        lane: EloTrophyLane;
        ratingDelta: number;
        winnerSteamId: string;
        loserSteamId: string;
        sourceRatings: Record<string, number>;
        laterRatings: Record<string, number>;
      };
    };

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function laneRating(
  value: unknown,
  lane: EloTrophyLane,
) {
  const source = record(value);
  if (!source) return null;

  const candidates =
    lane === "rm"
      ? [
          source.steam_rm_rating,
          source.steamRmRating,
          source.hd_rm_rating,
          source.hdRmRating,
        ]
      : [
          source.steam_dm_rating,
          source.steamDmRating,
          source.hd_dm_rating,
          source.hdDmRating,
        ];

  for (const candidate of candidates) {
    const parsed = integer(candidate);
    if (parsed !== null && parsed >= 0) return parsed;
  }

  return null;
}

function ratedPlayers(
  value: unknown,
  lane: EloTrophyLane,
): ReplayRatingDeltaPlayer[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw) => {
      const player = normalizeReplayPlayer(raw);
      const rating = laneRating(raw, lane);
      if (!player?.steamId || rating === null) return null;
      return { player, rating };
    })
    .filter(
      (
        entry,
      ): entry is ReplayRatingDeltaPlayer =>
        entry !== null,
    );
}

function rosterKey(
  players: ReplayRatingDeltaPlayer[],
) {
  return players
    .map((entry) => entry.player.steamId)
    .sort()
    .join(":");
}

function ratingsBySteamId(
  players: ReplayRatingDeltaPlayer[],
) {
  return new Map(
    players.map((entry) => [
      entry.player.steamId as string,
      entry.rating,
    ]),
  );
}

function resultTeam(
  entry: ReplayRatingDeltaPlayer,
) {
  return {
    teamKey: entry.player.stablePlayerKey,
    players: [
      {
        stablePlayerKey:
          entry.player.stablePlayerKey,
        name:
          entry.player.name,
        normalizedName:
          entry.player.normalizedName,
        steamId:
          entry.player.steamId,
        sourceTeamId:
          entry.player.teamId,
        playerNumber:
          entry.player.playerNumber,
      },
    ],
  };
}

export function evaluateReplayRatingDeltaAuthority(
  input: {
    lane: EloTrophyLane | null;
    sourcePlayers: unknown;
    laterPlayers: unknown;
  },
): ReplayRatingDeltaEvaluation {
  if (!input.lane) {
    return {
      eligible: false,
      reason: "elo_lane_unavailable",
    };
  }

  const source =
    ratedPlayers(
      input.sourcePlayers,
      input.lane,
    );
  const later =
    ratedPlayers(
      input.laterPlayers,
      input.lane,
    );

  if (
    source.length !== 2 ||
    later.length !== 2 ||
    new Set(
      source.map(
        (entry) =>
          entry.player.steamId,
      ),
    ).size !== 2 ||
    new Set(
      later.map(
        (entry) =>
          entry.player.steamId,
      ),
    ).size !== 2
  ) {
    return {
      eligible: false,
      reason:
        "exact_rated_steam_1v1_required",
    };
  }

  if (
    rosterKey(source) !==
    rosterKey(later)
  ) {
    return {
      eligible: false,
      reason: "roster_mismatch",
    };
  }

  const laterRatings =
    ratingsBySteamId(later);

  const deltas = source.map(
    (entry) => {
      const steamId =
        entry.player.steamId as string;
      return {
        entry,
        delta:
          (laterRatings.get(steamId) ??
            entry.rating) -
          entry.rating,
      };
    },
  );

  if (
    deltas.some(
      (entry) =>
        entry.delta === 0,
    )
  ) {
    return {
      eligible: false,
      reason: "rating_unchanged",
    };
  }

  if (
    deltas[0]!.delta +
      deltas[1]!.delta !==
    0
  ) {
    return {
      eligible: false,
      reason:
        "rating_delta_not_zero_sum",
    };
  }

  if (
    Math.sign(
      deltas[0]!.delta,
    ) ===
    Math.sign(
      deltas[1]!.delta,
    )
  ) {
    return {
      eligible: false,
      reason:
        "rating_delta_direction_conflict",
    };
  }

  const magnitude =
    Math.abs(
      deltas[0]!.delta,
    );

  if (
    magnitude < 1 ||
    magnitude >
      REPLAY_RATING_DELTA_MAX_ABS
  ) {
    return {
      eligible: false,
      reason:
        "rating_delta_out_of_bounds",
    };
  }

  const winnerDelta =
    deltas.find(
      (entry) =>
        entry.delta > 0,
    );
  const loserDelta =
    deltas.find(
      (entry) =>
        entry.delta < 0,
    );

  if (
    !winnerDelta ||
    !loserDelta
  ) {
    return {
      eligible: false,
      reason:
        "rating_delta_winner_unresolved",
    };
  }

  const winnerLater =
    later.find(
      (entry) =>
        entry.player.steamId ===
        winnerDelta.entry.player.steamId,
    )!;
  const loserLater =
    later.find(
      (entry) =>
        entry.player.steamId ===
        loserDelta.entry.player.steamId,
    )!;

  const sourceRatingsObject =
    Object.fromEntries(
      source.map(
        (entry) => [
          entry.player
            .steamId as string,
          entry.rating,
        ],
      ),
    );
  const laterRatingsObject =
    Object.fromEntries(
      later.map(
        (entry) => [
          entry.player
            .steamId as string,
          entry.rating,
        ],
      ),
    );

  return {
    eligible: true,
    reason:
      "exact_zero_sum_rating_delta",
    lane: input.lane,
    delta: magnitude,
    winner:
      winnerLater,
    loser:
      loserLater,
    source,
    later,
    teams: source
      .map(resultTeam)
      .sort(
        (left, right) =>
          left.teamKey.localeCompare(
            right.teamKey,
          ),
      ),
    winningTeamKey:
      winnerDelta.entry.player
        .stablePlayerKey,
    evidence: {
      submittedVia:
        "automatic_rating_delta_policy",
      policyVersion:
        REPLAY_RATING_DELTA_POLICY_VERSION,
      lane:
        input.lane,
      ratingDelta:
        magnitude,
      winnerSteamId:
        winnerDelta.entry.player
          .steamId as string,
      loserSteamId:
        loserDelta.entry.player
          .steamId as string,
      sourceRatings:
        sourceRatingsObject,
      laterRatings:
        laterRatingsObject,
    },
  };
}
