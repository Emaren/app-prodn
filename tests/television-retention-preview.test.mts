import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewLastTwoTelevisionBattles} from "../lib/televisionRetentionPlan.ts";
import type {LiveGamesSnapshot} from "../lib/liveGames.ts";

type Battle=LiveGamesSnapshot["recentlyCompletedSessions"][number];
function battle(id:number,streams:Array<Record<string,unknown>>,opts:{
  finalProofPending?:boolean;teamStatus?:string;replayHash?:string;sessionKey?:string;
}={}):Battle {
  return {
    id, state:"completed",completedAt:new Date(Date.UTC(2026,9,9,0,id)).toISOString(),
    sessionKey:opts.sessionKey??"platform:"+id,
    replayHash:opts.replayHash??"a".repeat(64), finalProofPending:opts.finalProofPending??false,
    players:[{name:"Jim",steamId:"7656119000001"},{name:"Zodiac",steamId:"7656119000002"}],
    teamResolution:{status:opts.teamStatus??"resolved"},
    streams:streams.map(x=>({
      provider:"aoe2war",sourceType:"watcher_native",status:"ended",chunkCount:100,
      ...x,
    })),
  } as unknown as Battle;
}
const s=(id:number,steam:string)=>({id,ownerSteamId:steam});
test("two verified POVs are a candidate for the same completed battle, not automatically retained",()=>{
  const a=battle(1,[s(10,"7656119000001"),s(11,"7656119000002")]);
  const r=previewLastTwoTelevisionBattles([a]);
  assert.equal(r.games[0].candidateStatus,"complete_candidate");
  assert.equal(r.games[0].recordedPlayers,2);
  assert.deepEqual(r.games[0].cameraStreamIds,[10,11]);
  assert.equal(r.retentionEnabled,false);
});
test("unclaimed or external cameras never fabricate a second player POV",()=>{
  const a=battle(2,[s(10,"7656119000001"),{...s(11,"7656119000002"),provider:"twitch"}]);
  const r=previewLastTwoTelevisionBattles([a]);
  assert.equal(r.games[0].candidateStatus,"incomplete_candidate");
  assert.deepEqual(r.games[0].missingPlayers,["Zodiac"]);
});
test("starting/empty streams, unverified replay identities and pending finality are not complete archives",()=>{
  const a=battle(3,[{...s(10,"7656119000001"),status:"live"},s(11,"7656119000002")]);
  assert.equal(previewLastTwoTelevisionBattles([a]).games[0].recordedPlayers,1);
  const b=battle(4,[s(12,"7656119000001"),s(13,"7656119000002")],
    {sessionKey:"ambiguous-name.aoe2record",replayHash:"",finalProofPending:true});
  assert.equal(previewLastTwoTelevisionBattles([b]).games[0].candidateStatus,"unverified_identity");
});
test("preview never merges battles by player names, recency or shared stream label",()=>{
  const a=battle(10,[s(10,"7656119000001"),s(11,"7656119000002")]);
  const b=battle(11,[s(20,"7656119000001")]);
  const c=battle(12,[s(30,"7656119000001")]);
  const r=previewLastTwoTelevisionBattles([a,b,c]);
  assert.deepEqual(r.games.map(x=>x.gameId),[12,11]);
  assert.equal(r.games[0].recordedPlayers,1);
  assert.equal(r.games[1].recordedPlayers,1);
  assert.equal(r.retentionEnabled,false);
});
test("admin preview is never a direct retention writer or destructive cleanup controller",()=>{
  const fn=readFileSync("lib/televisionRetentionPlan.ts","utf8");
  const route=readFileSync("app/api/admin/television-readiness/route.ts","utf8");
  const ui=readFileSync("components/admin/TelevisionReadinessPanel.tsx","utf8");
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/previewLastTwoTelevisionBattles\(snapshot.recentlyCompletedSessions\)/);
  assert.match(ui,/Retention automation: DISABLED/);
  assert.doesNotMatch(fn,/removeStreamChunks|deleteMany|updateMany|\$executeRaw/);
  assert.doesNotMatch(route,/removeStreamChunks|deleteMany|updateMany|\$executeRaw/);
});

test("two-video-game preview is not displaced by later games with no captured footage",()=>{
  const withBoth=battle(21,[s(101,"7656119000001"),s(102,"7656119000002")]);
  const withOne=battle(22,[s(201,"7656119000002")]);
  const without=battle(23,[]);
  const result=previewLastTwoTelevisionBattles([withBoth,withOne,without]);
  assert.deepEqual(result.games.map(game=>game.gameId),[22,21]);
  assert.equal(result.games[0].recordedPlayers,1);
  assert.equal(result.games[1].recordedPlayers,2);
  assert.equal(result.retentionEnabled,false);
});
