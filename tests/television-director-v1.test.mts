import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignTelevisionCameras, mergeTelevisionStreamEvidence, televisionCameraStatus, type TelevisionStage } from "../lib/televisionDirection.ts";
import type { WatchStreamPayload } from "../lib/watchStreams.ts";

const stage: TelevisionStage = {confirmedTeams:true,format:"2v1",teams:[
  {key:"allies",label:"TEAM 1",players:[
    {key:"a",name:"Jim",steamId:"76561190000001",civilization:"Franks"},
    {key:"b",name:"Lilith",steamId:"76561190000002",civilization:"Britons"}]},
  {key:"enemy",label:"TEAM 2",players:[
    {key:"c",name:"Zodiac",steamId:"76561190000003",civilization:"Aztecs"}]},
]};
function video(id:number, steam:string|null, playerLabel:string, provider="aoe2war"):WatchStreamPayload {
  return {id,sessionKey:"session-1",provider:provider as WatchStreamPayload["provider"],
    ownerSteamId:steam,playerLabel,status:"live",sourceType:provider==="aoe2war"?"watcher_native":"external",
    label:playerLabel,role:"caster",isPrimary:false,chunkCount:20,latestChunkSeq:19} as WatchStreamPayload;
}
test("two team positions and single opponent are preserved without phantom feeds",()=>{
  const o=assignTelevisionCameras(stage,[
    video(1,"76561190000001","Watcher"),
    video(3,"76561190000003","Other title"),
  ]);
  assert.deepEqual(o.cameras.map(c=>[c.player.name,c.teamKey,c.stream?.id??null,c.identity]),[
    ["Jim","allies",1,"steam-account"],
    ["Lilith","allies",null,"offline"],
    ["Zodiac","enemy",3,"steam-account"],
  ]);
  assert.equal(o.unassigned.length,0);
});
test("a restarted live Watcher displaces older ended video for the same account",()=>{
  const ended={...video(1,"76561190000001","Watcher"),status:"ended",chunkCount:600};
  const live={...video(2,"76561190000001","Watcher"),status:"live",chunkCount:3};
  const o=assignTelevisionCameras(stage,[ended,live]);
  assert.equal(o.cameras[0].stream?.id,2);
  assert.deepEqual(o.unassigned.map(s=>s.id),[1]);
});
test("forged first-party user label cannot claim someone else's camera",()=>{
  const o=assignTelevisionCameras(stage,[video(1,"76561190000099","Jim")]);
  assert.equal(o.cameras[0].stream,null);
  assert.equal(o.unassigned[0].id,1);
});
test("exact unique externally claimed player label is identified as unverified",()=>{
  const o=assignTelevisionCameras(stage,[video(14,null,"Jim","twitch")]);
  assert.equal(o.cameras[0].stream?.id,14);
  assert.equal(o.cameras[0].identity,"unverified-external-label");
});
test("duplicate player names block even exact external feed attribution",()=>{
  const ambiguous:TelevisionStage={confirmedTeams:false,format:"unknown",teams:[{
    key:"unknown",label:"ROSTER",players:[
      {key:"a",name:"Jim",steamId:null,civilization:null},
      {key:"b",name:"Jim",steamId:null,civilization:null},
    ],
  }]};
  assert.equal(assignTelevisionCameras(ambiguous,[video(11,null,"Jim","twitch")]).unassigned.length,1);
});
test("Television front end keeps lazy viewing, a single director and optional capped multi-view",()=>{
  const page=readFileSync("app/television-wolo/page.tsx","utf8");
  const client=readFileSync("components/television/TelevisionWoloExperience.tsx","utf8");
  const api=readFileSync("app/api/watch-streams/route.ts","utf8");
  assert.match(page,/buildStage\(row, source !== "live"\)/);
  assert.match(page,/resolution.status === "resolved"/);
  assert.match(client,/Play selected battle/);
  assert.match(client,/router.refresh\(\)/);
  assert.match(client,/document.visibilityState === "visible"/);
  assert.match(client,/Multi-view OFF/);
  assert.match(client,/findIndex\(item => item.stream\?\.id === feed.id\) < 3/);
  assert.match(client,/No camera is invented/i);
  assert.match(api,/include: \{ user: \{ select: \{ steamId: true \} \} \}/);
});

test("canonical alias feeds survive exact-session refresh and link to authenticated POV",()=>{
  const canonical={...video(11,"76561190000001","Watcher"),sessionKey:"user-a-replay.mg",
    updatedAt:"2026-10-09T18:00:00Z"};
  const exact={...video(12,"76561190000003","Watcher"),sessionKey:"platform:123456",
    updatedAt:"2026-10-09T18:02:00Z"};
  const merged=mergeTelevisionStreamEvidence([canonical],[exact,exact]);
  assert.equal(merged.length,2);
  const director=assignTelevisionCameras(stage,merged);
  assert.deepEqual(director.cameras.map(camera=>camera.stream?.id??null),[11,null,12]);
});
test("latest stream state wins duplicate alias rows and preserves linked owner Steam ID",()=>{
  const old={...video(11,"76561190000001","Watcher"),status:"starting",
    updatedAt:"2026-10-09T18:00:00Z"};
  const current={...old,status:"live",chunkCount:12,ownerSteamId:null,
    updatedAt:"2026-10-09T18:00:05Z"};
  const merged=mergeTelevisionStreamEvidence([old],[current]);
  assert.equal(merged.length,1);
  assert.equal(merged[0].status,"live");
  assert.equal(merged[0].ownerSteamId,"76561190000001");
});
test("live-session stream projector links account owner identity server-side",()=>{
  const server=readFileSync("lib/liveGames.ts","utf8");
  const screen=readFileSync("app/television-wolo/page.tsx","utf8");
  const client=readFileSync("components/television/TelevisionWoloExperience.tsx","utf8");
  assert.match(server,/include: \{ user: \{ select: \{ steamId: true \} \} \}/);
  assert.match(screen,/initialStreams: streams/);
  assert.match(client,/mergeTelevisionStreamEvidence/);
  assert.match(client,/selectedBattle\.initialStreams/);
  assert.doesNotMatch(client,/fuzzyMatch|guessByPlayerName/);
});

test("camera statuses distinguish actual frames from startup, ending and stale transport",()=>{
  const base={...video(44,"76561190000001","Watcher"),status:"live",chunkCount:20,
    latestChunkSeq:19,lastHeartbeatAt:"2026-10-09T18:00:00Z"};
  const now=Date.parse("2026-10-09T18:00:05Z");
  assert.equal(televisionCameraStatus(base,now),"VIDEO LIVE");
  assert.equal(televisionCameraStatus({...base,chunkCount:0},now),"CONNECTING");
  assert.equal(televisionCameraStatus({...base,lastHeartbeatAt:"2026-10-09T17:40:00Z"},now),"SIGNAL STALE");
  assert.equal(televisionCameraStatus({...base,status:"ended"},now),"RECORDING ENDED");
  assert.equal(televisionCameraStatus({...base,status:"ended",chunkCount:0},now),"NO VIDEO");
  assert.equal(televisionCameraStatus(null,now),"NO CAMERA");
});

test("changing the selected battle cannot leak old camera polling results into its director",()=>{
  const source=readFileSync("components/television/TelevisionWoloExperience.tsx","utf8");
  assert.match(source,/selectedBattle\?\.initialStreams \?\? \[\]/);
  assert.match(source,/playingKey === selectedBattle\?\.sessionKey \? streams : \[\]/);
  assert.match(source,/availableStreams\.map\(\(stream\)/);
  assert.match(source,/Video stays asleep until you press play/);
  assert.match(source,/playing && availableStreams\.length > 0/);
});
