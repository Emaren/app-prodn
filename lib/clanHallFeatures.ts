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
  realtime: false,
  optimisticMessages: false,
  presence: false,
  typing: false,
  inviteDoor: false,
  delegatedRecruiting: false,
  hallScribe: false,
  replies: false,
  pins: false,
  search: false,
  media: false,
  replayCards: false,
};

const AOE2WAR_FLAGSHIP_FEATURES: ClanHallFeatureProfile = {
  ...BASELINE_CLAN_HALL_FEATURES,
  realtime: true,
  optimisticMessages: true,
  inviteDoor: true,
  hallScribe: true,
};

const FLAGSHIP_BY_SLUG: Record<string, ClanHallFeatureProfile> = {
  aoe2war: AOE2WAR_FLAGSHIP_FEATURES,
};

export function getClanHallFeatures(
  slug: string,
): ClanHallFeatureProfile {
  return (
    FLAGSHIP_BY_SLUG[slug.trim().toLowerCase()] ??
    BASELINE_CLAN_HALL_FEATURES
  );
}

export function clanHallFeatureEnabled(
  slug: string,
  feature: ClanHallFeatureKey,
) {
  return getClanHallFeatures(slug)[feature];
}
