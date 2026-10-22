/** Production-shaped controlled original-LIVE evidence, not a human capture or
 * an independent Replay API/HMAC certification. API integration may replace
 * this fixture with its actual sanitized committed-upload export. */
import {createHash} from "node:crypto";
import type {CommittedLiveWatcherRow} from "../../lib/liveWatcherMarketAdmission.ts";
export function controlledOriginalLiveRow(options:{name?:string;team?:boolean;mode?:"Random Map"|"Deathmatch";now?:Date}={}):CommittedLiveWatcherRow{
  const name=options.name??"original-live-1",now=options.now??new Date();
  const replayHash=createHash("sha256").update("controlled-original-live/"+name).digest("hex");
  const players=[{name:"LiveOwner",steamId:"76561198000000001",teamId:0},
    ...(options.team?[{name:"LiveAlly",steamId:"76561198000000003",teamId:0}]:[]),
    {name:"LiveOpponent",steamId:"76561198000000002",teamId:1},
    ...(options.team?[{name:"LiveOpponentAlly",steamId:"76561198000000004",teamId:1}]:[])];
  return {id:1,is_final:false,parse_source:"watcher_live",parse_iteration:1,replayHash,
    game_version:"Version.HD",game_type:options.mode??"Random Map",winner:null,
    createdAt:new Date(now.getTime()-1000),played_on:new Date(now.getTime()-30000),players,
    user:{uid:"controlled-live-owner",steamId:"76561198000000001"},
    key_events:{completed:false,postgame_available:false,platform_match_id:"controlled-hd-"+name,
      watcher_upload:{watcher_id:"controlled-original-hd-watcher",watcher_session_id:"original-live/"+name,
        replay_fingerprint:"original-live-fingerprint/"+name,watcher_version:"controlled-fixture",
        ingestion_provenance:"live_monitor",provenance_signature_supplied:true,provenance_signature_verified:true,
        client_sha256_verified:true,client_sha256:replayHash,server_sha256:replayHash}}};
}
