import assert from "node:assert/strict";
import test from "node:test";
import {committedLiveWatcherAdmissionIssue,LIVE_WATCHER_ADMISSION_MAX_AGE_MS} from "../lib/liveWatcherMarketAdmission.ts";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";
const now=new Date("2026-10-21T23:00:00.000Z");

for(const mode of ["Random Map","Deathmatch"] as const)
  for(const team of [false,true])
    test(`controlled original HD LIVE ${team?"2v2":"1v1"} ${mode} is eligible with complete source proof`,()=>{
      assert.equal(committedLiveWatcherAdmissionIssue(controlledOriginalLiveRow({mode,team,now}),now.getTime()),null);
    });

test("historical, DE, spoofed, unparsed and final sources never admit a financial live book",()=>{
  const base=controlledOriginalLiveRow({now});
  for(const change of [
    {is_final:true}, {parse_source:"upload"}, {game_version:"Version.DE"}, {game_version:null},
    {game_type:"Unknown"},{winner:"LiveOwner"},
    {createdAt:new Date(now.getTime()-LIVE_WATCHER_ADMISSION_MAX_AGE_MS-1)},
    {played_on:new Date(now.getTime()+1)},
    {user:{uid:"different",steamId:"76561198000000999"}},
  ]) assert.notEqual(committedLiveWatcherAdmissionIssue({...base,...change},now.getTime()),null);
  const events=base.key_events as Record<string,unknown>;
  const upload=events.watcher_upload as Record<string,unknown>;
  for(const changes of [
    {provenance_signature_verified:false},{provenance_signature_supplied:false},
    {ingestion_provenance:"historical_import"},{client_sha256_verified:false},
    {server_sha256:"f".repeat(64)},{watcher_session_id:""},{replay_fingerprint:""},
  ]){
    const row={...base,key_events:{...events,watcher_upload:{...upload,...changes}}};
    assert.notEqual(committedLiveWatcherAdmissionIssue(row,now.getTime()),null);
  }
  for(const change of [{completed:true},{postgame_available:true},{live_pending_parse:true}]){
    assert.notEqual(committedLiveWatcherAdmissionIssue({...base,key_events:{...events,...change}},now.getTime()),null);
  }
});
