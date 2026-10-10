import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessTelevisionChaosBallotGame} from "../lib/televisionChaosBallot.ts";

const now = new Date("2026-10-09T18:00:00Z");
const players=[
  {name:"Jim",steam_id:"765611900000001",team_id:1},
  {name:"Zodiac",steam_id:"765611900000002",team_id:2},
];
function game(overrides:Record<string,unknown>={}) {
  return {is_final:true,replayHash:"a".repeat(64),parse_source:"watcher_final",
    players,createdAt:new Date("2026-10-09T17:50:00Z"),played_on:null,...overrides};
}
test("final 1v1 Watcher battle offers both actual roster nominees for 72-hour nonbinding vote",()=>{
  const result=assessTelevisionChaosBallotGame(game(),now);
  assert.equal(result.eligible,true);
  assert.equal(result.reason,"ready");
  assert.equal(result.candidates.length,2);
  assert.notEqual(result.candidates[0].key,result.candidates[1].key);
  assert.match(result.rosterHash??"",/^[a-f0-9]{64}$/);
  assert.equal(result.closesAt,"2026-10-12T17:50:00.000Z");
});
test("unfinalized game, unverified recording origin and bad replay identity cannot receive ballots",()=>{
  for(const change of [{is_final:false},{parse_source:"file_upload"},{replayHash:""}]) {
    const result=assessTelevisionChaosBallotGame(game(change),now);
    assert.equal(result.eligible,false);
    assert.equal(result.reason,"unverified_game");
  }
});
test("incomplete or ambiguous teams and duplicate identities are not eligible nominees",()=>{
  const names=[{name:"Jim"},{name:"Zodiac"},{name:"Tekki"}];
  const unresolved=assessTelevisionChaosBallotGame(game({players:names}),now);
  assert.equal(unresolved.reason,"roster_unproven");
  const dup=assessTelevisionChaosBallotGame(game({players:[players[0],players[0]]}),now);
  assert.equal(dup.reason,"roster_unproven");
});
test("ballot closure preserves historical roster proof and candidate tally identity",()=>{
  const late=assessTelevisionChaosBallotGame(game(),new Date("2026-10-15T18:00:00Z"));
  assert.equal(late.eligible,false);
  assert.equal(late.reason,"outside_window");
  assert.ok(late.rosterHash);
  assert.equal(late.candidates.length,2);
});
test("server is signed-in, same-origin, roster-validated, one ballot/account with no title execution",()=>{
  const route=readFileSync("app/api/television/chaos-ballots/route.ts","utf8");
  const schema=readFileSync("prisma/schema.prisma","utf8");
  const sql=readFileSync("prisma/migrations/20261009190000_television_chaos_ballots/migration.sql","utf8");
  const ui=readFileSync("components/television/TelevisionWoloExperience.tsx","utf8");
  assert.match(route,/getSessionUid\(request\)/);
  assert.match(route,/request\.headers\.get\("origin"\)!==request\.nextUrl\.origin/);
  assert.match(route,/readBoundedStreamChunkBody\(request.body,2048\)/);
  assert.match(route,/eligibility\.candidates\.some\(candidate=>candidate\.key===nomineeKey\)/);
  assert.match(route,/error\.code==="P2002"/);
  assert.match(schema,/@@unique\(\[gameStatsId, userId\]/);
  assert.match(sql,/CREATE UNIQUE INDEX "uq_television_chaos_ballot_user"/);
  assert.match(sql,/ON DELETE CASCADE ON UPDATE NO ACTION/);
  assert.match(schema,/onDelete: Cascade, onUpdate: NoAction/);
  assert.match(ui,/Chaos of the Match/);
  assert.match(ui,/Your ballot is recorded/);
  assert.doesNotMatch(ui,/candidateNames\.slice\(0,4\)/);
  assert.doesNotMatch(route,/trophy\.update|betWager|walletAddress|settleWolo/);
});

test("spectator tallies refresh only in visible tabs and reject stale response races",()=>{
  const ui=readFileSync("components/television/TelevisionWoloExperience.tsx","utf8");
  assert.match(ui,/document.visibilityState==="hidden"/);
  assert.match(ui,/window.setInterval\(\(\)=>void reload\(\),20_000\)/);
  assert.match(ui,/current===requestNumber/);
  assert.match(ui,/document.removeEventListener\("visibilitychange",onVisible\)/);
  assert.match(ui,/setRefreshKey\(n=>n\+1\)/);
});

test("lobby/archive row IDs are never interpreted as final replay GameStats ballot IDs",()=>{
  const page=readFileSync("app/television-wolo/page.tsx","utf8");
  const ui=readFileSync("components/television/TelevisionWoloExperience.tsx","utf8");
  assert.match(page,/ballotGameId: source === "recent"/);
  assert.match(ui,/battle\?\.ballotGameId/);
  assert.match(ui,/Lobby\/archive IDs are not necessarily GameStats IDs/);
  assert.doesNotMatch(ui,/const gameId=typeof battle\?\.id/);
});
