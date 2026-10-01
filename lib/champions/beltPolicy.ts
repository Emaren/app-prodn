import { countriesEligibilityMatch } from "../countryEligibility.ts";
import { eloTrophyIdentity } from "./eloTrophy.ts";

export type ChampionshipMode = "rm" | "dm";
export type BeltDescriptor = {
  trophyId: string; kind?: string; family: string; tier?: string | null;
  eligibleNationality: string | null; eloBandMin: number | null; eloBandMax: number | null;
};
export type ChampionshipPolicy = {
  titleId: string; teamSize: 1 | 2 | 3 | 4; mode: ChampionshipMode | null;
  transferPolicy: "MATCH_WINNER" | "POPULAR_VOTE" | "COMMISSIONER_ONLY";
  priority: number; eligibility: "open" | "elo" | "national" | "regional" | "women" | "unconfigured";
};
const ELO_ORDER = ["rising", "challenger", "veteran", "elite", "legend"];
export const TEAM_CHAMPIONSHIP_IDS = ["2v2-rm", "2v2-dm", "3v3-rm", "3v3-dm", "4v4-rm", "4v4-dm"] as const;

// Registry IDs are shared with Champions/Media Armory. Unknown future classes fail closed.
export function championshipBeltPolicy(trophy: BeltDescriptor): ChampionshipPolicy {
  const id = trophy.trophyId.toLowerCase();
  const team = /^(2|3|4)v\1-(rm|dm)$/.exec(id);
  if (team) return { titleId: id, teamSize: Number(team[1]) as 2 | 3 | 4, mode: team[2] as ChampionshipMode, transferPolicy: "MATCH_WINNER", priority: 2000, eligibility: "open" };
  if (trophy.family === "elo") {
    const identity = eloTrophyIdentity(trophy);
    return { titleId: identity?.canonicalId ?? id, teamSize: 1, mode: identity?.lane ?? null,
      transferPolicy: identity ? "MATCH_WINNER" : "COMMISSIONER_ONLY",
      priority: identity ? ELO_ORDER.indexOf(identity.division) * 2 + (identity.lane === "rm" ? 1 : 0) : 900,
      eligibility: identity ? "elo" : "unconfigured" };
  }
  if (["chaos", "chaos_champion"].includes(id)) return { titleId: "chaos", teamSize: 1, mode: null, transferPolicy: "POPULAR_VOTE", priority: 900, eligibility: "unconfigured" };
  if (["world", "world_champion"].includes(id)) return { titleId: "world", teamSize: 1, mode: null, transferPolicy: "MATCH_WINNER", priority: 1000, eligibility: "open" };
  if (["womens", "womens_champion", "women_champion"].includes(id)) return { titleId: "womens", teamSize: 1, mode: null, transferPolicy: "MATCH_WINNER", priority: 300, eligibility: "women" };
  if (["deathmatch-champion", "death_match_champion", "deathmatch_champion", "dm_champion"].includes(id)) return { titleId: "deathmatch-champion", teamSize: 1, mode: "dm", transferPolicy: "MATCH_WINNER", priority: 100, eligibility: "open" };
  if (["random-map-champion", "random_map_champion", "rm_champion"].includes(id)) return { titleId: "random-map-champion", teamSize: 1, mode: "rm", transferPolicy: "MATCH_WINNER", priority: 101, eligibility: "open" };
  if (["regional-norse", "regional-southeast-asia"].includes(id)) return { titleId: id, teamSize: 1, mode: null, transferPolicy: "MATCH_WINNER", priority: 210, eligibility: "regional" };
  if (trophy.family === "national" && trophy.eligibleNationality) return { titleId: `national-${trophy.eligibleNationality.toLowerCase().replace(/\s+/g,"-")}`, teamSize: 1, mode: null, transferPolicy: "MATCH_WINNER", priority: 200, eligibility: "national" };
  return { titleId: id, teamSize: 1, mode: null, transferPolicy: "COMMISSIONER_ONLY", priority: 800, eligibility: "unconfigured" };
}

export type BeltCandidate = { representedCountry: string | null; genderDivision?: string | null; rmRating?: number | null; dmRating?: number | null };
export function championshipEligibility(trophy: BeltDescriptor, candidate: BeltCandidate, override = false) {
  const policy = championshipBeltPolicy(trophy);
  const result = (eligible: boolean, reasonCode: string, reason: string) => ({ eligible, reasonCode, reason, policy });
  if (override) return result(true, "COMMISSIONER_ELIGIBILITY_OVERRIDE", "Commissioner explicitly bypassed challenger eligibility.");
  if (policy.transferPolicy !== "MATCH_WINNER") return result(false, policy.transferPolicy === "POPULAR_VOTE" ? "POPULAR_VOTE_REQUIRED" : "TITLE_POLICY_UNCONFIGURED", "This title requires its separate Commissioner authority.");
  if (policy.eligibility === "national" && !countriesEligibilityMatch(candidate.representedCountry, trophy.eligibleNationality)) return result(false, "WINNER_NOT_ELIGIBLE_NATION", `Represent ${trophy.eligibleNationality} to challenge this title.`);
  if (policy.eligibility === "regional") {
    // These explicit product lanes mirror Champions V2, including Pakistan's intentional SEA lane.
    const allowed = policy.titleId === "regional-southeast-asia" ? ["Pakistan"] : [];
    if (!allowed.some(country => countriesEligibilityMatch(candidate.representedCountry, country))) return result(false, "WINNER_NOT_ELIGIBLE_REGION", "Your represented country is outside this regional championship policy.");
  }
  if (policy.eligibility === "women" && candidate.genderDivision !== "Woman") return result(false, "WINNER_NOT_ELIGIBLE_DIVISION", "This championship requires the Women's division.");
  if ((policy.titleId === "random-map-champion" || policy.titleId === "deathmatch-champion") && (policy.mode === "rm" ? candidate.rmRating : candidate.dmRating) == null) return result(false,"MODE_AUTHORITY_MISSING",`${policy.mode?.toUpperCase()} rating authority is required for this mode championship.`);
  if (policy.eligibility === "elo") {
    const rating = policy.mode === "dm" ? candidate.dmRating : candidate.rmRating;
    // Existing title policy allows lower divisions to invade upward, never a higher-rated challenger downward.
    if (typeof rating !== "number" || !Number.isFinite(rating)) return result(false, "ELO_AUTHORITY_MISSING", `${policy.mode?.toUpperCase()} rating authority is required.`);
    if (trophy.eloBandMax !== null && rating > trophy.eloBandMax) return result(false, "ELO_NOT_ELIGIBLE", `Your ${policy.mode?.toUpperCase()} rating exceeds this title's upper limit.`);
  }
  return result(true, "ELIGIBLE", "Eligible championship challenger.");
}
export function soloDefenseLadder<T extends BeltDescriptor>(titles: T[], candidate: BeltCandidate) {
  const rows = titles.filter(trophy => championshipBeltPolicy(trophy).teamSize === 1).sort((a,b) => championshipBeltPolicy(a).priority - championshipBeltPolicy(b).priority || a.trophyId.localeCompare(b.trophyId));
  let selected = false;
  return rows.map(trophy => {
    const eligibility = championshipEligibility(trophy, candidate);
    const attackable = eligibility.eligible && !selected;
    if (attackable) selected = true;
    return { trophy, ...eligibility, attackable, protected: eligibility.eligible && !attackable };
  });
}

export function splitTitleUwolo(totalUwolo: bigint, seatCount: number): bigint[] {
  if (totalUwolo < BigInt(0) || !Number.isInteger(seatCount) || seatCount < 1 || seatCount > 4) throw new Error("Invalid championship payout allocation.");
  const count = BigInt(seatCount), base = totalUwolo / count, remainder = totalUwolo % count;
  return Array.from({ length: seatCount }, (_, seat) => base + (BigInt(seat) < remainder ? BigInt(1) : BigInt(0)));
}
export function championshipNftAggregate(seats: Array<{ status: string; txHash: string | null }>, requiredSeats: number) {
  if (seats.length !== requiredSeats) return "blocked";
  const confirmed = seats.filter(seat => seat.status === "confirmed" && Boolean(seat.txHash?.trim())).length;
  return confirmed === requiredSeats ? "confirmed" : confirmed > 0 ? "partial" : "blocked";
}
export function retryableChampionshipNftSeats<T extends { status: string; txHash: string | null }>(seats: T[]) {
  return seats.filter(seat => seat.status !== "confirmed" && !seat.txHash?.trim());
}
