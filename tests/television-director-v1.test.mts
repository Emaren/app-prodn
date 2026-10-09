import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignTelevisionCameras, type TelevisionStage } from "../lib/televisionDirection.ts";
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
  assert.match(client,/Multi-view OFF/);
  assert.match(client,/findIndex\(item => item.stream\?\.id === feed.id\) < 3/);
  assert.match(client,/No camera is invented/i);
  assert.match(api,/include: \{ user: \{ select: \{ steamId: true \} \} \}/);
});
