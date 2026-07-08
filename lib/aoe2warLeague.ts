export type KingdomChronicle = {
  id: string;
  label: string;
  title: string;
  body: string;
  dateLabel: string;
  kind: "chronicle" | "bounty" | "transaction" | "locked";
  amountWolo?: number;
  actor?: string;
  txHash?: string | null;
  href?: string | null;
  status?: string;
};

export type ChampionBelt = {
  id: string;
  title: string;
  division: string;
  champion: string;
  subtitle: string;
  reignDays: number | null;
  monthlyRewardWolo: number;
  status: "held" | "vacant" | "coming_soon";
  accent: "gold" | "blue" | "green" | "violet" | "silver" | "red";
  country?: string;
  note?: string;
  featured?: boolean;
};

export type NationalBeacon = {
  id: string;
  country: string;
  champion: string | null;
  bountyWolo: number;
  tenureDays: number;
  tier: "world" | "lit" | "vacant";
  x: number;
  y: number;
};

export const kingdomStats = [
  { label: "Current Age", value: "Feudal Age" },
  { label: "Chronicles", value: "22" },
  { label: "Bounties", value: "40" },
  { label: "Kingdom Wealth", value: "100,000,000 WOLO" },
  { label: "Watchers Active", value: "2" },
  { label: "Citizens", value: "5" },
  { label: "Joined The Quest", value: "6" },
];

export const kingdomChronicles: KingdomChronicle[] = [
  {
    id: "lone-fire",
    label: "Chronicle I",
    title: "The Lone Fire",
    body: "One man kept HD alive and bound it to WOLO. Before tribe, clan, or crown, there was only Emaren and the fire.",
    dateLabel: "Mar 23, 2026",
    kind: "chronicle",
    actor: "Emaren",
    status: "Founding fire",
  },
  {
    id: "pigman-sees-fire",
    label: "Chronicle II",
    title: "A Shadow at the Fire",
    body: "Pigman found the smoke and looked in, but did not yet speak. The first watcher at the edge of camp.",
    dateLabel: "Mar 26, 2026",
    kind: "chronicle",
    actor: "[BDB]Pigman",
    status: "Seen, no contact",
  },
  {
    id: "first-scout-answers",
    label: "Chronicle III",
    title: "The First Scout Answers",
    body: "Julio came through the dark with hello there. The first real voice joined the fire.",
    dateLabel: "Mar 27, 2026",
    kind: "chronicle",
    actor: "Julio Alvarez",
    status: "First contact",
  },
  {
    id: "champion-appears",
    label: "Chronicle IV",
    title: "The Champion Appears",
    body: "Sniper arrived with yo. The field had a king before the Kingdom had walls.",
    dateLabel: "Apr 5, 2026",
    kind: "chronicle",
    actor: "Sniper",
    status: "Champion contact",
  },
  {
    id: "third-banner",
    label: "Chronicle V",
    title: "The Third Banner",
    body: "Pigman finally answered. The shadow at the fire became a banner in the camp.",
    dateLabel: "Apr 10 - Apr 11, 2026",
    kind: "chronicle",
    actor: "[BDB]Pigman",
    status: "Third contact",
  },
  {
    id: "guardian-checks-in",
    label: "Chronicle VI",
    title: "The Guardian Checks In",
    body: "Jim reached camp late and checked in by morning. The warband gained its guardian.",
    dateLabel: "Apr 24, 2026",
    kind: "chronicle",
    actor: "Jim",
    status: "Made contact",
  },
  {
    id: "silent-seat",
    label: "Chronicle VII",
    title: "The Silent Seat",
    body: "Dil_Pascana appeared before the eastern call, but never spoke. Presence is not contact.",
    dateLabel: "Before Apr 26, 2026",
    kind: "chronicle",
    actor: "Dil_Pascana",
    status: "No contact yet",
  },
  {
    id: "eastern-beacon",
    label: "Chronicle VIII",
    title: "The Eastern Beacon",
    body: "Ra crossed the line with hey Emaren. The fire was no longer local.",
    dateLabel: "Apr 26, 2026",
    kind: "chronicle",
    actor: "- Ra 𓁛𓇳",
    status: "Made contact",
  },
  {
    id: "champion-rises",
    label: "Chronicle IX",
    title: "The Champion Rises",
    body: "Sniper reached rank #1. The warband had its first crowned terror.",
    dateLabel: "May 23, 2026",
    kind: "chronicle",
    actor: "Sniper",
    status: "Leaderboard Rank #1",
  },
  {
    id: "first-coin",
    label: "Chronicle X",
    title: "The First Coin",
    body: "Jim, Sniper, and Julio received mainnet WOLO. The promise became ledger.",
    dateLabel: "May 25 - Jun 5, 2026",
    kind: "transaction",
    amountWolo: 3000,
    actor: "Jim / Sniper / Julio",
    status: "First mainnet rewards",
  },
  {
    id: "bounty-first-scout",
    label: "Bounty #1",
    title: "The First Scout",
    body: "First Mainnet Watcher. Every kingdom needs its first scout.",
    dateLabel: "Jun 6, 2026",
    kind: "bounty",
    amountWolo: 125000,
    actor: "Julio Alvarez",
    status: "Completed",
  },
  {
    id: "bounty-first-guardian",
    label: "Bounty #2",
    title: "The First Guardian",
    body: "First Mainnet Staker. Every kingdom needs its first guardian.",
    dateLabel: "Jun 7, 2026",
    kind: "bounty",
    amountWolo: 10000,
    actor: "Jim",
    status: "Completed",
  },
  {
    id: "signup-promise-kept",
    label: "Signup Bonus",
    title: "The Promise Kept",
    body: "The early promise was paid. Jim entered the ledger.",
    dateLabel: "Jun 7, 2026",
    kind: "transaction",
    amountWolo: 100000,
    actor: "Jim",
    status: "Completed",
  },
  {
    id: "watcher-package-pulls",
    label: "Chronicle XIV",
    title: "The Machine Finds Proof",
    body: "Julio's installer pull matched watcher-submitted game stats. Files began turning into truth.",
    dateLabel: "Jun 23, 2026",
    kind: "chronicle",
    actor: "Julio Alvarez",
    status: "Watcher proof",
  },
  {
    id: "old-files-awaken",
    label: "Chronicle XV",
    title: "The Old Wars Wake",
    body: "Jim proved old saves could be found and uploaded fast. The dead wars became data.",
    dateLabel: "Jun 25, 2026",
    kind: "chronicle",
    actor: "Jim",
    status: "Archive proof",
  },
  {
    id: "american-champion-shows-up",
    label: "Chronicle XVI",
    title: "The American Champion Shows Up",
    body: "Thirteen arrived. The USA Champion stepped out of the line and into the war.",
    dateLabel: "Jun 27, 2026",
    kind: "chronicle",
    actor: "Jim",
    status: "Champion proof",
  },
  {
    id: "no-pause-button",
    label: "Chronicle XVII",
    title: "No Pause Button",
    body: "The first royal dispatch was written. The Kingdom learned to remember itself.",
    dateLabel: "Jul 1, 2026",
    kind: "chronicle",
    actor: "War Room Scribe",
    status: "Royal dispatch",
  },
  {
    id: "first-canceled-war",
    label: "Chronicle XVIII",
    title: "The War Not Fought",
    body: "A challenge was canceled cleanly. Not every war is fought; every war is recorded.",
    dateLabel: "Jul 2, 2026",
    kind: "chronicle",
    actor: "Emaren vs Jim",
    status: "Game canceled",
  },
  {
    id: "clan-chooses-zodiac",
    label: "Chronicle XIX",
    title: "The Clan Chooses Zodiac",
    body: "Zodiac was named leader of the clan. The camp began forming offices.",
    dateLabel: "Jul 4, 2026",
    kind: "chronicle",
    actor: "Zodiac",
    status: "Clan office",
  },
  {
    id: "scribe-enters",
    label: "Chronicle XX",
    title: "The Scribe Enters",
    body: "The AI Scribe and Grimer entered the command room. Memory gained a voice.",
    dateLabel: "Jul 7, 2026",
    kind: "chronicle",
    actor: "The AI Scribe / Grimer",
    status: "Command room",
  },
  {
    id: "bounty-batch-uploader-live",
    label: "Bounty #39",
    title: "Batch Uploader is Live",
    body: "1M WOLO to Jim. Old war files now upload and parse at the click of a button. This is not a game. This is War.",
    dateLabel: "Jul 8, 2026",
    kind: "bounty",
    amountWolo: 1000000,
    actor: "Jim",
    status: "Completed",
  },
  {
    id: "bounty-old-war-stories",
    label: "Bounty #40",
    title: "Jim's Old War Stories",
    body: "1M WOLO to Jim for bringing the old wars back to the fire. 1,993 other ways to die.",
    dateLabel: "Jul 8, 2026",
    kind: "bounty",
    amountWolo: 1000000,
    actor: "Jim",
    status: "Completed",
  },
  {
    id: "champion-answers",
    label: "Chronicle XXIII",
    title: "The Champion Answers",
    body: "Sniper runs the watcher. The king takes the field.",
    dateLabel: "Locked",
    kind: "locked",
    actor: "Sniper",
  },
  {
    id: "second-watchtower",
    label: "Chronicle XXIV",
    title: "The Second Watchtower",
    body: "A second watcher rises. The Kingdom sees further.",
    dateLabel: "Locked",
    kind: "locked",
  },
  {
    id: "first-wager",
    label: "Chronicle XXV",
    title: "The First Wager",
    body: "The first true community wager is made.",
    dateLabel: "Locked",
    kind: "locked",
  },
  {
    id: "first-festival",
    label: "Chronicle XXVI",
    title: "The First Festival",
    body: "Wolomania gathers the realm.",
    dateLabel: "Locked",
    kind: "locked",
  },
  {
    id: "castle-age",
    label: "Age Gate",
    title: "Castle Age",
    body: "Stone walls. Royal houses. Crown law.",
    dateLabel: "Locked",
    kind: "locked",
  },
  {
    id: "imperial-age",
    label: "Age Gate",
    title: "Imperial Age",
    body: "The empire rises from proof.",
    dateLabel: "Locked",
    kind: "locked",
  },
];

export const championBelts: ChampionBelt[] = [
  {
    id: "world",
    title: "World Champion",
    division: "Open throne",
    champion: "Sniper",
    subtitle: "Rank #1 and current face of the league",
    reignDays: 27,
    monthlyRewardWolo: 100,
    status: "held",
    accent: "gold",
    country: "United Kingdom",
    featured: true,
    note: "Top guy",
  },
  {
    id: "chaos",
    title: "Chaos Champion",
    division: "Open mayhem",
    champion: "Vacant",
    subtitle: "First ladder storm still forming",
    reignDays: null,
    monthlyRewardWolo: 75,
    status: "vacant",
    accent: "blue",
  },
  {
    id: "uk",
    title: "UK National Champion",
    division: "United Kingdom",
    champion: "Sniper",
    subtitle: "Beacon holder",
    reignDays: 22,
    monthlyRewardWolo: 75,
    status: "held",
    accent: "green",
    country: "United Kingdom",
  },
  {
    id: "mexico",
    title: "Mexico National Champion",
    division: "Mexico",
    champion: "Julio Alvarez",
    subtitle: "First scout",
    reignDays: 14,
    monthlyRewardWolo: 75,
    status: "held",
    accent: "red",
    country: "Mexico",
  },
  {
    id: "usa",
    title: "USA National Champion",
    division: "United States",
    champion: "Jim",
    subtitle: "First guardian",
    reignDays: 12,
    monthlyRewardWolo: 75,
    status: "held",
    accent: "blue",
    country: "United States",
  },
  {
    id: "tag",
    title: "Tag Team Champions",
    division: "Teams",
    champion: "Coming Soon",
    subtitle: "First team ladder awaits",
    reignDays: null,
    monthlyRewardWolo: 60,
    status: "coming_soon",
    accent: "silver",
  },
  {
    id: "women",
    title: "Women's Champion",
    division: "Open title match",
    champion: "Awaiting First Match",
    subtitle: "The belt is forged",
    reignDays: null,
    monthlyRewardWolo: 60,
    status: "coming_soon",
    accent: "violet",
  },
];

export const eloBelts: ChampionBelt[] = [
  {
    id: "rising",
    title: "Rising",
    division: "Under 1200 ELO",
    champion: "Vacant",
    subtitle: "First rung",
    reignDays: null,
    monthlyRewardWolo: 20,
    status: "vacant",
    accent: "green",
  },
  {
    id: "challenger-elo",
    title: "Challenger",
    division: "1200-1499 ELO",
    champion: "Vacant",
    subtitle: "The climb begins",
    reignDays: null,
    monthlyRewardWolo: 25,
    status: "vacant",
    accent: "silver",
  },
  {
    id: "veteran",
    title: "Veteran",
    division: "1500-1799 ELO",
    champion: "Vacant",
    subtitle: "Seasoned hands",
    reignDays: null,
    monthlyRewardWolo: 30,
    status: "vacant",
    accent: "blue",
  },
  {
    id: "elite",
    title: "Elite",
    division: "1800-2099 ELO",
    champion: "Vacant",
    subtitle: "Oxygen left in the league",
    reignDays: null,
    monthlyRewardWolo: 40,
    status: "vacant",
    accent: "gold",
  },
  {
    id: "legend",
    title: "Legend",
    division: "2100+ ELO",
    champion: "Vacant",
    subtitle: "The final mountain",
    reignDays: null,
    monthlyRewardWolo: 50,
    status: "vacant",
    accent: "violet",
  },
];

export const specialDesignations = [
  {
    title: "Giant Killer",
    body: "Defeat a player 200+ ELO higher.",
    rewardWolo: 25,
  },
  {
    title: "Comeback King",
    body: "Win after losing 2+ games in a row.",
    rewardWolo: 20,
  },
  {
    title: "Siege Lord",
    body: "Destroy 50+ buildings in a single game.",
    rewardWolo: 15,
  },
  {
    title: "Silent Killer",
    body: "Win without losing a single unit.",
    rewardWolo: 15,
  },
  {
    title: "Raid Demon",
    body: "End the game with relentless economy damage.",
    rewardWolo: 15,
  },
  {
    title: "Boom Lord",
    body: "Hit a monster economy timing and hold it.",
    rewardWolo: 15,
  },
];

export const nationalBeacons: NationalBeacon[] = [
  {
    id: "canada",
    country: "Canada",
    champion: "Emaren",
    bountyWolo: 10,
    tenureDays: 1,
    tier: "lit",
    x: 22,
    y: 35,
  },
  { id: "us", country: "United States", champion: "Jim", bountyWolo: 10, tenureDays: 1, tier: "vacant", x: 24, y: 47 },
  { id: "mexico", country: "Mexico", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 22, y: 60 },
  { id: "uk", country: "United Kingdom", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 45, y: 36 },
  { id: "brazil", country: "Brazil", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 37, y: 74 },
  { id: "spain", country: "Spain", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 48, y: 48 },
  { id: "germany", country: "Germany", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 52, y: 38 },
  { id: "egypt", country: "Egypt", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 56, y: 57 },
  { id: "india", country: "India", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 69, y: 58 },
  { id: "china", country: "China", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 78, y: 45 },
  { id: "japan", country: "Japan", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 88, y: 48 },
  { id: "australia", country: "Australia", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 83, y: 78 },
  { id: "south-africa", country: "South Africa", champion: null, bountyWolo: 10, tenureDays: 0, tier: "vacant", x: 56, y: 82 },
];


export const forumChannels = [
  { label: "Champion Corner", count: 3 },
  { label: "Official Announcements", count: 12 },
  { label: "Bounty Board", count: 9 },
  { label: "Tournaments", count: 6 },
  { label: "Strategy & Build Orders", count: 24 },
  { label: "Maps & Civs", count: 18 },
  { label: "New Players", count: 17 },
  { label: "Watcher Help", count: 11 },
  { label: "Bug Reports", count: 7 },
  { label: "Suggestions", count: 10 },
  { label: "Introduce Yourself", count: 14 },
  { label: "Off-Topic Tavern", count: 20 },
];

export const featuredForumThreads = [
  {
    title: "April Champion Breakdown: Macro, Map Control & Mind Games",
    author: "Sniper",
    tag: "Champion Post",
    replies: 128,
    views: "2.4K",
    hot: true,
  },
  {
    title: "World Championship Open Challenge - Who Steps Up?",
    author: "AoE2WAR Official",
    tag: "Bounty Board",
    replies: 73,
    views: "1.8K",
  },
  {
    title: "New Belt: Chaos Champion - How It Works",
    author: "AoE2WAR Official",
    tag: "Announcement",
    replies: 89,
    views: "2.9K",
  },
  {
    title: "Which Civ is MOST FUN to watch right now?",
    author: "MangudaiMaster",
    tag: "Hot Discussion",
    replies: 96,
    views: "1.6K",
    hot: true,
  },
];

export const recentForumPosts = [
  "Why early aggression still works in 2026",
  "Casted Game: Sniper vs. DauT - Epic Arena Match",
  "How does matchmaking ELO actually work?",
  "2v2 Arabia is pure chaos and I love it",
  "DE vs HD - What's the better experience?",
  "My full castle drop build, step by step",
  "AoE2WAR Stats API - Now open for devs",
  "Share your craziest comeback wins",
];
