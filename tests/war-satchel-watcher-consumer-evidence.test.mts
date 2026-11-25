import assert from "node:assert/strict";
import test from "node:test";
import {normalizeReplayPlayers,resolveReplayTeams} from "../lib/teamResolution.ts";
import {satchelWatcherConsumerIdentityIssue,satchelWatcherConsumerTimeIssue} from "../lib/warSatchelWatcherConsumerEvidence.ts";

function fixture(){
 const players=normalizeReplayPlayers([{name:"Owner",steamId:"76561198000000001",teamId:0},
  {name:"Opponent",steamId:"76561198000000002",teamId:1}]);
 const teams=resolveReplayTeams(players);
 assert.equal(teams.status,"resolved");
 const market={id:23,linkedSessionKey:"watcher:original-alias",propositionHash:teams.propositionHash,
  sourceRosterHash:teams.rosterHash,sourceParseIteration:1,teamResolutionStatus:"resolved",
  teamConfidence:"high",leftRosterSnapshot:teams.teams[0].players as unknown,
  rightRosterSnapshot:teams.teams[1].players as unknown};
 const sourceEvidence:Record<string,unknown>={mode:"shadow",exactSteamRosterMatch:true,
  exactUploaderUidMatch:true,marketIntegrityStatus:"verified",teamResolutionStatus:"resolved",
  teamConfidence:"high",winnerMarketId:23,desyncMarketId:null,
  ownerUid:"owner",ownerSteamId:"76561198000000001",linkedSessionKey:market.linkedSessionKey,
  canonicalSessionKey:"watcher:original",propositionHash:teams.propositionHash,
  sourceRosterHash:teams.rosterHash,sourceParseIteration:1};
 return {owner:{uid:"owner",steamId:"76561198000000001"},market,execution:{
  gameIdentityKey:"watcher:original",sessionKey:"watcher:original",propositionHash:teams.propositionHash!,
  selectedSide:"left",winnerMarketId:23,desyncMarketId:null as number|null,sourceEvidence}};
}
test("current owner on exact canonical Steam side accepts original aliases and team zero",()=>{
 assert.equal(satchelWatcherConsumerIdentityIssue(fixture()),null);
});
test("original owner and both market deadlines remain strict after database waits",()=>{
 const at=Date.parse("2026-10-25T12:00:00Z");
 const market={status:"live",marketType:"winner",scheduledMatchId:null,linkedSessionKey:"watcher:original",
  createdAt:new Date(at-500),closeAt:new Date(at+1000),phaseOpensAt:null,phaseClosesAt:null,
  winnerSide:null,settledAt:null,voidedAt:null,refundStatus:null,settlementExecutedAt:null,
  linkedGameStatsId:null,lateFinalGameStatsId:null};
 const input={markets:[market],executionCreatedAt:new Date(at),signedAt:new Date(at-1000),
  spendExpiresAt:new Date(at+5000),now:new Date(at)};
 assert.equal(satchelWatcherConsumerTimeIssue(input),null);
 assert.equal(satchelWatcherConsumerTimeIssue({...input,now:new Date(at+1000)}),"watcher_market_cutoff_reached");
 assert.equal(satchelWatcherConsumerTimeIssue({...input,spendExpiresAt:new Date(at)}),"watcher_consumer_mandate_expired_during_transaction");
 assert.equal(satchelWatcherConsumerTimeIssue({...input,spendExpiresAt:new Date(NaN)}),"watcher_consumer_mandate_expired_during_transaction");
 assert.equal(satchelWatcherConsumerTimeIssue({...input,markets:[market,{...market,marketType:"desync",closeAt:new Date(at)}]}),"watcher_market_cutoff_reached");
});
test("stored admission flags cannot authorize a changed owner, game, roster or side",()=>{
 const mutations:Record<string,(x:ReturnType<typeof fixture>)=>void>={
  ownerSteam:x=>{x.owner.steamId="76561198000000009";},
  ownerUid:x=>{x.owner.uid="other-owner";},
  missingSteamEvidence:x=>{delete x.execution.sourceEvidence.ownerSteamId;},
  foreignMarket:x=>{x.market.id=24;},
  foreignSession:x=>{x.market.linkedSessionKey="watcher:foreign";},
  changedExecution:x=>{x.execution.gameIdentityKey="watcher:foreign";},
  changedSession:x=>{x.execution.sessionKey="watcher:foreign";},
  wrongSide:x=>{x.execution.selectedSide="right";},
  switchedSides:x=>{[x.market.leftRosterSnapshot,x.market.rightRosterSnapshot]=[x.market.rightRosterSnapshot,x.market.leftRosterSnapshot];},
  rosterRevision:x=>{x.market.sourceParseIteration=2;},
  foreignRoster:x=>{x.market.rightRosterSnapshot=[{name:"Foreign",steamId:"76561198000000009",teamId:1}];},
  untrustedRoster:x=>{x.market.teamConfidence="low";},
  missingUploader:x=>{x.execution.sourceEvidence.exactUploaderUidMatch=false;},
  differentDesync:x=>{x.execution.desyncMarketId=24;},
 };
 for(const [name,mutate] of Object.entries(mutations)){
  const x=fixture();mutate(x);
  assert.match(satchelWatcherConsumerIdentityIssue(x)??"",/^watcher_consumer_/,name);
 }
});
