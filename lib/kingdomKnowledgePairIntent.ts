const PRESERVE_MULTI_REPOSITORY_PATTERNS = [
  /\bleaderboards?\b/i,
  /\brank(?:ed|ing|ings|s)?\b/i,
  /\bratings?\b/i,
  /\belo\b/i,
  /\bprofiles?\b/i,
  /\bsteam\b/i,
  /\bonline\b/i,
  /\bstreaks?\b/i,
  /\bform\b/i,
  /\bcurrent\s+name\b/i,
  /\balias(?:es)?\b/i,
] as const;

const AUTHORITATIVE_RIVALRY_PATTERNS = [
  /\bagainst\b/i,
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\bhead[-\s]?to[-\s]?head\b/i,
  /\bh2h\b/i,
  /\brivalr(?:y|ies)\b/i,
  /\bopponents?\b/i,
  /\bteammates?\b/i,
  /\bmet\b/i,
  /\bmeet(?:s|ing|ings)?\b/i,
  /\bplayed\s+(?:each\s+other|together)\b/i,
  /\bteam\s+games?\b/i,
  /\brecord\s+against\b/i,
] as const;

/**
 * Rivalry-only execution is an optimization, never a semantic authority.
 *
 * False negatives are safe because the normal KKR repository plan still
 * answers the request. False positives are dangerous because they can suppress
 * explicitly requested profile/leaderboard/rating evidence, so mixed-domain
 * wording always keeps normal fanout.
 */
export function isAuthoritativePairRivalryIntent(message: string) {
  const value = String(message || "").trim();
  if (!value) return false;

  if (
    PRESERVE_MULTI_REPOSITORY_PATTERNS.some((pattern) =>
      pattern.test(value),
    )
  ) {
    return false;
  }

  return AUTHORITATIVE_RIVALRY_PATTERNS.some((pattern) =>
    pattern.test(value),
  );
}
