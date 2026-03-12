import type { LobbyTournamentEntrant, LobbyTournamentMatch } from "@/lib/lobby";
import { normalizeTournamentMatchStatus } from "@/lib/lobby";
import { summarizeReplayProof } from "@/lib/replayProof";

type EntrantView = {
  id?: number;
  joinedAt: Date;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
    verificationLevel: number;
    verified: boolean;
  };
};

type ReplayView = {
  id: number;
  replayHash: string;
  winner: string | null;
  players: unknown;
  played_on: Date | string | null;
  timestamp: Date | string | null;
  map: unknown;
  original_filename: string | null;
};

type MatchView = {
  id: number;
  round: number;
  position: number;
  label: string | null;
  status: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  winnerEntryId: number | null;
  sourceGameStatsId?: number | null;
  sourceGameStats?: ReplayView | null;
  playerOne: EntrantView | null;
  playerTwo: EntrantView | null;
};

export function toLobbyEntrant(entry: EntrantView): LobbyTournamentEntrant {
  return {
    entryId: entry.id ?? null,
    uid: entry.user.uid,
    inGameName: entry.user.inGameName,
    steamPersonaName: entry.user.steamPersonaName,
    verificationLevel: entry.user.verificationLevel,
    verified: entry.user.verified,
    joinedAt: entry.joinedAt.toISOString(),
  };
}

export function toLobbyTournamentMatch(match: MatchView): LobbyTournamentMatch {
  return {
    id: match.id,
    round: match.round,
    position: match.position,
    label: match.label,
    status: normalizeTournamentMatchStatus(match.status),
    scheduledAt: match.scheduledAt ? match.scheduledAt.toISOString() : null,
    completedAt: match.completedAt ? match.completedAt.toISOString() : null,
    winnerEntryId: match.winnerEntryId,
    sourceGameStatsId: match.sourceGameStatsId ?? null,
    proof: summarizeReplayProof(match.sourceGameStats),
    playerOne: match.playerOne ? toLobbyEntrant(match.playerOne) : null,
    playerTwo: match.playerTwo ? toLobbyEntrant(match.playerTwo) : null,
  };
}
