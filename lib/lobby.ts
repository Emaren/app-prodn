export const LOBBY_ROOM_SLUG = "main-lobby";
export const TOURNAMENT_STATUSES = ["planning", "open", "active", "completed"] as const;
export const TOURNAMENT_MATCH_STATUSES = ["scheduled", "ready", "live", "completed"] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export type TournamentMatchStatus = (typeof TOURNAMENT_MATCH_STATUSES)[number];

export type LobbyOnlineUser = {
  uid: string;
  in_game_name: string;
  verified: boolean;
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
  played_on: string | null;
  timestamp: string | null;
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
  playerOne: LobbyTournamentEntrant | null;
  playerTwo: LobbyTournamentEntrant | null;
};

export type LobbyMessage = {
  id: number;
  roomSlug: string;
  body: string;
  createdAt: string;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
    verificationLevel: number;
    verified: boolean;
  };
};

export type LobbySnapshot = {
  tournament: LobbyTournament;
  onlineUsers: LobbyOnlineUser[];
  recentMatches: LobbyMatchRow[];
  messages: LobbyMessage[];
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
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
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
