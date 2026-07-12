export type ReplayAchievementMetric = {
  key: string;
  label: string;
  value: string | number | boolean;
};

export type ReplayAchievementGroup = {
  key: "military" | "economy" | "technology" | "society";
  label: string;
  metrics: ReplayAchievementMetric[];
};

const GROUPS: ReadonlyArray<{
  key: ReplayAchievementGroup["key"];
  label: string;
}> = [
  { key: "military", label: "Military" },
  { key: "economy", label: "Economy" },
  { key: "technology", label: "Technology" },
  { key: "society", label: "Society" },
];

export function humanizeReplayMetricKey(value: string) {
  return value.replace(/_/g, " ");
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMetricValue(value: unknown): value is string | number | boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

export function getReplayAchievementGroups(
  player: Record<string, unknown>
): ReplayAchievementGroup[] {
  const achievements = readRecord(player.achievements);

  return GROUPS.flatMap((group) => {
    const record = readRecord(achievements[group.key]);
    const metrics = Object.entries(record).flatMap(([key, value]) =>
      isMetricValue(value)
        ? [
            {
              key,
              label: humanizeReplayMetricKey(key),
              value,
            } satisfies ReplayAchievementMetric,
          ]
        : []
    );

    return metrics.length > 0 ? [{ ...group, metrics }] : [];
  });
}
