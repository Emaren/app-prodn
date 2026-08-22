export const CLAN_HALL_FEATURE_KEYS = [
  "realtime",
  "optimisticMessages",
  "presence",
  "typing",
  "inviteDoor",
  "delegatedRecruiting",
  "hallScribe",
  "replies",
  "pins",
  "search",
  "media",
  "replayCards",
] as const;

export type ClanHallFeatureKey =
  (typeof CLAN_HALL_FEATURE_KEYS)[number];

export type ClanHallFeatureProfile = Record<
  ClanHallFeatureKey,
  boolean
>;

const BASELINE_CLAN_HALL_FEATURES: ClanHallFeatureProfile = {
  realtime: true,
  optimisticMessages: true,
  presence: true,
  typing: false,
  inviteDoor: true,
  delegatedRecruiting: false,
  hallScribe: true,
  replies: false,
  pins: false,
  search: false,
  media: true,
  replayCards: false,
};

const OVERRIDES_BY_SLUG: Record<string, Partial<ClanHallFeatureProfile>> = {};

export function getClanHallFeatures(
  slug: string,
): ClanHallFeatureProfile {
  return {
    ...BASELINE_CLAN_HALL_FEATURES,
    ...(OVERRIDES_BY_SLUG[slug.trim().toLowerCase()] ?? {}),
  };
}

export function clanHallFeatureEnabled(
  slug: string,
  feature: ClanHallFeatureKey,
) {
  return getClanHallFeatures(slug)[feature];
}
