export const KINGDOM_KNOWLEDGE_REPOSITORY_IDS = [
  "site_map",
  "site_pages",
  "lobby_chat",
  "traffic",
  "players",
  "leaderboard",
  "recent_battles",
  "battle_history",
  "rivalries",
  "live_games",
  "tournaments",
  "challenges",
  "honors",
  "clans",
  "forum",
  "betting",
  "wolochain",
  "staking",
  "forge",
  "oracle",
  "bounties",
  "governance",
  "requests",
  "marketplace",
  "radio",
] as const;

export type KingdomKnowledgeRepositoryId =
  (typeof KINGDOM_KNOWLEDGE_REPOSITORY_IDS)[number];

export type KingdomKnowledgeRepositoryDefinition = {
  id: KingdomKnowledgeRepositoryId;
  label: string;
  description: string;
  keywords: readonly string[];
  phrases?: readonly string[];
  pagePaths: readonly string[];
  guidance: string;
  priority: number;
};

export const PUBLIC_KINGDOM_PAGES = [
  { path: "/", label: "Home / Lobby", repository: "site_map" },
  { path: "/about", label: "About AoE2WAR", repository: "site_pages" },
  { path: "/academy", label: "Academy", repository: "site_pages" },
  { path: "/ai", label: "AI Council", repository: "site_pages" },
  { path: "/battle-archive", label: "Battle Archive", repository: "battle_history" },
  { path: "/belts", label: "Belts", repository: "honors" },
  { path: "/bets", label: "Betting", repository: "betting" },
  { path: "/betting-mechanics", label: "Betting Mechanics", repository: "betting" },
  { path: "/bounties", label: "Bounties", repository: "bounties" },
  { path: "/challenge", label: "Challenges", repository: "challenges" },
  { path: "/champions", label: "Champions", repository: "honors" },
  { path: "/clans", label: "Clan Halls", repository: "clans" },
  { path: "/forum", label: "Forum / War Room", repository: "forum" },
  { path: "/game-stats", label: "Game Stats", repository: "recent_battles" },
  { path: "/kingdom", label: "Kingdom", repository: "site_pages" },
  { path: "/kingdom-forge", label: "Kingdom Forge", repository: "forge" },
  { path: "/lobby", label: "Lobby", repository: "lobby_chat" },
  { path: "/leaderboard", label: "Leaderboard", repository: "leaderboard" },
  { path: "/traffic", label: "Traffic Observatory", repository: "traffic" },
  { path: "/live-games", label: "Live Games", repository: "live_games" },
  { path: "/market", label: "Marketplace", repository: "marketplace" },
  { path: "/download", label: "Watcher Download", repository: "site_pages" },
  { path: "/matchups", label: "Matchups", repository: "rivalries" },
  { path: "/national-champions", label: "National Champions", repository: "honors" },
  { path: "/nations", label: "Nations", repository: "honors" },
  { path: "/oracle", label: "Oracle", repository: "oracle" },
  { path: "/players", label: "Players", repository: "players" },
  { path: "/radio", label: "Radio", repository: "radio" },
  { path: "/replay-parser", label: "Replay Parser", repository: "site_pages" },
  { path: "/realm", label: "Realm", repository: "site_pages" },
  { path: "/requests", label: "Community Requests", repository: "requests" },
  { path: "/submit", label: "Submit", repository: "site_pages" },
  { path: "/upload", label: "Upload Replay", repository: "site_pages" },
  { path: "/users", label: "Users", repository: "players" },
  { path: "/rivalries", label: "Rivalries", repository: "rivalries" },
  { path: "/roadmap", label: "Roadmap", repository: "requests" },
  { path: "/round-chamber", label: "Round Chamber", repository: "governance" },
  { path: "/staking", label: "WOLO Staking", repository: "staking" },
  { path: "/statistics", label: "Statistics", repository: "battle_history" },
  { path: "/tournaments/founders-cup", label: "Founders Cup", repository: "tournaments" },
  { path: "/war-chest", label: "War Chest", repository: "betting" },
  { path: "/war-engine", label: "War Engine", repository: "site_pages" },
  { path: "/watch", label: "Watch", repository: "live_games" },
  { path: "/wolo", label: "WOLO", repository: "wolochain" },
  { path: "/wolo-1", label: "Wolo-1", repository: "wolochain" },
  { path: "/wolochain", label: "WoloChain", repository: "wolochain" },
  { path: "/workshop", label: "Workshop", repository: "site_pages" },
  { path: "/zodiac", label: "Zodiac", repository: "site_pages" },
  { path: "/wolomania", label: "Wolomania", repository: "tournaments" },
] as const;

export const KINGDOM_KNOWLEDGE_REPOSITORIES:
  readonly KingdomKnowledgeRepositoryDefinition[] = [
  {
    id: "site_map",
    label: "Kingdom map",
    description:
      "Public AoE2WAR surfaces, where systems live, and what each repository can answer.",
    keywords: ["site", "page", "where", "navigate", "aoe2war", "kingdom"],
    phrases: ["what can you do", "what can you help", "where do i", "where can i"],
    pagePaths: ["/", "/about", "/kingdom"],
    guidance:
      "Use this repository for site navigation and capability questions. Do not pretend a listed page proves live state.",
    priority: 5,
  },
  {
    id: "site_pages",
    label: "Public page content",
    description:
      "Current server-rendered text from relevant public AoE2WAR pages.",
    keywords: ["page", "about", "academy", "realm", "roadmap", "parser", "replay parser", "watcher", "download", "upload", "war engine", "ai council"],
    phrases: ["what does the page say", "on the site", "on aoe2war"],
    pagePaths: ["/about", "/academy", "/ai", "/download", "/kingdom", "/realm", "/replay-parser", "/roadmap", "/submit", "/upload", "/war-engine", "/workshop", "/zodiac"],
    guidance:
      "Page text is current public presentation. Prefer canonical domain repositories for exact numbers when both are available.",
    priority: 4,
  },
  {
    id: "lobby_chat",
    label: "Public lobby conversation",
    description:
      "Newest public Lobby conversation and room presence context.",
    keywords: ["lobby", "chat", "room", "conversation", "talking", "said", "saying"],
    phrases: ["what are people saying", "what happened in chat", "in the lobby"],
    pagePaths: ["/", "/lobby"],
    guidance:
      "Lobby messages are public conversation evidence, not authoritative system facts unless corroborated by a canonical repository.",
    priority: 8,
  },
  {
    id: "traffic",
    label: "Traffic Observatory",
    description:
      "Completed UTC-day public Traffic Observatory sessions, human-confidence classifications, and recent growth.",
    keywords: [
      "traffic", "visitor", "visitors", "visit", "visits", "session", "sessions",
      "audience", "confirmed human", "confirmed humans", "potential human",
      "potential humans", "suspected human", "suspected humans",
    ],
    phrases: [
      "how many visitors", "how many people visited", "traffic today",
      "traffic yesterday", "visitors today", "visitors yesterday",
      "confirmed humans", "potential humans",
    ],
    pagePaths: ["/traffic"],
    guidance:
      "Traffic Observatory points are completed UTC days. Preserve the upstream semantics exactly. Never call a session count unique people, unique visitors, or unique IP addresses unless the supplied Traffic Observatory semantics explicitly establish that identity grain.",
    priority: 10,
  },
  {
    id: "players",
    label: "Players and identities",
    description:
      "Public player identities, aliases, ratings, activity, replay record, verification, honors, and online state.",
    keywords: [
      "player", "players", "profile", "rating", "elo", "identity", "alias",
      "online", "form", "record", "rm", "dm",
    ],
    phrases: ["tell me about", "how is", "how has", "who is"],
    pagePaths: ["/players", "/leaderboard"],
    guidance:
      "Use canonical public identity names and aliases. Do not count system AI identities as humans.",
    priority: 9,
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    description:
      "Current ranked player standings, ratings, wins, losses, and tracked-player counts.",
    keywords: ["leaderboard", "rank", "ranking", "top", "standings", "rating", "elo"],
    phrases: ["who is first", "who is number one", "top player"],
    pagePaths: ["/leaderboard"],
    guidance:
      "Use current ranked rows for rank claims. A player not shown in a bounded sample is not proof they are absent.",
    priority: 10,
  },
  {
    id: "recent_battles",
    label: "Recent battles",
    description:
      "Newest public parsed battles and effective result presentation.",
    keywords: ["recent", "latest", "game", "games", "match", "matches", "battle", "result", "map", "civ"],
    phrases: ["last game", "recent games", "latest match"],
    pagePaths: ["/game-stats", "/battle-archive"],
    guidance:
      "Use effective public result truth. Never infer a winner from parser candidate coverage alone.",
    priority: 9,
  },
  {
    id: "battle_history",
    label: "Historical battle record",
    description:
      "Historical public battle corpus for wins, losses, maps, teams, and long-range player records.",
    keywords: ["history", "historical", "career", "ever", "all-time", "all time", "wins", "losses", "record"],
    phrases: ["how many times", "over time", "career record"],
    pagePaths: ["/battle-archive", "/statistics", "/game-stats"],
    guidance:
      "Historical counts must come from effective public final rows. Unknown/unresolved results stay unknown.",
    priority: 8,
  },
  {
    id: "rivalries",
    label: "Rivalries and team matchups",
    description:
      "Head-to-head rivalry boards, team rivalry series, allies/opponents, and team compositions.",
    keywords: ["rivalry", "rivalries", "matchup", "versus", "vs", "opponent", "ally", "team", "composition"],
    phrases: ["head to head", "played against", "played with", "same team"],
    pagePaths: ["/rivalries", "/matchups"],
    guidance:
      "Separate 1v1 duels from team-opponent and team-ally relationships. Preserve unresolved outcomes.",
    priority: 10,
  },
  {
    id: "live_games",
    label: "Live games and watch state",
    description:
      "Current live sessions, recently completed watcher sessions, streams, maps, players, and live result state.",
    keywords: ["live", "watch", "watching", "stream", "streaming", "playing now", "online game"],
    phrases: ["who is playing", "what is live", "live right now"],
    pagePaths: ["/live-games", "/watch"],
    guidance:
      "Live state is transient. Use the newest snapshot and distinguish live from recently completed.",
    priority: 10,
  },
  {
    id: "tournaments",
    label: "Tournaments and events",
    description:
      "Tournament status, entrants, brackets/matches, schedules, winners, and Wolomania.",
    keywords: ["tournament", "tournaments", "bracket", "wolomania", "round", "event"],
    phrases: ["who won the tournament", "next tournament"],
    pagePaths: ["/tournaments/founders-cup", "/wolomania"],
    guidance:
      "Use recorded tournament status and linked match proof. Do not invent bracket outcomes.",
    priority: 9,
  },
  {
    id: "challenges",
    label: "Challenges",
    description:
      "Challenge lifecycle, scheduling, acceptance, funding, check-in, result, title stakes, and history.",
    keywords: ["challenge", "challenged", "rematch", "no-show", "noshow", "scheduled", "funded", "accepted"],
    phrases: ["challenge record", "who challenged", "next challenge"],
    pagePaths: ["/challenge"],
    guidance:
      "Challenge status and money state are distinct. Do not describe planned funding as executed WOLO.",
    priority: 9,
  },
  {
    id: "honors",
    label: "Champions, belts, trophies and artifacts",
    description:
      "Current championship/title holders, national champions, belts, trophies, artifacts, bounties, and custody history.",
    keywords: ["belt", "belts", "champion", "champions", "title", "trophy", "artifact", "honor", "honours", "national"],
    phrases: ["who holds", "current champion", "mexican champion", "american champion"],
    pagePaths: ["/belts", "/champions", "/national-champions", "/nations"],
    guidance:
      "Use current holder fields for custody claims. Historical events are evidence of prior custody, not current ownership.",
    priority: 10,
  },
  {
    id: "clans",
    label: "Clans",
    description:
      "Clan directory, member counts, crests, public descriptions, and Hall availability.",
    keywords: ["clan", "clans", "hall", "roster", "member", "members", "crest"],
    phrases: ["which clan", "clan member", "clan roster"],
    pagePaths: ["/clans"],
    guidance:
      "Global Clan knowledge is public directory truth. A Hall Scribe receives its own audience-filtered Hall history separately.",
    priority: 9,
  },
  {
    id: "forum",
    label: "Forum / War Room",
    description:
      "Current public forum channels, threads, posts, reactions, and community discussion.",
    keywords: ["forum", "thread", "post", "discussion", "war room"],
    phrases: ["what are people saying", "forum post"],
    pagePaths: ["/forum"],
    guidance:
      "Forum posts are user-authored conversation, not authoritative system facts unless corroborated by a canonical repository.",
    priority: 7,
  },
  {
    id: "betting",
    label: "Betting and War Chest",
    description:
      "Open/settled markets, public market state, pots, sides, result settlement presentation, and War Chest activity.",
    keywords: ["bet", "bets", "betting", "wager", "odds", "market", "markets", "pot", "war chest", "settled", "payout"],
    phrases: ["who bet", "open market", "betting mechanics"],
    pagePaths: ["/bets", "/betting-mechanics", "/war-chest", "/pending-bets", "/past-earnings"],
    guidance:
      "Market state is not chain settlement proof. A payout transaction hash is final payment evidence; pending without a tx is unpaid.",
    priority: 9,
  },
  {
    id: "wolochain",
    label: "WOLO and WoloChain",
    description:
      "Current WoloChain identity, fixed-supply constants, recent indexed transfers, holders, movement, network state, and wallet-facing public facts.",
    keywords: ["wolo", "wolochain", "chain", "wallet", "transfer", "holders", "supply", "mainnet", "faucet", "inflation"],
    phrases: ["how much wolo", "wolo supply", "chain status"],
    pagePaths: ["/wolo", "/wolochain"],
    guidance:
      "Use indexed/mainnet-visible chain truth for transfer claims. Never invent supply, wallet, or payment facts.",
    priority: 10,
  },
  {
    id: "staking",
    label: "WOLO staking",
    description:
      "Current app-side WOLO staking totals, positions leaderboard, reward activity, fee pools, and public staking rules.",
    keywords: ["stake", "staking", "staker", "unstake", "compound", "yield", "apy", "reward", "treasury"],
    phrases: ["how much is staked", "staking rewards"],
    pagePaths: ["/staking"],
    guidance:
      "This is AoE2WAR app-side WOLO staking, not validator staking. stakingWeight is accounting, not extra balance. Do not invent APY.",
    priority: 10,
  },
  {
    id: "forge",
    label: "Kingdom Forge",
    description:
      "Forge projects, milestones, authorization, commitments, deeds, funding progress, and Kingdom-building state.",
    keywords: ["forge", "deed", "deeds", "architect", "financier", "build fuel", "forge power", "project", "milestone"],
    phrases: ["kingdom forge", "feature deed"],
    pagePaths: ["/kingdom-forge"],
    guidance:
      "Distinguish signalled commitments from funded commitments and shipped/proven milestones.",
    priority: 8,
  },
  {
    id: "oracle",
    label: "Oracle",
    description:
      "Current Oracle markets, probabilities, marks, live metrics, proposals, and resolution state.",
    keywords: ["oracle", "prediction", "forecast", "probability", "marks", "forecaster"],
    phrases: ["oracle market", "prediction market"],
    pagePaths: ["/oracle"],
    guidance:
      "Oracle marks are app-side forecasting state. Do not present unresolved markets as facts.",
    priority: 8,
  },
  {
    id: "bounties",
    label: "Bounties",
    description:
      "Current public bounty opportunities, numbered bounty ledger, rewards, status, and assignment state.",
    keywords: ["bounty", "bounties", "contract", "reward", "quest"],
    phrases: ["open bounty", "bounty board"],
    pagePaths: ["/bounties"],
    guidance:
      "Differentiate available/in-progress contracts from paid canonical bounty ledger entries.",
    priority: 8,
  },
  {
    id: "governance",
    label: "Round Chamber",
    description:
      "Current public governance proposals, votes, comments, decision state, and civic participation.",
    keywords: ["governance", "proposal", "vote", "voting", "chamber", "round chamber", "civic"],
    phrases: ["community vote", "kingdom proposal"],
    pagePaths: ["/round-chamber"],
    guidance:
      "Open proposals are proposals, not adopted policy. Preserve vote and decision state.",
    priority: 7,
  },
  {
    id: "requests",
    label: "Requests and roadmap",
    description:
      "Community feature requests, votes, comments, open/completed state, and roadmap-facing demand.",
    keywords: ["request", "requests", "feature request", "roadmap", "idea", "suggestion"],
    phrases: ["requested feature", "what are people asking for"],
    pagePaths: ["/requests", "/roadmap"],
    guidance:
      "Community requests express demand, not shipped product state unless marked completed and corroborated.",
    priority: 7,
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description:
      "Current live public Marketplace businesses plus marketplace configuration for avatar commissions, archetypes, belt placement, and shop proposals.",
    keywords: ["marketplace", "business", "businesses", "shop", "shops", "storefront", "avatar", "commission", "visage", "visage forge"],
    phrases: ["buy an avatar", "avatar price", "how many businesses", "which businesses are open"],
    pagePaths: ["/market"],
    guidance:
      "Use live public Marketplace shop rows for business counts, names, locations, and storefront state. Use marketplace constants for pricing/configuration. Never expose pending proposals, owner-only controls, or private business administration through this public repository.",
    priority: 6,
  },
  {
    id: "radio",
    label: "Radio",
    description:
      "Published/featured AoE2WAR Radio tracks and public artist/track metadata.",
    keywords: ["radio", "music", "song", "track", "artist"],
    phrases: ["what is playing", "radio track"],
    pagePaths: ["/radio"],
    guidance:
      "Only published/featured public track metadata is knowledge. Never expose submitter contact details or admin notes.",
    priority: 5,
  },
] as const;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "what", "who", "where", "when", "why", "how",
  "are", "was", "were", "has", "have", "had", "does", "did", "can", "could",
  "would", "should", "this", "that", "from", "about", "into", "your", "you",
  "our", "their", "there", "here", "currently", "current", "latest", "recent",
]);

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function kingdomKnowledgeQueryTerms(message: string) {
  return Array.from(
    new Set(
      normalized(message)
        .split(/[^a-z0-9_$.-]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !STOPWORDS.has(term)),
    ),
  ).slice(0, 24);
}

function containsWholeTerm(query: string, term: string) {
  const escaped = term
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  if (!escaped) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(query);
}

function repoScore(
  repository: KingdomKnowledgeRepositoryDefinition,
  query: string,
) {
  let score = 0;

  for (const keyword of repository.keywords) {
    if (!containsWholeTerm(query, keyword)) continue;
    score += keyword.includes(" ") ? 7 : 3;
  }

  for (const phrase of repository.phrases ?? []) {
    if (query.includes(phrase)) score += 10;
  }

  for (const page of repository.pagePaths) {
    const token = page.replace(/^\/+/, "").replace(/[-/]+/g, " ");
    if (token && containsWholeTerm(query, token)) score += 8;
  }

  for (const page of PUBLIC_KINGDOM_PAGES) {
    if (page.repository !== repository.id) continue;

    const label = page.label.toLowerCase().trim();
    if (label && containsWholeTerm(query, label)) {
      score += 12;
    }
  }

  return score + (score > 0 ? repository.priority : 0);
}

function looksLikeNamedPlayerQuestion(query: string) {
  return (
    /\b(tell me about|how (?:is|has|did)|what about)\s+[a-z0-9_[\]-]{2,}/i.test(query) ||
    /\b[a-z0-9_[\]-]{2,}\s+(?:vs|versus|beat|beats|beaten|won|lost|played)\s+[a-z0-9_[\]-]{2,}/i.test(query)
  );
}

export function routeKingdomKnowledgeRepositories(
  message: string,
  options: { maxRepositories?: number } = {},
): KingdomKnowledgeRepositoryId[] {
  const query = normalized(message);
  const maxRepositories = Math.max(
    1,
    Math.min(8, options.maxRepositories ?? 6),
  );

  const scored = KINGDOM_KNOWLEDGE_REPOSITORIES
    .map((repository) => ({
      id: repository.id,
      score: repoScore(repository, query),
      priority: repository.priority,
    }))
    .filter((entry) => entry.score > 0);

  if (looksLikeNamedPlayerQuestion(query)) {
    for (const id of ["players", "recent_battles", "battle_history", "rivalries"] as const) {
      const existing = scored.find((entry) => entry.id === id);
      if (existing) existing.score += 12;
      else {
        const definition = KINGDOM_KNOWLEDGE_REPOSITORIES.find(
          (repository) => repository.id === id,
        );
        scored.push({
          id,
          score: 12 + (definition?.priority ?? 0),
          priority: definition?.priority ?? 0,
        });
      }
    }
  }

  if (
    /\b(?:stake|staked|staking|staker|stakers|unstake|unstaked|unstaking|compound|compounding)\b/i.test(
      query,
    )
  ) {
    const id = "staking" as const;
    const existing = scored.find((entry) => entry.id === id);
    const definition = KINGDOM_KNOWLEDGE_REPOSITORIES.find(
      (repository) => repository.id === id,
    );

    if (existing) {
      existing.score += 20;
    } else {
      scored.push({
        id,
        score: 20 + (definition?.priority ?? 0),
        priority: definition?.priority ?? 0,
      });
    }
  }

  if (/\bvs\b|\bversus\b|\bhead[- ]to[- ]head\b/i.test(query)) {
    for (const id of ["rivalries", "battle_history", "players"] as const) {
      const existing = scored.find((entry) => entry.id === id);
      if (existing) existing.score += 15;
    }
  }

  if (/\b(all|everything|whole site|entire site|kingdom systems)\b/i.test(query)) {
    for (const id of [
      "site_map",
      "lobby_chat",
      "players",
      "recent_battles",
      "honors",
      "betting",
      "wolochain",
      "clans",
      "tournaments",
    ] as const) {
      const existing = scored.find((entry) => entry.id === id);
      if (existing) existing.score += 8;
      else {
        const definition = KINGDOM_KNOWLEDGE_REPOSITORIES.find(
          (repository) => repository.id === id,
        );
        scored.push({
          id,
          score: 8 + (definition?.priority ?? 0),
          priority: definition?.priority ?? 0,
        });
      }
    }
  }

  if (/\b(stake|staking|staker|unstake|compound)\b/i.test(query) && !/\bbount(?:y|ies)\b/i.test(query)) {
    const index = scored.findIndex((entry) => entry.id === "bounties");
    if (index >= 0) scored.splice(index, 1);
  }

  if (/\b(bet|bets|betting|wager|odds|war chest)\b/i.test(query) && !/\b(marketplace|avatar|commission|shop|visage)\b/i.test(query)) {
    const index = scored.findIndex((entry) => entry.id === "marketplace");
    if (index >= 0) scored.splice(index, 1);
  }

  return scored
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.priority - left.priority;
    })
    .slice(0, maxRepositories)
    .map((entry) => entry.id);
}

export function kingdomKnowledgeRepositoryDefinition(
  id: KingdomKnowledgeRepositoryId,
) {
  return (
    KINGDOM_KNOWLEDGE_REPOSITORIES.find(
      (repository) => repository.id === id,
    ) ?? null
  );
}

export function kingdomKnowledgeCatalogSummary() {
  return KINGDOM_KNOWLEDGE_REPOSITORIES.map(
    (repository) => `${repository.id}: ${repository.description}`,
  ).join("\n");
}
