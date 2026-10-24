/** Admission of a new HD live proposition, never a result or payment authority.
 * Inputs are reloaded from the committed Replay API row, not its HTTP receipt.
 */
import {readWatcherUploadMetadata,LIVE_IDENTITY_PROMOTION_WINDOW_MS,type LiveGameSession} from "./liveSessionSnapshot.ts";
import {normalizeReplayPlayers,resolveReplayTeams} from "./teamResolution.ts";
import {normalizeReplaySteamId} from "./replayPlayerIdentity.ts";
import {resolveLeaderboardReplayMode} from "./leaderboardGameMode.ts";

// Same canonical live-session horizon. No fresh book from an old upload.
export const LIVE_WATCHER_ADMISSION_MAX_AGE_MS=LIVE_IDENTITY_PROMOTION_WINDOW_MS;
export type CommittedLiveWatcherRow={
  id:number;is_final:boolean;parse_source:string|null;parse_iteration:number;replayHash:string;
  game_version:string|null;game_type:string|null;createdAt:Date;played_on:Date|null;winner:string|null;
  players:unknown;key_events:unknown;user:{uid:string;steamId:string|null}|null;
};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};

export function committedLiveWatcherAdmissionIssue(row:CommittedLiveWatcherRow,nowMs=Date.now()):string|null{
  if(!Number.isSafeInteger(row.id)||row.id<=0||row.is_final||row.parse_source!=="watcher_live"||row.parse_iteration<1)
    return "not_original_live_commit";
  if(!["version.hd","hd"].includes(String(row.game_version).trim().toLowerCase()))return "not_hd";
  if(!resolveLeaderboardReplayMode(row))return "unsupported_or_conflicting_game_mode";
  const observed=row.createdAt.getTime(),started=row.played_on?.getTime();
  if(!Number.isSafeInteger(nowMs)||!Number.isFinite(observed)||observed>nowMs||nowMs-observed>LIVE_WATCHER_ADMISSION_MAX_AGE_MS||
     started===undefined||!Number.isFinite(started)||started>nowMs||nowMs-started>LIVE_WATCHER_ADMISSION_MAX_AGE_MS)
    return "stale_or_unknown_live_clock";
  const players=normalizeReplayPlayers(row.players);
  if(row.winner&&row.winner.trim().toLowerCase()!=="unknown"||players.some(player=>player.winner===true))return "result_already_observed";
  const events=object(row.key_events),raw=object(events.watcher_upload),upload=readWatcherUploadMetadata(row.key_events);
  if(!upload?.liveMonitor||!upload.signatureSupplied||!upload.provenanceVerified||!upload.clientSha256Verified||
     !upload.watcherId||!upload.watcherSessionId||!upload.replayFingerprint||
     !/^[a-f0-9]{64}$/i.test(row.replayHash)||raw.server_sha256!==row.replayHash||raw.client_sha256!==row.replayHash)
    return "authenticated_original_upload_required";
  if(events.completed===true||events.postgame_available===true||events.live_pending_parse===true)
    return "not_parsed_live_evidence";
  const steam=normalizeReplaySteamId(row.user?.steamId),teams=resolveReplayTeams(players);
  if(!row.user?.uid||!steam||players.filter(p=>p.steamId===steam).length!==1)
    return "authenticated_uploader_not_exact_participant";
  if(teams.status!=="resolved"||teams.confidence!=="high"||teams.teams.length!==2||!teams.propositionHash)
    return "complete_two_team_roster_required";
  return null;
}

/** Preserve the snapshot's canonical platform/fallback identity and full roster.
 * A same-name player, arbitrary receipt game ID or recent user clock is insufficient.
 */
export function liveSessionMatchesCommittedWatcher(row:CommittedLiveWatcherRow,session:LiveGameSession):boolean{
  const upload=readWatcherUploadMetadata(row.key_events);
  const teams=resolveReplayTeams(normalizeReplayPlayers(row.players));
  return Boolean(upload&&row.user&&session.state==="live"&&!session.finalProofPending&&
    session.parseSource==="watcher_live"&&session.winner===null&&
    session.authenticatedLiveWatcherParticipantUids?.includes(row.user.uid)&&
    session.watcherSessionIds.includes(upload.watcherSessionId)&&
    session.replayFingerprints.includes(upload.replayFingerprint)&&
    session.teamResolution.propositionHash===teams.propositionHash);
}
