import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {committedLiveWatcherAdmissionIssue,LIVE_WATCHER_ADMISSION_MAX_AGE_MS} from "../lib/liveWatcherMarketAdmission.ts";
import {classifyReplayIngestReceipt,coordinateReplayPostIngest,replayPostIngestReportSucceeded} from "../lib/replayPostIngest.ts";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";
const now=new Date("2026-10-21T23:00:00.000Z");
for(const mode of ["Random Map","Deathmatch"] as const)for(const team of [false,true]){
  test(`controlled original HD LIVE ${team?"2v2":"1v1"} ${mode} has exact admission evidence`,()=>{
    assert.equal(committedLiveWatcherAdmissionIssue(controlledOriginalLiveRow({mode,team,now}),now.getTime()),null);
  });
}
test("stale, DE, unknown/custom mode, terminal and spoofed Watcher inputs cannot admit",()=>{
  for(const change of [
    {createdAt:new Date(now.getTime()-LIVE_WATCHER_ADMISSION_MAX_AGE_MS-1)},
    {played_on:new Date(now.getTime()-LIVE_WATCHER_ADMISSION_MAX_AGE_MS-1)},
    {played_on:new Date(now.getTime()+1)}, {game_version:"Version.DE"},{game_version:null},
    {game_type:"Unknown"},{game_type:"Regicide"},{is_final:true},{parse_source:"upload"},{winner:"LiveOwner"},
    {user:{uid:"spoofed-owner",steamId:"76561198000000999"}},
  ])assert.notEqual(committedLiveWatcherAdmissionIssue({...controlledOriginalLiveRow({now}),...change},now.getTime()),null);
  const base=controlledOriginalLiveRow({now});
  const events=base.key_events as Record<string,unknown>,upload=events.watcher_upload as Record<string,unknown>;
  for(const change of [{provenance_signature_verified:false},{provenance_signature_supplied:false},
    {ingestion_provenance:"historical_import"},{client_sha256_verified:false},{server_sha256:"f".repeat(64)},
    {watcher_session_id:""},{replay_fingerprint:""}]){
    assert.notEqual(committedLiveWatcherAdmissionIssue({...base,key_events:{...events,watcher_upload:{...upload,...change}}},now.getTime()),null);
  }
  assert.notEqual(committedLiveWatcherAdmissionIssue({...base,key_events:{...events,completed:true}},now.getTime()),null);
  assert.notEqual(committedLiveWatcherAdmissionIssue({...base,key_events:{...events,settings:{type:"Deathmatch"}}},now.getTime()),null);
});
test("LIVE post-ingest admission is awaited and never requests result settlement",async()=>{
  const receipt=classifyReplayIngestReceipt({game_id:42,is_final:false,finality_status:"live",parse_completed:true},true);
  const calls:string[]=[];
  const report=await coordinateReplayPostIngest({prisma:{},receipts:[receipt,receipt],source:"api_direct",dependencies:{
    admitLiveWatcherMarkets:async(_prisma,ids)=>{assert.deepEqual(ids,[42]);await Promise.resolve();calls.push("admitted");return {createdCount:2,existingCount:0,skippedCount:0};},
    ensureBetMarkets:async()=>{throw Error("LIVE cannot invoke full financial ensure");},
    reconcileTournamentMatchProofs:async()=>{throw Error("LIVE cannot invoke result tournament settlement");},
  }});
  assert.deepEqual(calls,["admitted"]);assert.equal(report.admission.liveMarkets.succeeded,true);
  assert.equal(report.financial.markets.requested,false);assert.equal(report.financial.tournament.requested,false);
  assert.equal(replayPostIngestReportSucceeded(report),true);
});
test("private ingest returns a retryable failure when awaited admission fails",async()=>{
  const report=await coordinateReplayPostIngest({prisma:{},source:"api_direct",receipts:[classifyReplayIngestReceipt({game_id:42,is_final:false,finality_status:"live"},true)],dependencies:{
    admitLiveWatcherMarkets:async()=>{throw Error("temporary database failure");},ensureBetMarkets:async()=>{},reconcileTournamentMatchProofs:async()=>{},
  }});
  assert.equal(report.admission.liveMarkets.succeeded,false);assert.equal(replayPostIngestReportSucceeded(report),false);
});
test("authenticated ingest has no process-local LIVE financial timer fallback",()=>{
  for(const route of ["app/api/replay/post-ingest/route.ts","app/api/replay/upload/route.ts"]){
    const source=readFileSync(new URL("../"+route,import.meta.url),"utf8");
    assert.ok(!source.includes("queueBetMarketEnsure"));
  }
  const privateRoute=readFileSync(new URL("../app/api/replay/post-ingest/route.ts",import.meta.url),"utf8");
  assert.ok(privateRoute.indexOf("if (!authorized(request))")<privateRoute.indexOf("coordinateReplayPostIngest({"));
});
