import {
  getTileViewMode,
  hasExplicitTileViewPreference,
  type TileViewKey,
  type TileViewMode,
  type TileViewPreferences,
} from "./tileViewPreferences.ts";
import {
  normalizeLeaderboardLane,
  type LeaderboardLane,
} from "./leaderboardLane.ts";

export const ADMIN_TILE_VIEW_SURFACES = [
  { tileKey: "community_lobby", label: "Community Lobby" },
  { tileKey: "live_games", label: "Live Games" },
  { tileKey: "forum", label: "Forum" },
] as const satisfies ReadonlyArray<{ tileKey: TileViewKey; label: string }>;

type UserWithTileViewPreferences = {
  appearance?: {
    tileViewPreferences?: TileViewPreferences | null;
    leaderboardLane?: LeaderboardLane | string | null;
  } | null;
};

export type AdminTileViewBreakdown = {
  tileKey: TileViewKey;
  label: string;
  basicCount: number;
  advancedCount: number;
  extremeCount: number;
  basicPercent: number;
  advancedPercent: number;
  extremePercent: number;
  explicitCount: number;
  defaultCount: number;
  preferredMode: TileViewMode;
};

function preferredMode(counts: Record<TileViewMode, number>): TileViewMode {
  if (counts.extreme >= counts.advanced && counts.extreme >= counts.basic) {
    return "extreme";
  }
  if (counts.advanced >= counts.basic) {
    return "advanced";
  }
  return "basic";
}

export function buildAdminTileViewBreakdown(
  users: UserWithTileViewPreferences[]
): AdminTileViewBreakdown[] {
  return ADMIN_TILE_VIEW_SURFACES.map(({ tileKey, label }) => {
    const counts: Record<TileViewMode, number> = {
      basic: 0,
      advanced: 0,
      extreme: 0,
    };
    let explicitCount = 0;

    for (const user of users) {
      const preferences = user.appearance?.tileViewPreferences;
      counts[getTileViewMode(preferences, tileKey)] += 1;
      if (hasExplicitTileViewPreference(preferences, tileKey)) {
        explicitCount += 1;
      }
    }

    const basicPercent =
      users.length > 0 ? Math.round((counts.basic / users.length) * 100) : 0;
    const advancedPercent =
      users.length > 0 ? Math.round((counts.advanced / users.length) * 100) : 0;
    const extremePercent =
      users.length > 0
        ? Math.max(0, 100 - basicPercent - advancedPercent)
        : 0;

    return {
      tileKey,
      label,
      basicCount: counts.basic,
      advancedCount: counts.advanced,
      extremeCount: counts.extreme,
      basicPercent,
      advancedPercent,
      extremePercent,
      explicitCount,
      defaultCount: users.length - explicitCount,
      preferredMode: preferredMode(counts),
    };
  });
}

export function buildAdminLeaderboardLaneBreakdown(
  users: UserWithTileViewPreferences[]
) {
  const counts: Record<LeaderboardLane, number> = {
    rm: 0,
    dm: 0,
  };

  for (const user of users) {
    counts[normalizeLeaderboardLane(user.appearance?.leaderboardLane)] += 1;
  }

  const total = users.length;
  const rmPercent = total > 0 ? Math.round((counts.rm / total) * 100) : 0;

  return {
    rmCount: counts.rm,
    dmCount: counts.dm,
    rmPercent,
    dmPercent: total > 0 ? Math.max(0, 100 - rmPercent) : 0,
    preferredLane: counts.dm > counts.rm ? ("dm" as const) : ("rm" as const),
  };
}
