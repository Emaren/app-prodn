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
