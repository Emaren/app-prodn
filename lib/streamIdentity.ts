export const AOE2WAR_STREAM_SOURCE_TYPES = ["browser", "watcher_native"] as const;

export type AoE2WarStreamSourceType = (typeof AOE2WAR_STREAM_SOURCE_TYPES)[number];

export function normalizeAoE2WarStreamSourceType(
  value: unknown,
  fallback: AoE2WarStreamSourceType,
): AoE2WarStreamSourceType {
  const normalized = String(value ?? "").trim();
  return AOE2WAR_STREAM_SOURCE_TYPES.includes(normalized as AoE2WarStreamSourceType)
    ? (normalized as AoE2WarStreamSourceType)
    : fallback;
}

export function isAoE2WarManagedStream(
  stream: {
    provider?: string | null;
    sourceType?: string | null;
    userId?: number | null;
  },
  userId: number,
) {
  return (
    stream.userId === userId &&
    stream.provider === "aoe2war" &&
    AOE2WAR_STREAM_SOURCE_TYPES.includes(stream.sourceType as AoE2WarStreamSourceType)
  );
}
