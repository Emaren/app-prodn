export const LOBBY_ROOM_SLUG = "main-lobby";
export const LOBBY_MESSAGE_MAX_CHARS = 280;
export const TOURNAMENT_STATUSES = ["planning", "open", "active", "completed"] as const;
export const TOURNAMENT_MATCH_STATUSES = ["scheduled", "ready", "live", "completed"] as const;
export const LOBBY_LEADERBOARD_MIN_MATCHES = 3;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export type TournamentMatchStatus = (typeof TOURNAMENT_MATCH_STATUSES)[number];

export type LobbyOnlineUser = {
  uid: string;
  in_game_name: string;
  verified: boolean;
  verificationLevel: number;
};

export type LobbyMatchPlayer = {
  name: string;
  winner?: boolean | null;
};

export type LobbyMatchRow = {
  id: number;
  winner: string | null;
  map: { name?: string } | string | null;
  players: LobbyMatchPlayer[] | string;
  created_at?: string | null;
  createdAt?: string | null;
  derived_played_on?: string | null;
  played_at?: string | null;
  played_on: string | null;
  timestamp: string | null;
  parse_reason?: string | null;
  original_filename?: string | null;
  replay_file?: string | null;
};

export type LobbyTournamentEntrant = {
  entryId: number | null;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verificationLevel: number;
  verified: boolean;
  joinedAt: string;
};

export type LobbyReplayPlayer = {
  name: string;
  winner: boolean | null;
};

export type LobbyTournamentMatchProof = {
  gameStatsId: number;
  replayHash: string;
  winner: string | null;
  playedOn: string | null;
  mapName: string | null;
  originalFilename: string | null;
  players: LobbyReplayPlayer[];
};

export type AdminReplayCandidate = LobbyTournamentMatchProof & {
  matchedEntryIds: number[];
  matchedEntrantNames: string[];
};

export type LobbyTournament = {
  id: number | null;
  slug: string;
  title: string;
  description: string;
  format: string;
  status: TournamentStatus;
  startsAt: string | null;
  featured: boolean;
  entryCount: number;
  entrants: LobbyTournamentEntrant[];
  viewerJoined: boolean;
  roomSlug: string;
  isFallback: boolean;
  matches: LobbyTournamentMatch[];
};

export type LobbyTournamentMatch = {
  id: number;
  round: number;
  position: number;
  label: string | null;
  status: TournamentMatchStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  winnerEntryId: number | null;
  sourceGameStatsId: number | null;
  proof: LobbyTournamentMatchProof | null;
  playerOne: LobbyTournamentEntrant | null;
  playerTwo: LobbyTournamentEntrant | null;
};

export type LobbyReactionUser = {
  uid: string;
  displayName: string;
};

export type LobbyMessageReaction = {
  emoji: string;
  count: number;
  viewerReacted: boolean;
  anonymousCount: number;
  users: LobbyReactionUser[];
};

export type LobbyMessage = {
  id: number;
  roomSlug: string;
  body: string;
  createdAt: string;
  reactions: LobbyMessageReaction[];
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
    verificationLevel: number;
    verified: boolean;
    isAi: boolean;
  };
};

export type LobbyLeaderboardEntry = {
  rank: number;
  key: string;
  name: string;
  href: string;
  elo: number | null;
  arenaElo: number | null;
  steamRmRating: number | null;
  steamDmRating: number | null;
  primaryRating: number | null;
  primaryRatingLabel: string;
  primaryRatingSourceLabel: string;
  secondaryRatingLabel: string | null;
  ratingLabel: string;
  wins: number;
  losses: number;
  unknowns: number;
  streakLabel: string | null;
  verified: boolean;
  verificationLevel: number;
  isOnline: boolean;
  claimed: boolean;
  pendingWoloClaimCount: number;
  pendingWoloClaimAmount: number;
  totalMatches: number;
  lastPlayedAt: string | null;
  provisional: boolean;
};

export type LobbyLeaderboardSummary = {
  title: string;
  statusLabel: string;
  entries: LobbyLeaderboardEntry[];
  activePlayers: number;
  matchesToday: number;
  trackedPlayers: number;
  rankedPlayers: number;
  minimumMatches: number;
};

export type LobbyWoloAccount = {
  address: string;
  uwolo: number;
  wolo: number;
};

export type LobbyWoloSnapshot = {
  enabled: boolean;
  chainId: string;
  denom: {
    base: string;
    display: string;
    decimals: number;
  };
  source: string;
  updatedAt: string | null;
  accounts: Record<string, LobbyWoloAccount>;
};

export type LobbyWoloEarnersEntry = {
  rank: number;
  key: string;
  name: string;
  href: string;
  claimed: boolean;
  verified: boolean;
  verificationLevel: number;
  weeklyTakeWolo: number;
  settledWolo: number;
  wageredWolo: number;
  claimCount: number;
  wagerCount: number;
  claimableWolo: number;
  lastActiveAt: string | null;
  sourceWindow: "weekly" | "backfill";
};

export type LobbyWoloEarnersBoard = {
  timeframeDays: number;
  visibleSlots: number;
  totalParticipants: number;
  backfilled: boolean;
  weekStartsAt: string;
  generatedAt: string;
  entries: LobbyWoloEarnersEntry[];
};

export type LobbySnapshot = {
  tournament: LobbyTournament;
  onlineUsers: LobbyOnlineUser[];
  recentMatches: LobbyMatchRow[];
  messages: LobbyMessage[];
  leaderboard: LobbyLeaderboardSummary;
  wolo: LobbyWoloSnapshot | null;
  woloEarners: LobbyWoloEarnersBoard;
};

export function slugifyTournamentTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function normalizeTournamentStatus(value: unknown): TournamentStatus {
  if (typeof value === "string" && TOURNAMENT_STATUSES.includes(value as TournamentStatus)) {
    return value as TournamentStatus;
  }
  return "planning";
}

export function normalizeChatBody(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, LOBBY_MESSAGE_MAX_CHARS);
}

export function getFallbackTournament(viewerJoined = false): LobbyTournament {
  return {
    id: null,
    slug: "next-community-tournament",
    title: "Next Community Tournament",
    description:
      "Create the first featured tournament from the admin page, then this card becomes the live join point for the whole site.",
    format: "1v1 AoE2HD showcase",
    status: "planning",
    startsAt: null,
    featured: false,
    entryCount: 0,
    entrants: [],
    viewerJoined,
    roomSlug: LOBBY_ROOM_SLUG,
    isFallback: true,
    matches: [],
  };
}

export function getFallbackLeaderboard(): LobbyLeaderboardSummary {
  return {
    title: "Season Leaderboard",
    statusLabel: "Arena Elo",
    entries: [],
    activePlayers: 0,
    matchesToday: 0,
    trackedPlayers: 0,
    rankedPlayers: 0,
    minimumMatches: LOBBY_LEADERBOARD_MIN_MATCHES,
  };
}

export function getFallbackWoloEarnersBoard(): LobbyWoloEarnersBoard {
  const generatedAt = new Date().toISOString();
  return {
    timeframeDays: 7,
    visibleSlots: 3,
    totalParticipants: 0,
    backfilled: false,
    weekStartsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    generatedAt,
    entries: [],
  };
}

export function getTournamentStatusLabel(status: TournamentStatus) {
  switch (status) {
    case "planning":
      return "Planning";
    case "open":
      return "Open";
    case "active":
      return "Live";
    case "completed":
      return "Completed";
    default:
      return "Planning";
  }
}

export function normalizeTournamentMatchStatus(value: unknown): TournamentMatchStatus {
  if (
    typeof value === "string" &&
    TOURNAMENT_MATCH_STATUSES.includes(value as TournamentMatchStatus)
  ) {
    return value as TournamentMatchStatus;
  }
  return "scheduled";
}

export function getTournamentMatchStatusLabel(status: TournamentMatchStatus) {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "ready":
      return "Ready";
    case "live":
      return "Live";
    case "completed":
      return "Completed";
    default:
      return "Scheduled";
  }
}
