import {
  buildRosterHash, normalizeReplayPlayers, resolveReplayTeams,
} from "./teamResolution.ts";

export type ChaosBallotParticipant = { key: string; name: string; teamId: string | null };
export type ChaosBallotEligibility = {
  eligible: boolean;
  reason: "ready" | "unverified_game" | "roster_unproven" | "outside_window";
  rosterHash: string | null;
  candidates: ChaosBallotParticipant[];
  closesAt: string | null;
};

const BALLOT_WINDOW_MS = 72 * 60 * 60 * 1000;

export function assessTelevisionChaosBallotGame(game: {
  is_final: boolean; replayHash: string; parse_source: string;
  players: unknown; createdAt: Date; played_on: Date | null;
}, now = new Date()): ChaosBallotEligibility {
  const no = (reason: ChaosBallotEligibility["reason"]): ChaosBallotEligibility =>
    ({ eligible:false,reason,rosterHash:null,candidates:[],closesAt:null });
  if (!game.is_final || !/^[a-f0-9]{64}$/i.test(game.replayHash) ||
      !game.parse_source.startsWith("watcher_")) return no("unverified_game");
  const players = normalizeReplayPlayers(game.players);
  const teams = resolveReplayTeams(players,{final:true});
  if (teams.status !== "resolved" || players.length < 2 || players.length > 8 ||
      new Set(players.map(p=>p.stablePlayerKey)).size!==players.length)
    return no("roster_unproven");
  const rosterHash=buildRosterHash(players);
  if (!rosterHash) return no("roster_unproven");
  const when=game.played_on ?? game.createdAt;
  const eventMs=when.getTime(), nowMs=now.getTime();
  const withinWindow=Number.isFinite(eventMs) &&
    eventMs<=nowMs+5*60_000 && eventMs+BALLOT_WINDOW_MS>=nowMs;
  // Closed polls remain readable with their original roster hash, but never
  // accept further ballots. Preserve voter choice and historical tallies.
  return {
    eligible:withinWindow,reason:withinWindow?"ready":"outside_window",rosterHash,
    closesAt:Number.isFinite(eventMs)
      ?new Date(eventMs+BALLOT_WINDOW_MS).toISOString():null,
    candidates:players.map(p=>({key:p.stablePlayerKey,name:p.name,teamId:p.teamId})),
  };
}
