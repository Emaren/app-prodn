import type { LiveGamesSnapshot } from "./liveGames";

/**
 * READ-ONLY battle-cohort planning, never an archival or deletion authority.
 * Association is inherited exclusively from the canonical live game engine.
 * A stream is not attached to a battle by similarity of player/map/times.
 */
type CompletedBattle = LiveGamesSnapshot["recentlyCompletedSessions"][number];
export type TelevisionRetentionCandidate = {
  battleKey: string;
  completedAt: string;
  gameId: number;
  rosterSize: number;
  recordedPlayers: number;
  missingPlayers: string[];
  cameraStreamIds: number[];
  recordingCount: number;
  teamsProven: boolean;
  strongBattleIdentity: boolean;
  candidateStatus: "complete_candidate" | "incomplete_candidate" | "unverified_identity";
  warning: string;
};

function authoritativeIdentity(session: CompletedBattle): boolean {
  const key = session.sessionKey.trim();
  return /^platform:[a-zA-Z0-9_-]{1,128}$/.test(key) ||
    /^[a-fA-F0-9]{64}$/.test(session.replayHash);
}

export function previewLastTwoTelevisionBattles(
  sessions: CompletedBattle[],
  maxRecent = 2,
): {games: TelevisionRetentionCandidate[]; examined: number; unverified: number; retentionEnabled: false} {
  const ordered = sessions
    .filter(session => session.state === "completed" && Boolean(session.completedAt))
    .sort((a,b) => new Date(b.completedAt ?? 0).getTime() -
      new Date(a.completedAt ?? 0).getTime() || b.id-a.id);
  const seen = new Set<string>();
  const candidates: TelevisionRetentionCandidate[] = [];
  for (const session of ordered) {
    if (seen.has(session.sessionKey)) continue;
    seen.add(session.sessionKey);
    const participants = session.players;
    const steamIds = new Set(participants.map(player => player.steamId?.trim())
      .filter((v): v is string => Boolean(v)));
    const bySteam = new Map<string, typeof session.streams>();
    // Only streams attached by server-side replay identity grouping count.
    // Reject removed, external, empty, active and anonymous media.
    for (const stream of session.streams) {
      const steamId = stream.ownerSteamId?.trim();
      if (!steamId || !steamIds.has(steamId) ||
          stream.provider !== "aoe2war" || stream.sourceType !== "watcher_native" ||
          stream.status !== "ended" || stream.chunkCount <= 0 ||
          !Number.isSafeInteger(stream.id) || stream.id <= 0) continue;
      const found = bySteam.get(steamId) ?? [];
      if (!found.some(entry => entry.id === stream.id)) found.push(stream);
      bySteam.set(steamId, found);
    }
    const missingPlayers = participants
      .filter(player => !player.steamId?.trim() ||
        !bySteam.has(player.steamId.trim()))
      .map(player => player.name);
    const strongBattleIdentity = authoritativeIdentity(session);
    const teamsProven = session.teamResolution.status === "resolved";
    const cameraStreamIds = [...new Set([...bySteam.values()]
      .flat().map(stream => stream.id))].sort((a,b)=>a-b);
    const complete = strongBattleIdentity && !session.finalProofPending &&
      teamsProven && participants.length >= 2 &&
      steamIds.size === participants.length && missingPlayers.length === 0;
    const candidateStatus: TelevisionRetentionCandidate["candidateStatus"] =
      !strongBattleIdentity || session.finalProofPending ? "unverified_identity" :
      complete ? "complete_candidate" : "incomplete_candidate";
    candidates.push({
      battleKey:session.sessionKey,
      completedAt:session.completedAt!,
      gameId:session.id,
      rosterSize:participants.length,
      recordedPlayers:bySteam.size,
      missingPlayers,
      cameraStreamIds,
      recordingCount:cameraStreamIds.length,
      teamsProven,
      strongBattleIdentity,
      candidateStatus,
      warning:complete
        ? "All roster POVs attached by authoritative identity; disk presence and playable bytes still require verification."
        : !strongBattleIdentity || session.finalProofPending
          ? "Battle identity/finality is not certified. Never auto-retain or delete based on this grouping."
          : "Some player cameras or team evidence are missing. Do not claim a complete multi-POV archive.",
    });
  }
  const games = candidates.slice(0,Math.max(1,Math.min(maxRecent,2)));
  return {
    games, examined:candidates.length,
    unverified:games.filter(game=>game.candidateStatus!=="complete_candidate").length,
    retentionEnabled:false,
  };
}
