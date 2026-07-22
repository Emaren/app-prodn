import type { PrismaClient } from "@/lib/generated/prisma";
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
  { tileKey: "kingdom_chronicle", label: "Kingdom Chronicle" },
  { tileKey: "rivalries", label: "Rivalries" },
  { tileKey: "academy_hero", label: "Academy Hero" },
  { tileKey: "download_watcher", label: "Download Watcher" },
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


export const KINGDOM_CHRONICLE_AVATAR_EVENT_TYPE = "kingdom_chronicle_avatar_toggle";

type UserForKingdomAvatarPreference = {
  id: number;
  uid: string;
  displayName?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
};

export type KingdomChronicleAvatarPreferenceAnalytics = {
  totalUsers: number;
  onCount: number;
  offCount: number;
  onPercent: number;
  offPercent: number;
  explicitOnCount: number;
  explicitOffCount: number;
  defaultOnCount: number;
  explicitCount: number;
  preferredMode: "on" | "off";
  recent: Array<{
    uid: string;
    displayName: string;
    enabled: boolean;
    at: string;
    path: string | null;
  }>;
};

function displayKingdomAvatarUserName(user: UserForKingdomAvatarPreference) {
  return user.displayName || user.inGameName || user.steamPersonaName || user.uid;
}

function metadataAvatarsEnabled(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return true;
  }

  const value = (metadata as { avatarsEnabled?: unknown }).avatarsEnabled;
  return value !== false;
}

export async function loadKingdomChronicleAvatarPreferenceAnalytics(
  prisma: PrismaClient,
  users: UserForKingdomAvatarPreference[]
): Promise<KingdomChronicleAvatarPreferenceAnalytics> {
  const userIds = users.map((user) => user.id);
  const userById = new Map(users.map((user) => [user.id, user] as const));
  const latestByUserId = new Map<number, {
    enabled: boolean;
    at: Date;
    path: string | null;
  }>();

  if (userIds.length > 0) {
    const events = await prisma.userActivityEvent.findMany({
      where: {
        userId: { in: userIds },
        type: KINGDOM_CHRONICLE_AVATAR_EVENT_TYPE,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        userId: true,
        path: true,
        metadata: true,
        createdAt: true,
      },
      take: Math.max(50, userIds.length * 4),
    });

    for (const event of events) {
      if (latestByUserId.has(event.userId)) {
        continue;
      }

      latestByUserId.set(event.userId, {
        enabled: metadataAvatarsEnabled(event.metadata),
        at: event.createdAt,
        path: event.path,
      });
    }
  }

  let explicitOnCount = 0;
  let explicitOffCount = 0;

  for (const row of latestByUserId.values()) {
    if (row.enabled) explicitOnCount += 1;
    else explicitOffCount += 1;
  }

  const explicitCount = explicitOnCount + explicitOffCount;
  const defaultOnCount = Math.max(0, users.length - explicitCount);
  const onCount = defaultOnCount + explicitOnCount;
  const offCount = explicitOffCount;
  const onPercent = users.length > 0 ? Math.round((onCount / users.length) * 100) : 0;
  const offPercent = users.length > 0 ? Math.max(0, 100 - onPercent) : 0;

  const recent = Array.from(latestByUserId.entries())
    .map(([userId, row]) => {
      const user = userById.get(userId);
      return user
        ? {
            uid: user.uid,
            displayName: displayKingdomAvatarUserName(user),
            enabled: row.enabled,
            at: row.at.toISOString(),
            path: row.path,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  return {
    totalUsers: users.length,
    onCount,
    offCount,
    onPercent,
    offPercent,
    explicitOnCount,
    explicitOffCount,
    defaultOnCount,
    explicitCount,
    preferredMode: onCount >= offCount ? "on" : "off",
    recent,
  };
}
