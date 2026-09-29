export const CHAMPIONS_V2_ACTIVE_COUNT = 4;
export const CHAMPIONS_V2_VACANT_COUNT = 18;
export const CHAMPIONS_V2_TRIBUTE_POOL_WOLO = 45;

/*
 * Current live reign-tribute policy.
 *
 * These four titles are the only titles currently paying daily Champion
 * Tribute. This is deliberately narrower than the title catalog: vacant,
 * roadmap, World, Women's, RM/DM, team, ELO, and designation titles do not
 * create daily reign obligations until their economics are explicitly
 * activated.
 */
export const ACTIVE_REIGN_TRIBUTE_TROPHY_IDS = [
  "canada_champion_belt",
  "usa_champion_belt",
  "mexico_champion_belt",
  "chaos_champion",
] as const;

const ACTIVE_REIGN_TRIBUTE_TROPHY_ID_SET = new Set<string>(
  ACTIVE_REIGN_TRIBUTE_TROPHY_IDS,
);

/*
 * Historical seeds are not public custody authority forever. These titles are
 * explicitly vacant in the current championship season even if an old Trophy
 * row or static definition still carries obsolete holder data.
 */
export const PUBLIC_FORCED_VACANT_TITLE_IDS = new Set([
  "world",
  "national-uk",
]);

export function trophyHasActiveReignTribute(
  trophyId: string | null | undefined,
) {
  return Boolean(
    trophyId &&
      ACTIVE_REIGN_TRIBUTE_TROPHY_ID_SET.has(
        trophyId.trim().toLowerCase(),
      ),
  );
}

export function titleIsPubliclyForcedVacant(
  titleId: string | null | undefined,
) {
  return Boolean(
    titleId &&
      PUBLIC_FORCED_VACANT_TITLE_IDS.has(
        titleId.trim().toLowerCase(),
      ),
  );
}
