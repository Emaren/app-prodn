export const ROADMAP_LAST_UPDATED_AT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Edmonton",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
}).format(new Date());

export const ROADMAP_UPDATES = [
  {
    title: "Watcher install lane is cleaner",
    detail:
      "DMG stays the preferred path, Direct ZIP is still a real fallback, and profile-to-app one-click pairing now replaces manual key paste as the default Watcher setup path.",
  },
  {
    title: "Lobby now reads like a war room",
    detail:
      "The leaderboard and lobby cards are pushing harder toward rivalry, rank pressure, and live tournament energy instead of dead filler copy.",
  },
  {
    title: "Parser pages are getting sharper",
    detail:
      "Game detail pages are moving toward rivalry-first hierarchy so the score, winner pressure, and proof path show up before raw metadata.",
  },
] as const;

export const ROADMAP_UPDATE_COUNT = ROADMAP_UPDATES.length;

export const ABOUT_SIGNALS = [
  { label: "Mode", value: "Builder" },
  { label: "Truth", value: "Final replays" },
  { label: "Priority", value: "Steam RM first" },
  { label: "Rail", value: "WOLO ready" },
] as const;

export const ABOUT_SURFACES = [
  {
    href: "/lobby",
    title: "Lobby",
    note: "Board, bracket, crowd.",
  },
  {
    href: "/players",
    title: "Players",
    note: "Identity, ladder, proof.",
  },
  {
    href: "/rivalries",
    title: "Rivalries",
    note: "Heat, scorelines, rematches.",
  },
  {
    href: "/live-games",
    title: "Live Games",
    note: "The rail that lights first.",
  },
] as const;

export const ABOUT_PILLARS = [
  "AoE2HD only",
  "Replay-backed",
  "Rivalry-first",
  "Tournament pull",
] as const;

export const ROADMAP_MODULES = [
  {
    title: "Leaderboard + Lobby",
    score: 83,
    status: "Now",
    detail:
      "Centered nav, Steam RM first when available, Arena support, and a tighter lobby board with less dead copy.",
  },
  {
    title: "Rivalries",
    score: 71,
    status: "Now",
    detail: "Strong surface already. Next step is more heat, timelines, and tournament overlap.",
  },
  {
    title: "Player Graph",
    score: 68,
    status: "Next",
    detail: "Needs a true full-rankings destination and better player signature stats.",
  },
  {
    title: "Tournament Surface",
    score: 64,
    status: "Next",
    detail: "Good shell. Needs standings, results pulse, and stronger bracket gravity.",
  },
  {
    title: "Replay Trust",
    score: 61,
    status: "Next",
    detail: "Parser is real, but tests, fixtures, and edge-case handling still need tightening.",
  },
  {
    title: "Docs + Ops Truth",
    score: 49,
    status: "Later",
    detail: "Runtime truth still drifts from docs. We need one brutal architecture source of record.",
  },
  {
    title: "WOLO Rail",
    score: 44,
    status: "Later",
    detail: "Visible now, but it should stay secondary until competition and trust fully dominate.",
  },
] as const;
