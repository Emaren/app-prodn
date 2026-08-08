export const KINGDOM_STAKE_REWARD_CAP_WOLO = 1_000_000;

export function cappedRewardPrincipalWolo(
  stakedWolo: number,
  capWolo = KINGDOM_STAKE_REWARD_CAP_WOLO,
) {
  const stake = Number.isFinite(stakedWolo)
    ? Math.max(0, Math.trunc(stakedWolo))
    : 0;
  const cap = Number.isFinite(capWolo)
    ? Math.max(0, Math.trunc(capWolo))
    : KINGDOM_STAKE_REWARD_CAP_WOLO;

  return Math.min(stake, cap);
}

export function forgeEligiblePrincipalWolo(
  stakedWolo: number,
  capWolo = KINGDOM_STAKE_REWARD_CAP_WOLO,
) {
  const stake = Number.isFinite(stakedWolo)
    ? Math.max(0, Math.trunc(stakedWolo))
    : 0;

  return Math.max(0, stake - cappedRewardPrincipalWolo(stake, capWolo));
}

export function cappedRewardWeightForWindow(
  stakedWolo: number,
  windowSeconds: number,
  capWolo = KINGDOM_STAKE_REWARD_CAP_WOLO,
) {
  const seconds = Number.isFinite(windowSeconds)
    ? Math.max(0, Math.trunc(windowSeconds))
    : 0;
  return BigInt(cappedRewardPrincipalWolo(stakedWolo, capWolo)) * BigInt(seconds);
}
