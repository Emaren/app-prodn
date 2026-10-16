/**
 * Fail-closed name-to-claimant resolution for legacy WOLO rewards.
 *
 * A display/player name is NOT cryptographic wallet ownership. This routine
 * only eliminates ambiguous matches from the legacy admin discovery path.
 * The independently gated payout code must still verify target, wallet,
 * entitlement, signer and unique on-chain transfer proof.
 */
export type WoloClaimNameCandidate = {
  id: number;
  inGameName: string | null;
  steamPersonaName: string | null;
};

export const WOLO_CLAIM_MATCH_CENSUS_LIMIT = 250;

/**
 * Caller intentionally retrieves LIMIT + 1 eligible users. A saturated
 * result could conceal a second matching claimant and must never select
 * the first visible name as the recipient of somebody's WOLO.
 */
export function uniquelyMatchedWoloClaimCandidate<T extends WoloClaimNameCandidate>(
  claimKeys: readonly string[],
  users: readonly T[],
  normalizedKey: (name: string | null | undefined) => string,
): T | null {
  if (claimKeys.length === 0 || users.length > WOLO_CLAIM_MATCH_CENSUS_LIMIT) return null;
  const keys = new Set(claimKeys.filter(Boolean));
  if (keys.size === 0) return null;
  let match: T | null = null;
  const seenIds = new Set<number>();
  for (const user of users) {
    if (!Number.isSafeInteger(user.id) || user.id < 1 || seenIds.has(user.id)) {
      return null;
    }
    seenIds.add(user.id);
    const matchingName = [user.inGameName, user.steamPersonaName]
      .map(normalizedKey)
      .some((key) => key !== "" && keys.has(key));
    if (!matchingName) continue;
    if (match !== null) return null; // Shared or reused identity: hold, never guess.
    match = user;
  }
  return match;
}
