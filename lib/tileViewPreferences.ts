export const TILE_VIEW_STORAGE_KEY = "aoe2hdbets:tile-view-preferences";
export const TILE_VIEW_DEFAULT_VERSION_KEY = "aoe2hdbets:tile-view-default-version";
export const TILE_VIEW_DEFAULT_VERSION = "explicit-live-games-view-20260704";
export const LIVE_GAMES_VIEW_STORAGE_KEY =
  "aoe2hdbets:live-games-view-mode:explicit-20260704";

export const TILE_VIEW_KEYS = [
  "community_lobby",
  "live_games",
  "war_chest",
  "wolo_overview",
  "forum",
  "bounties",
  "kingdom_chronicle",
  "rivalries",
  "speed",
  "academy_hero",
  "download_watcher",
  "leaderboard",
  "workshop",
] as const;

export const TILE_VIEW_MODES = ["basic", "advanced", "extreme"] as const;

export type TileViewKey = (typeof TILE_VIEW_KEYS)[number];
export type TileViewMode = (typeof TILE_VIEW_MODES)[number];
export type TileViewPreferences = Partial<Record<TileViewKey, TileViewMode>>;

const TILE_VIEW_KEY_SET = new Set<string>(TILE_VIEW_KEYS);
const TILE_VIEW_MODE_SET = new Set<string>(TILE_VIEW_MODES);
const DEFAULT_TILE_VIEW_MODES: TileViewPreferences = {
  community_lobby: "extreme",
  live_games: "basic",
  forum: "extreme",
  bounties: "extreme",
  kingdom_chronicle: "extreme",
  rivalries: "extreme",
  speed: "extreme",
  academy_hero: "extreme",
  download_watcher: "extreme",
  leaderboard: "advanced",
  workshop: "extreme",
};

export function isTileViewKey(value: string | null | undefined): value is TileViewKey {
  return Boolean(value && TILE_VIEW_KEY_SET.has(value));
}

export function isTileViewMode(value: string | null | undefined): value is TileViewMode {
  return Boolean(value && TILE_VIEW_MODE_SET.has(value));
}

export function normalizeTileViewPreferences(input: unknown): TileViewPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const output: TileViewPreferences = {};
  for (const [key, value] of Object.entries(input)) {
    if (isTileViewKey(key) && typeof value === "string" && isTileViewMode(value)) {
      output[key] = value;
    }
  }

  return output;
}

export function getTileViewMode(
  preferences: TileViewPreferences | null | undefined,
  tileKey: TileViewKey
): TileViewMode {
  return preferences?.[tileKey] ?? DEFAULT_TILE_VIEW_MODES[tileKey] ?? "basic";
}

export function hasExplicitTileViewPreference(
  preferences: TileViewPreferences | null | undefined,
  tileKey: TileViewKey
) {
  return isTileViewMode(preferences?.[tileKey]);
}

export function setTileViewPreference(
  preferences: TileViewPreferences | null | undefined,
  tileKey: TileViewKey,
  viewMode: TileViewMode
): TileViewPreferences {
  return {
    ...(preferences ?? {}),
    [tileKey]: viewMode,
  };
}

export function readStoredTileViewPreferences(): TileViewPreferences {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const value = window.localStorage.getItem(TILE_VIEW_STORAGE_KEY);
    return normalizeTileViewPreferences(value ? JSON.parse(value) : null);
  } catch {
    return {};
  }
}

export function readStoredLiveGamesViewMode(): TileViewMode {
  if (typeof window === "undefined") {
    return "basic";
  }

  try {
    const value = window.localStorage.getItem(LIVE_GAMES_VIEW_STORAGE_KEY);
    return isTileViewMode(value) ? value : "basic";
  } catch {
    return "basic";
  }
}

export function writeStoredLiveGamesViewMode(viewMode: TileViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LIVE_GAMES_VIEW_STORAGE_KEY, viewMode);
  } catch {
    // Ignore private-mode/localStorage failures. Basic remains the runtime default.
  }
}

export function applyTileViewDefaultMigration(preferences: TileViewPreferences): TileViewPreferences {
  const liveGamesViewMode = readStoredLiveGamesViewMode();

  if (typeof window === "undefined") {
    return {
      ...preferences,
      live_games: liveGamesViewMode,
    };
  }

  try {
    if (window.localStorage.getItem(TILE_VIEW_DEFAULT_VERSION_KEY) === TILE_VIEW_DEFAULT_VERSION) {
      return {
        ...preferences,
        live_games: liveGamesViewMode,
      };
    }
  } catch {
    return {
      ...preferences,
      live_games: liveGamesViewMode,
    };
  }

  return {
    ...preferences,
    forum: "extreme" as const,
    live_games: liveGamesViewMode,
  };
}

export function markTileViewDefaultMigrationApplied() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TILE_VIEW_DEFAULT_VERSION_KEY, TILE_VIEW_DEFAULT_VERSION);
  } catch {
    // Ignore private-mode/localStorage failures. The runtime defaults still render.
  }
}

export function writeStoredTileViewPreferences(preferences: TileViewPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    TILE_VIEW_STORAGE_KEY,
    JSON.stringify(normalizeTileViewPreferences(preferences))
  );
}
