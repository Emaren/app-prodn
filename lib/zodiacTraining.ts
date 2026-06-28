export type ZodiacTrainingPrimaryCtaMode = "direct_message" | "profile";

export type ZodiacTrainingConfig = {
  enabled: boolean;
  route: "/zodiac";
  userId: number;
  userUid: string;
  headline: string;
  subtitle: string;
  introBody: string;
  dmGuideBody: string | null;
  dmGuideUrl: string | null;
  trainingAvailability: string;
  coachingPriceWolo: number | null;
  steamGroupUrl: string | null;
  featuredReplayIds: number[];
  primaryCtaMode: ZodiacTrainingPrimaryCtaMode;
  publicContactEnabled: boolean;
};

// V1 is intentionally code-managed. Keeping the future profile/admin fields in
// one object lets the page move to persisted controls without rewriting its UI.
export const ZODIAC_TRAINING_CONFIG: ZodiacTrainingConfig = {
  enabled: true,
  route: "/zodiac",
  userId: 124585,
  userUid: "u_06c16d39d25c476fac2c86fee7b4d189",
  headline: "Apprentice Under Zodiac",
  subtitle: "Deathmatch is jazz. Learn the rhythm from one of HD’s old-war killers.",
  introBody:
    "A beginner-safe gate into Deathmatch: learn the civ answer, upload a real game, review the war, then return sharper.",
  dmGuideBody: null,
  dmGuideUrl: null,
  trainingAvailability: "Recruiting new Deathmatch players",
  coachingPriceWolo: null,
  steamGroupUrl: null,
  featuredReplayIds: [],
  primaryCtaMode: "direct_message",
  publicContactEnabled: true,
};

export function isPublicZodiacTrainingContactUid(uid: string | null | undefined) {
  return (
    ZODIAC_TRAINING_CONFIG.enabled &&
    ZODIAC_TRAINING_CONFIG.publicContactEnabled &&
    uid === ZODIAC_TRAINING_CONFIG.userUid
  );
}

export function selectFeaturedZodiacMatches<T extends { id: number }>(
  matches: T[],
  limit = 6
) {
  const requestedIds = ZODIAC_TRAINING_CONFIG.featuredReplayIds;
  const ordered =
    requestedIds.length > 0
      ? requestedIds
          .map((id) => matches.find((match) => match.id === id))
          .filter((match): match is T => Boolean(match))
      : matches;

  return ordered.slice(0, Math.max(0, limit));
}
