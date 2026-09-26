export type WarChestPeriodMode = "weekly" | "all_time";

export type WarChestPeriodMetricSource = {
  settledWolo: number;
  wageredWolo: number;
  weeklySettledWolo: number;
  weeklyWageredWolo: number;
};

export function getWarChestPeriodMetrics(
  entry: WarChestPeriodMetricSource,
  mode: WarChestPeriodMode,
) {
  return mode === "weekly"
    ? {
        settledWolo: entry.weeklySettledWolo,
        wageredWolo: entry.weeklyWageredWolo,
      }
    : {
        settledWolo: entry.settledWolo,
        wageredWolo: entry.wageredWolo,
      };
}

export function getWarChestModeSeedEntries<T>({
  activeMode,
  boardMode,
  boardEntries,
  prefetchedEntriesByMode,
}: {
  activeMode: WarChestPeriodMode;
  boardMode: WarChestPeriodMode;
  boardEntries: T[];
  prefetchedEntriesByMode?: Partial<Record<WarChestPeriodMode, T[]>> | null;
}) {
  if (activeMode === boardMode) {
    return boardEntries;
  }

  return prefetchedEntriesByMode?.[activeMode] ?? [];
}


/**
 * Canonical War Chest UTC-week boundary.
 *
 * Monday 00:00:00.000 UTC starts the reporting week. Callers that fan out
 * independent weekly evidence lanes should derive the boundary once from one
 * captured clock value and share that value across the fan-out.
 */
export function getWarChestUtcWeekStart(now: Date) {
  const weekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );
  const daysSinceMonday =
    (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(
    weekStart.getUTCDate() - daysSinceMonday,
  );
  return weekStart;
}
