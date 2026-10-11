import type { ChampionTitleState } from "@/lib/champions/titleState";

/**
 * Championship Hall scope:
 * - all explicitly modeled solo, team, ELO and special designation titles;
 * - Canada, USA and Mexico from the established national championship season;
 * - any other national title once live custody exists.
 *
 * The old generic "tag-team" placeholder duplicates the specific 2v2 title,
 * and unclaimed roadmap countries must not inflate the vacant count.
 * Designations count as awardable titles, but are not called belts in copy.
 *
 * These are projections, NOT a payment authorization or evidence of payouts.
 */
const INAUGURAL_NATIONAL_TITLE_IDS = new Set([
  "national-canada",
  "national-usa",
  "national-mexico",
]);

export function championshipHasHolder(title: ChampionTitleState): boolean {
  return title.status === "held" && title.holders.length > 0;
}

export function isTitleInChampionshipHallInventory(title: ChampionTitleState): boolean {
  if (title.id === "tag-team") return false;
  if (title.type !== "national") return true;
  return INAUGURAL_NATIONAL_TITLE_IDS.has(title.id) || championshipHasHolder(title);
}

function validNonnegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Both daily numbers are unexecuted WHAT-IF amounts based on the current
 * configured title economics. Neither activates daily tribute nor bounty
 * accrual. A missing bounty-growth rate contributes zero, not an assumed rate.
 */
export function summarizeChampionshipHall(titles: ChampionTitleState[]) {
  const inventory = titles.filter(isTitleInChampionshipHallInventory);
  const held = inventory.filter(championshipHasHolder);

  return {
    active: held.length,
    vacant: inventory.length - held.length,
    total: inventory.length,
    potentialDailyRewardWolo: held.reduce(
      (sum, title) => sum + validNonnegative(title.dailyWolo), 0,
    ),
    potentialDailyBountyGrowthWolo: held.reduce(
      (sum, title) => sum + validNonnegative(title.bountyGrowthWolo), 0,
    ),
  };
}
