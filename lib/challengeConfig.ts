export const CHALLENGE_NOTE_MAX_CHARS = 160;
export const CHALLENGE_DEFAULT_WAGER_WOLO = 25;
export const CHALLENGE_DEFAULT_GUARANTEE_WOLO = 10;

export const CHAMPIONSHIP_DEFAULT_WAGER_WOLO = 0;
export const CHAMPIONSHIP_CHALLENGE_WAGER_OPTIONS = [0, 100] as const;

export function isChampionshipChallengeWagerAmount(value: number) {
  return CHAMPIONSHIP_CHALLENGE_WAGER_OPTIONS.some((option) => option === value);
}
