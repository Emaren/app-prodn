export const REPRESENTED_COUNTRIES = ["Canada", "USA", "Mexico", "UK"] as const;
export const GENDER_DIVISIONS = ["Man", "Woman"] as const;

export type RepresentedCountry = (typeof REPRESENTED_COUNTRIES)[number];
export type GenderDivision = (typeof GENDER_DIVISIONS)[number];

export type TributeKind = "REIGN_TRIBUTE" | "ARTIFACT_BONUS";

export type ChampionTitleType =
  | "world"
  | "chaos"
  | "womens"
  | "tag_team"
  | "national"
  | "elo"
  | "designation";

export type ChampionTitleStatus = "held" | "vacant" | "coming_soon";

export type ChampionTone =
  | "gold"
  | "blue"
  | "green"
  | "violet"
  | "silver"
  | "red"
  | "emerald"
  | "slate";

export type ChampionHolder = {
  name: string;
  href?: string;
  meta?: string;
  representedCountry?: RepresentedCountry;
  genderDivision?: GenderDivision;
  invaderChampion?: boolean;
};

export type TitleContender = {
  rank: number;
  name: string;
  href?: string;
  rating?: number | null;
  ratingLabel?: string | null;
  meta?: string | null;
  badge?: string | null;
};

export type ChampionTitleDefinition = {
  id: string;
  slug: string;
  type: ChampionTitleType;
  displayName: string;
  shortName: string;
  eyebrow: string;
  assetUrl: string;
  routeHref: string;
  tributeKind: TributeKind;
  dailyWolo: number;
  status: ChampionTitleStatus;
  holders: ChampionHolder[];
  tone: ChampionTone;
  eligibility: string;
  rule: string;
  challengeCopy: string;
  currentRecord?: string;
  metricKey?: string;
  country?: RepresentedCountry;
  genderDivision?: GenderDivision;
  eloMin?: number;
  eloMax?: number;
  trophyId?: string;
  trophyStatus?: string;
  currentBountyWolo?: number;
  bountyGrowthWolo?: number;
  chainStatus?: string;
  guardianHeld?: boolean;
  holderSince?: string | null;
  lastTributeTxHash?: string | null;
  lastTributePaidAt?: string | null;
  lastTributeAmountWolo?: number | null;
  lastTributeRecipient?: string | null;
  nextTributeDay?: string | null;
  detailLore: string;
  historyPlaceholder: string;
};

export type TitleEconomySection =
  | "podium"
  | "tagTeam"
  | "national"
  | "elo"
  | "designation";

export function tributeLabel(kind: TributeKind) {
  return kind === "ARTIFACT_BONUS" ? "Artifact Bonus" : "Reward Tribute";
}

export function formatDailyTribute(definition: Pick<ChampionTitleDefinition, "tributeKind" | "dailyWolo">) {
  return `${tributeLabel(definition.tributeKind)}: ${definition.dailyWolo} WOLO/day`;
}

export const podiumTitles: ChampionTitleDefinition[] = [
  {
    id: "world",
    slug: "world",
    type: "world",
    displayName: "AoE2WAR World Champion",
    shortName: "World Champion",
    eyebrow: "Open Throne",
    assetUrl: "/champions/belts/aoe2war-world.webp",
    routeHref: "/champions/world",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 25,
    status: "held",
    holders: [
      {
        name: "Sniper",
        href: "/players/by-name/Sniper",
        meta: "Rank #1 and current face of the league",
        representedCountry: "UK",
      },
    ],
    tone: "gold",
    eligibility: "Top-ranked active contenders can call for the throne.",
    rule: "Beat the holder in a verified title challenge or win an eligible vacant title match.",
    challengeCopy: "Challenge for the throne",
    detailLore: "The World Champion is the main AoE2WAR crown: public, hunted, and defended under replay proof.",
    historyPlaceholder: "World title history will lock in as defended matches are verified.",
  },
  {
    id: "chaos",
    slug: "chaos",
    type: "chaos",
    displayName: "Chaos Champion",
    shortName: "Chaos Champion",
    eyebrow: "Open Mayhem",
    assetUrl: "/champions/belts/chaos.webp",
    routeHref: "/champions/chaos",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 15,
    status: "vacant",
    holders: [],
    tone: "blue",
    eligibility: "Admin-curated chaos cards and special-rule fights.",
    rule: "Win the designated chaos title match when the callout window opens.",
    challengeCopy: "Call for chaos",
    detailLore: "The Chaos belt belongs to strange formats, sudden grudge matches, and proof-backed mayhem.",
    historyPlaceholder: "The first chaos reign is still waiting for a verified storm.",
  },
  {
    id: "womens",
    slug: "womens",
    type: "womens",
    displayName: "Women's Champion",
    shortName: "Women's Champion",
    eyebrow: "Women's Division",
    assetUrl: "/champions/belts/womens.webp",
    routeHref: "/champions/womens",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 15,
    status: "vacant",
    holders: [],
    tone: "violet",
    eligibility: "Players with Gender Division set to Woman are eligible.",
    genderDivision: "Woman",
    rule: "Win a verified Women's title challenge or eligible vacant-title match.",
    challengeCopy: "Challenge the division",
    detailLore: "The Women's title keys off the player's profile Gender Division setting and replay-backed results.",
    historyPlaceholder: "The first Women's title match has not been recorded yet.",
  },
];

export const tagTeamTitle: ChampionTitleDefinition = {
  id: "tag-team",
  slug: "tag-team",
  type: "tag_team",
  displayName: "Tag Team Champions",
  shortName: "Tag Team",
  eyebrow: "Two Holders",
  assetUrl: "/champions/belts/tag-team.webp",
  routeHref: "/champions/tag-team",
  tributeKind: "REIGN_TRIBUTE",
  dailyWolo: 15,
  status: "vacant",
  holders: [],
  tone: "silver",
  eligibility: "Verified teams can challenge when both players accept the callout.",
  rule: "Beat the holder pair in a verified team challenge or win an eligible vacant-team match.",
  challengeCopy: "Challenge as a team",
  currentRecord: "Top team queue forming",
  detailLore: "Tag Team Champions hold the paired standard. Both holders receive the daily reign tribute.",
  historyPlaceholder: "Team title history begins with the first proof-backed holder pair.",
};

export const nationalTitles: ChampionTitleDefinition[] = [
  {
    id: "national-canada",
    slug: "canada",
    type: "national",
    displayName: "Canadian Champion",
    shortName: "Canada",
    eyebrow: "Representing Country",
    assetUrl: "/champions/belts/canada.webp",
    routeHref: "/champions/nations/canada",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 10,
    status: "vacant",
    holders: [],
    tone: "red",
    country: "Canada",
    eligibility: "Only players representing Canada can hold or challenge this national belt.",
    rule: "Set Representing Country to Canada, then win the verified national challenge.",
    challengeCopy: "Challenge for Canada",
    detailLore: "National belts follow Representing Country. The Canadian Champion is the proof-backed beacon for Canada.",
    historyPlaceholder: "Canada's title ledger is awaiting its first verified champion.",
  },
  {
    id: "national-usa",
    slug: "usa",
    type: "national",
    displayName: "USA Champion",
    shortName: "USA",
    eyebrow: "Representing Country",
    assetUrl: "/champions/belts/usa.webp",
    routeHref: "/champions/nations/usa",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 10,
    status: "held",
    holders: [{ name: "Jim", href: "/players/by-name/Jim", meta: "First guardian", representedCountry: "USA" }],
    tone: "blue",
    country: "USA",
    eligibility: "Only players representing USA can hold or challenge this national belt.",
    rule: "Set Representing Country to USA, then win the verified national challenge.",
    challengeCopy: "Challenge for USA",
    detailLore: "The USA belt is a national beacon: one represented country, one current target.",
    historyPlaceholder: "USA title defenses will appear here after verified challenges.",
  },
  {
    id: "national-mexico",
    slug: "mexico",
    type: "national",
    displayName: "Mexico Champion",
    shortName: "Mexico",
    eyebrow: "Representing Country",
    assetUrl: "/champions/belts/mexico.webp",
    routeHref: "/champions/nations/mexico",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 10,
    status: "held",
    holders: [
      {
        name: "Julio Alvarez",
        href: "/players/by-name/Julio%20Alvarez",
        meta: "First scout",
        representedCountry: "Mexico",
      },
    ],
    tone: "green",
    country: "Mexico",
    eligibility: "Only players representing Mexico can hold or challenge this national belt.",
    rule: "Set Representing Country to Mexico, then win the verified national challenge.",
    challengeCopy: "Challenge for Mexico",
    detailLore: "Mexico's title belongs to the represented-country lane; country swaps will later respect cooldowns.",
    historyPlaceholder: "Mexico title defenses will appear here after verified challenges.",
  },
  {
    id: "national-uk",
    slug: "uk",
    type: "national",
    displayName: "UK Champion",
    shortName: "UK",
    eyebrow: "Representing Country",
    assetUrl: "/champions/belts/uk.webp",
    routeHref: "/champions/nations/uk",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 10,
    status: "held",
    holders: [{ name: "Sniper", href: "/players/by-name/Sniper", meta: "Beacon holder", representedCountry: "UK" }],
    tone: "gold",
    country: "UK",
    eligibility: "Only players representing UK can hold or challenge this national belt.",
    rule: "Set Representing Country to UK, then win the verified national challenge.",
    challengeCopy: "Challenge for UK",
    detailLore: "The UK title is a represented-country belt. It can sit beside the world crown, but it remains its own target.",
    historyPlaceholder: "UK title defenses will appear here after verified challenges.",
  },
];

export const eloTitles: ChampionTitleDefinition[] = [
  {
    id: "elo-rising",
    slug: "rising",
    type: "elo",
    displayName: "Rising Championship",
    shortName: "Rising",
    eyebrow: "Under 1200 ELO",
    assetUrl: "/champions/belts/elo-rising.webp",
    routeHref: "/champions/elo/rising",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "emerald",
    eloMax: 1199,
    eligibility: "Contenders come from under 1200 ELO first.",
    rule: "Win an eligible Rising title match. Lower divisions may invade upward, but this belt defends its own lane first.",
    challengeCopy: "Challenge Rising",
    detailLore: "The Rising belt makes the first rung matter. A new player can become a visible target quickly.",
    historyPlaceholder: "The Rising reign ledger is empty for now.",
  },
  {
    id: "elo-challenger",
    slug: "challenger",
    type: "elo",
    displayName: "Challenger Championship",
    shortName: "Challenger",
    eyebrow: "1200-1499 ELO",
    assetUrl: "/champions/belts/elo-challenger.webp",
    routeHref: "/champions/elo/challenger",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 2,
    status: "vacant",
    holders: [],
    tone: "silver",
    eloMin: 1200,
    eloMax: 1499,
    eligibility: "Contenders come from 1200-1499 ELO first.",
    rule: "Win an eligible Challenger title match. A lower-ELO invader can hold it if they beat the holder.",
    challengeCopy: "Challenge Challenger",
    detailLore: "The Challenger belt is the proving ground where the ladder starts hunting back.",
    historyPlaceholder: "The Challenger reign ledger is empty for now.",
  },
  {
    id: "elo-veteran",
    slug: "veteran",
    type: "elo",
    displayName: "Veteran Championship",
    shortName: "Veteran",
    eyebrow: "1500-1799 ELO",
    assetUrl: "/champions/belts/elo-veteran.webp",
    routeHref: "/champions/elo/veteran",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 3,
    status: "vacant",
    holders: [],
    tone: "blue",
    eloMin: 1500,
    eloMax: 1799,
    eligibility: "Contenders come from 1500-1799 ELO first.",
    rule: "Win an eligible Veteran title match or take it from the holder by verified result.",
    challengeCopy: "Challenge Veteran",
    detailLore: "The Veteran belt is for players with enough history to be dangerous every game.",
    historyPlaceholder: "The Veteran reign ledger is empty for now.",
  },
  {
    id: "elo-elite",
    slug: "elite",
    type: "elo",
    displayName: "Elite Championship",
    shortName: "Elite",
    eyebrow: "1800-2099 ELO",
    assetUrl: "/champions/belts/elo-elite.webp",
    routeHref: "/champions/elo/elite",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 4,
    status: "vacant",
    holders: [],
    tone: "gold",
    eloMin: 1800,
    eloMax: 2099,
    eligibility: "Contenders come from 1800-2099 ELO first.",
    rule: "Win an eligible Elite title match. Invader Champions can be hunted inside this division.",
    challengeCopy: "Challenge Elite",
    detailLore: "The Elite belt sits where mistakes are expensive and contenders are scarce.",
    historyPlaceholder: "The Elite reign ledger is empty for now.",
  },
  {
    id: "elo-legend",
    slug: "legend",
    type: "elo",
    displayName: "Legend Championship",
    shortName: "Legend",
    eyebrow: "2100+ ELO",
    assetUrl: "/champions/belts/elo-legend.webp",
    routeHref: "/champions/elo/legend",
    tributeKind: "REIGN_TRIBUTE",
    dailyWolo: 5,
    status: "vacant",
    holders: [],
    tone: "violet",
    eloMin: 2100,
    eligibility: "Contenders come from 2100+ ELO first.",
    rule: "Win an eligible Legend title match. Anyone who invades this belt becomes the biggest target on the board.",
    challengeCopy: "Challenge Legend",
    detailLore: "The Legend belt is the final mountain: few contenders, loud consequences.",
    historyPlaceholder: "The Legend reign ledger is empty for now.",
  },
];

export const designationTitles: ChampionTitleDefinition[] = [
  {
    id: "designation-giant-killer",
    slug: "giant-killer",
    type: "designation",
    displayName: "Giant Killer",
    shortName: "Giant Killer",
    eyebrow: "Giant-slayer Sword",
    assetUrl: "/champions/designations/giant-killer.webp",
    routeHref: "/champions/designations/giant-killer",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "gold",
    metricKey: "elo_upset_delta",
    currentRecord: "No verified record yet",
    eligibility: "Any verified winner can steal it with a bigger ELO upset.",
    rule: "Biggest ELO upset win. Take it by beating the current holder's ELO-upset record.",
    challengeCopy: "Take the sword",
    detailLore: "This is not a badge. It is a record weapon, held until someone cuts down a bigger favorite.",
    historyPlaceholder: "Giant Killer history starts when the first verified upset record is recorded.",
  },
  {
    id: "designation-comeback-king",
    slug: "comeback-king",
    type: "designation",
    displayName: "Comeback King",
    shortName: "Comeback King",
    eyebrow: "Phoenix Crown",
    assetUrl: "/champions/designations/comeback-king.webp",
    routeHref: "/champions/designations/comeback-king",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "red",
    metricKey: "losing_streak_snapped",
    currentRecord: "No verified streak yet",
    eligibility: "Any player can steal it by snapping a longer losing streak with a verified win.",
    rule: "Longest losing streak snapped by a win. Take it by winning after a longer losing streak than the current holder.",
    challengeCopy: "Take the crown",
    detailLore: "The phoenix crown belongs to the player who turns the ugliest skid into a public win.",
    historyPlaceholder: "Comeback King history starts with the first verified streak snap.",
  },
  {
    id: "designation-siege-lord",
    slug: "siege-lord",
    type: "designation",
    displayName: "Siege Lord",
    shortName: "Siege Lord",
    eyebrow: "Siege Hammer",
    assetUrl: "/champions/designations/siege-lord.webp",
    routeHref: "/champions/designations/siege-lord",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "gold",
    metricKey: "buildings_destroyed_win",
    currentRecord: "No verified record yet",
    eligibility: "Win a verified game with a higher buildings-destroyed count.",
    rule: "Most buildings destroyed in one win. Take it by destroying more buildings in a single verified win.",
    challengeCopy: "Take the hammer",
    detailLore: "The Siege Lord artifact goes to the player who leaves the map looking conquered.",
    historyPlaceholder: "Siege Lord history starts when building-destruction metrics are verified.",
  },
  {
    id: "designation-silent-killer",
    slug: "silent-killer",
    type: "designation",
    displayName: "Silent Killer",
    shortName: "Silent Killer",
    eyebrow: "Black Dagger Medallion",
    assetUrl: "/champions/designations/silent-killer.webp",
    routeHref: "/champions/designations/silent-killer",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "slate",
    metricKey: "zero_buildings_destroyed_best_win",
    currentRecord: "No verified record yet",
    eligibility: "Win with 0 enemy buildings destroyed; strongest opponent breaks ties.",
    rule: "Best win with 0 enemy buildings destroyed. Strongest opponent / highest ELO defeated breaks ties.",
    challengeCopy: "Take the dagger",
    detailLore: "The dagger is for clean, strange wins where the killing blow leaves buildings standing.",
    historyPlaceholder: "Silent Killer history starts when the parser can verify the clean win.",
  },
  {
    id: "designation-untouchable",
    slug: "untouchable",
    type: "designation",
    displayName: "Untouchable",
    shortName: "Untouchable",
    eyebrow: "Ghost Shield",
    assetUrl: "/champions/designations/untouchable.webp",
    routeHref: "/champions/designations/untouchable",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "silver",
    metricKey: "zero_units_lost_best_win",
    currentRecord: "No verified record yet",
    eligibility: "Win with 0 units lost; strongest opponent breaks ties.",
    rule: "Best win with 0 units lost. Strongest opponent / highest ELO defeated breaks ties.",
    challengeCopy: "Take the shield",
    detailLore: "The Ghost Shield belongs to the cleanest verified win on the board.",
    historyPlaceholder: "Untouchable history starts when zero-loss proof is available.",
  },
  {
    id: "designation-raid-demon",
    slug: "raid-demon",
    type: "designation",
    displayName: "Raid Demon",
    shortName: "Raid Demon",
    eyebrow: "Demon Mask",
    assetUrl: "/champions/designations/raid-demon.webp",
    routeHref: "/champions/designations/raid-demon",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "red",
    metricKey: "economy_units_killed_win",
    currentRecord: "No verified record yet",
    eligibility: "Win with a higher enemy economy-units-killed total.",
    rule: "Most enemy economy units killed in one win. Economy units include villagers, trade units, and fishing ships when detectable.",
    challengeCopy: "Take the mask",
    detailLore: "The mask goes to the player who breaks the enemy economy hardest in a verified win.",
    historyPlaceholder: "Raid Demon history starts when economy-kill metrics are verified.",
  },
  {
    id: "designation-boom-lord",
    slug: "boom-lord",
    type: "designation",
    displayName: "Boom Lord",
    shortName: "Boom Lord",
    eyebrow: "Golden Coffer",
    assetUrl: "/champions/designations/boom-lord.webp",
    routeHref: "/champions/designations/boom-lord",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "gold",
    metricKey: "resources_per_minute_win",
    currentRecord: "No verified record yet",
    eligibility: "Win with a higher resources-collected-per-minute record.",
    rule: "Highest resources collected per minute in a verified win.",
    challengeCopy: "Take the coffer",
    detailLore: "The coffer belongs to the strongest verified economy timing.",
    historyPlaceholder: "Boom Lord history starts when economy-rate proof is reliable.",
  },
  {
    id: "designation-slayer-king",
    slug: "slayer-king",
    type: "designation",
    displayName: "Slayer King",
    shortName: "Slayer King",
    eyebrow: "Reaper Blade",
    assetUrl: "/champions/designations/slayer-king.webp",
    routeHref: "/champions/designations/slayer-king",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "red",
    metricKey: "enemy_units_killed_win",
    currentRecord: "No verified record yet",
    eligibility: "Win with a higher enemy-units-killed total.",
    rule: "Most enemy units killed in one win.",
    challengeCopy: "Take the blade",
    detailLore: "The Reaper Blade goes to the biggest verified body count in a win.",
    historyPlaceholder: "Slayer King history starts when unit-kill proof is verified.",
  },
  {
    id: "designation-relic-baron",
    slug: "relic-baron",
    type: "designation",
    displayName: "Relic Baron",
    shortName: "Relic Baron",
    eyebrow: "Sacred Reliquary",
    assetUrl: "/champions/designations/relic-baron.webp",
    routeHref: "/champions/designations/relic-baron",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "gold",
    metricKey: "relic_gold_win",
    currentRecord: "No verified record yet",
    eligibility: "Win with a higher relic-gold record.",
    rule: "Most relic gold earned in one win.",
    challengeCopy: "Take the reliquary",
    detailLore: "The reliquary is for monks, map control, and the long hum of stolen gold.",
    historyPlaceholder: "Relic Baron history starts when relic-gold proof is available.",
  },
  {
    id: "designation-blitz-lord",
    slug: "blitz-lord",
    type: "designation",
    displayName: "Blitz Lord",
    shortName: "Blitz Lord",
    eyebrow: "Lightning Blade",
    assetUrl: "/champions/designations/blitz-lord.webp",
    routeHref: "/champions/designations/blitz-lord",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "blue",
    metricKey: "fastest_eligible_win",
    currentRecord: "No verified record yet",
    eligibility: "Win faster than the current eligible record.",
    rule: "Fastest eligible win.",
    challengeCopy: "Take the blade",
    detailLore: "The Lightning Blade belongs to the verified win that ends before the room has settled.",
    historyPlaceholder: "Blitz Lord history starts when the first eligible fast win is recorded.",
  },
  {
    id: "designation-wololo-lord",
    slug: "wololo-lord",
    type: "designation",
    displayName: "Wololo Lord",
    shortName: "Wololo Lord",
    eyebrow: "Monk Staff",
    assetUrl: "/champions/designations/wololo-lord.webp",
    routeHref: "/champions/designations/wololo-lord",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "emerald",
    metricKey: "conversions_win",
    currentRecord: "No verified record yet",
    eligibility: "Win with more conversions than the current record.",
    rule: "Most conversions in one win.",
    challengeCopy: "Take the staff",
    detailLore: "The staff belongs to the player who turns the enemy army into their own sermon.",
    historyPlaceholder: "Wololo Lord history starts when conversion counts are verified.",
  },
  {
    id: "designation-iron-wall",
    slug: "iron-wall",
    type: "designation",
    displayName: "Iron Wall",
    shortName: "Iron Wall",
    eyebrow: "Tower Shield",
    assetUrl: "/champions/designations/iron-wall.webp",
    routeHref: "/champions/designations/iron-wall",
    tributeKind: "ARTIFACT_BONUS",
    dailyWolo: 1,
    status: "vacant",
    holders: [],
    tone: "silver",
    metricKey: "damage_survived_win",
    currentRecord: "No verified record yet",
    eligibility: "Win after surviving a higher verified damage or building-loss record.",
    rule: "Most damage/building loss survived in a win.",
    challengeCopy: "Take the shield",
    detailLore: "The Tower Shield rewards the player who absorbs the worst hit and still wins.",
    historyPlaceholder: "Iron Wall history starts when survival metrics are verified.",
  },
];

export const championTitleSections: Record<TitleEconomySection, ChampionTitleDefinition[]> = {
  podium: podiumTitles,
  tagTeam: [tagTeamTitle],
  national: nationalTitles,
  elo: eloTitles,
  designation: designationTitles,
};

export const allChampionTitles: ChampionTitleDefinition[] = [
  ...podiumTitles,
  tagTeamTitle,
  ...nationalTitles,
  ...eloTitles,
  ...designationTitles,
];

export function findChampionTitleByHref(pathname: string) {
  return allChampionTitles.find((definition) => definition.routeHref === pathname) ?? null;
}

export function findChampionTitleBySegments(segments: string[]) {
  const pathname = `/champions/${segments.join("/")}`;
  return findChampionTitleByHref(pathname);
}

export function isRepresentedCountry(value: unknown): value is RepresentedCountry {
  return typeof value === "string" && REPRESENTED_COUNTRIES.includes(value as RepresentedCountry);
}

export function isGenderDivision(value: unknown): value is GenderDivision {
  return typeof value === "string" && GENDER_DIVISIONS.includes(value as GenderDivision);
}
