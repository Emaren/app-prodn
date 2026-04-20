export const SCHEDULED_MATCH_COLOR_TAGS = ["gold", "green", "blue", "red"] as const;

export type ScheduledMatchColorTag = (typeof SCHEDULED_MATCH_COLOR_TAGS)[number];

export type ScheduledMatchViewerPreference = {
  favorite: boolean;
  bookmarked: boolean;
  colorTag: ScheduledMatchColorTag | null;
  updatedAt: string | null;
};

export const EMPTY_SCHEDULED_MATCH_VIEWER_PREFERENCE: ScheduledMatchViewerPreference = {
  favorite: false,
  bookmarked: false,
  colorTag: null,
  updatedAt: null,
};

export function normalizeScheduledMatchColorTag(value: unknown): ScheduledMatchColorTag | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SCHEDULED_MATCH_COLOR_TAGS.includes(normalized as ScheduledMatchColorTag)
    ? (normalized as ScheduledMatchColorTag)
    : null;
}

export function normalizeScheduledMatchViewerPreference(input?: {
  favorite?: boolean | null;
  bookmarked?: boolean | null;
  colorTag?: string | null;
  updatedAt?: Date | string | null;
} | null): ScheduledMatchViewerPreference {
  if (!input) return EMPTY_SCHEDULED_MATCH_VIEWER_PREFERENCE;

  const updatedAt =
    input.updatedAt instanceof Date
      ? input.updatedAt.toISOString()
      : typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : null;

  return {
    favorite: Boolean(input.favorite),
    bookmarked: Boolean(input.bookmarked),
    colorTag: normalizeScheduledMatchColorTag(input.colorTag),
    updatedAt,
  };
}

export function scheduledMatchPreferenceIsEmpty(input: {
  favorite?: boolean | null;
  bookmarked?: boolean | null;
  colorTag?: string | null;
}) {
  return !input.favorite && !input.bookmarked && !normalizeScheduledMatchColorTag(input.colorTag);
}
