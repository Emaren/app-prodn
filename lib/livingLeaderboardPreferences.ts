export const LIVING_LEADERBOARD_WINDOW_ROWS =
  [25, 50, 100] as const;

export const LIVING_LEADERBOARD_TIME_WINDOWS =
  [1, 3, 7, 30] as const;

export const LIVING_LEADERBOARD_HERO_TITLE_STYLE_COUNT =
  18;

export const DEFAULT_LIVING_LEADERBOARD_HERO_TITLE_STYLE =
  2;

export const LIVING_LEADERBOARD_COLUMNS = [
  "rating",
  "movement24h",
  "last10",
  "last30",
  "winRate",
  "record",
  "games",
  "streak",
  "lastPlayed",
] as const;

export const DEFAULT_LIVING_LEADERBOARD_VISIBLE_COLUMNS = [
  "rating",
  "movement24h",
  "last10",
  "last30",
  "winRate",
  "record",
  "games",
  "streak",
] as const;

export type LivingLeaderboardWindowRows =
  (typeof LIVING_LEADERBOARD_WINDOW_ROWS)[number];

export type LivingLeaderboardTimeWindowDays =
  (typeof LIVING_LEADERBOARD_TIME_WINDOWS)[number];

export type LivingLeaderboardColumnKey =
  (typeof LIVING_LEADERBOARD_COLUMNS)[number];

export type LivingLeaderboardColumnMode =
  | "auto"
  | "custom";

export type LivingLeaderboardSpotlightMode =
  | "off"
  | "center";

export type LivingLeaderboardMoverDirection =
  | "both"
  | "up"
  | "down";

export type LivingLeaderboardDiscoveryMode =
  | "rank"
  | "activity"
  | "movers"
  | "heat";

export type LivingLeaderboardDrilldownMode =
  | 1
  | 2
  | 3;

export type LivingLeaderboardHiddenPlayer = {
  key: string;
  name: string;
};

export type LivingLeaderboardPreferences = {
  spotlightMode: LivingLeaderboardSpotlightMode;
  rankWindowStart: number | null;
  rankWindowRows: LivingLeaderboardWindowRows;

  hiddenPlayers: LivingLeaderboardHiddenPlayer[];
  bookmarkedPlayerKeys: string[];
  bookmarkedOnly: boolean;

  dense: boolean;
  pulseActive: boolean;
  heroTitleStyle: number;
  drilldownMode:
    LivingLeaderboardDrilldownMode;

  columnMode: LivingLeaderboardColumnMode;
  visibleColumns: LivingLeaderboardColumnKey[];

  discoveryMode: LivingLeaderboardDiscoveryMode;
  activityWindowDays: LivingLeaderboardTimeWindowDays;
  moverWindowDays: LivingLeaderboardTimeWindowDays;
  moverDirection: LivingLeaderboardMoverDirection;
  heatWindowDays: LivingLeaderboardTimeWindowDays;
};

export const DEFAULT_LIVING_LEADERBOARD_PREFERENCES:
  LivingLeaderboardPreferences = {
    spotlightMode: "off",
    rankWindowStart: null,
    rankWindowRows: 50,

    hiddenPlayers: [],
    bookmarkedPlayerKeys: [],
    bookmarkedOnly: false,

    dense: false,
    pulseActive: true,
    heroTitleStyle:
      DEFAULT_LIVING_LEADERBOARD_HERO_TITLE_STYLE,
    drilldownMode: 1,

    columnMode: "auto",
    visibleColumns: [
      ...DEFAULT_LIVING_LEADERBOARD_VISIBLE_COLUMNS,
    ],

    discoveryMode: "rank",
    activityWindowDays: 1,
    moverWindowDays: 1,
    moverDirection: "both",
    heatWindowDays: 1,
  };

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function cleanKey(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim().slice(0, 180)
    : "";
}

function cleanName(
  value: unknown,
) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100)
    : "";
}

function normalizeWindowRows(
  value: unknown,
): LivingLeaderboardWindowRows {
  return LIVING_LEADERBOARD_WINDOW_ROWS.includes(
    value as LivingLeaderboardWindowRows,
  )
    ? (value as LivingLeaderboardWindowRows)
    : DEFAULT_LIVING_LEADERBOARD_PREFERENCES.rankWindowRows;
}

function normalizeTimeWindow(
  value: unknown,
): LivingLeaderboardTimeWindowDays {
  return LIVING_LEADERBOARD_TIME_WINDOWS.includes(
    value as LivingLeaderboardTimeWindowDays,
  )
    ? (value as LivingLeaderboardTimeWindowDays)
    : 1;
}

function normalizeColumns(
  value: unknown,
): LivingLeaderboardColumnKey[] {
  if (!Array.isArray(value)) {
    return [
      ...DEFAULT_LIVING_LEADERBOARD_VISIBLE_COLUMNS,
    ];
  }

  const requested =
    new Set(
      value.filter(
        (
          item,
        ): item is string =>
          typeof item === "string",
      ),
    );

  return LIVING_LEADERBOARD_COLUMNS.filter(
    (column) =>
      requested.has(column),
  );
}

function normalizeHiddenPlayers(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen =
    new Set<string>();

  const rows:
    LivingLeaderboardHiddenPlayer[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const key =
      cleanKey(item.key);

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    rows.push({
      key,
      name:
        cleanName(item.name) ||
        key,
    });

    if (rows.length >= 100) {
      break;
    }
  }

  return rows;
}

function normalizeKeys(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const keys =
    Array.from(
      new Set(
        value
          .map(cleanKey)
          .filter(Boolean),
      ),
    );

  return keys.slice(0, 150);
}

export function normalizeLivingLeaderboardPreferences(
  value: unknown,
): LivingLeaderboardPreferences {
  const input =
    isRecord(value)
      ? value
      : {};

  const spotlightMode:
    LivingLeaderboardSpotlightMode =
    input.spotlightMode === "center" ||
    input.spotlightMode === "top"
      ? "center"
      : "off";

  const rankWindowStartRaw =
    typeof input.rankWindowStart ===
      "number"
      ? input.rankWindowStart
      : null;

  const rankWindowStart =
    rankWindowStartRaw !== null &&
    Number.isFinite(
      rankWindowStartRaw,
    )
      ? Math.max(
          1,
          Math.min(
            100_000,
            Math.floor(
              rankWindowStartRaw,
            ),
          ),
        )
      : null;

  const drilldownMode:
    LivingLeaderboardDrilldownMode =
    input.drilldownMode === 2 ||
    input.drilldownMode === 3
      ? input.drilldownMode
      : 1;

  const moverDirection:
    LivingLeaderboardMoverDirection =
    input.moverDirection === "up" ||
    input.moverDirection === "down"
      ? input.moverDirection
      : "both";

  const columnMode:
    LivingLeaderboardColumnMode =
    input.columnMode === "custom"
      ? "custom"
      : "auto";

  const discoveryMode:
    LivingLeaderboardDiscoveryMode =
    input.discoveryMode === "activity" ||
    input.discoveryMode === "movers" ||
    input.discoveryMode === "heat"
      ? input.discoveryMode
      : "rank";

  return {
    spotlightMode,
    rankWindowStart,
    rankWindowRows:
      normalizeWindowRows(
        input.rankWindowRows,
      ),

    hiddenPlayers:
      normalizeHiddenPlayers(
        input.hiddenPlayers,
      ),
    bookmarkedPlayerKeys:
      normalizeKeys(
        input.bookmarkedPlayerKeys,
      ),
    bookmarkedOnly:
      input.bookmarkedOnly === true,

    dense:
      input.dense === true,
    pulseActive:
      input.pulseActive !== false,
    heroTitleStyle:
      typeof input.heroTitleStyle ===
        "number" &&
      Number.isFinite(
        input.heroTitleStyle,
      )
        ? Math.max(
            0,
            Math.min(
              LIVING_LEADERBOARD_HERO_TITLE_STYLE_COUNT -
                1,
              Math.floor(
                input.heroTitleStyle,
              ),
            ),
          )
        : DEFAULT_LIVING_LEADERBOARD_HERO_TITLE_STYLE,
    drilldownMode,

    columnMode,
    visibleColumns:
      normalizeColumns(
        input.visibleColumns,
      ),

    discoveryMode,
    activityWindowDays:
      normalizeTimeWindow(
        input.activityWindowDays,
      ),
    moverWindowDays:
      normalizeTimeWindow(
        input.moverWindowDays,
      ),
    moverDirection,
    heatWindowDays:
      normalizeTimeWindow(
        input.heatWindowDays,
      ),
  };
}
