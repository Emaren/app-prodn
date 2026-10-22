import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {classifyReplayIngestReceipt,coordinateReplayPostIngest,replayPostIngestReportSucceeded} from "../lib/replayPostIngest.ts";

test("authenticated original LIVE commit awaits admission once; no settlement or chain calls",async()=>{
 const receipt=classifyReplayIngestReceipt({game_id:42,is_final:false,finality_status:"live",parse_completed:true},true);
 const calls:string[]=[];
 const report=await coordinateReplayPostIngest({prisma:{},receipts:[receipt,receipt],source:"api_direct",dependencies:{
   admitLiveWatcherMarkets:async(_prisma,ids)=>{assert.deepEqual(ids,[42]);await Promise.resolve();calls.push("admitted");
     return {createdCount:2,existingCount:0,skippedCount:0};},
   ensureBetMarkets:async()=>{throw Error("live upload cannot call settlement-capable full ensure");},
   reconcileTournamentMatchProofs:async()=>{throw Error("live upload cannot request tournament payout");},
 }});
 assert.deepEqual(calls,["admitted"]);
 assert.equal(report.admission.liveMarkets.succeeded,true);
 assert.equal(report.financial.markets.requested,false);
 assert.equal(report.financial.tournament.requested,false);
 assert.equal(replayPostIngestReportSucceeded(report),true);
});
test("failed private admission returns a retryable, explicitly unsuccessful report",async()=>{
 const receipt=classifyReplayIngestReceipt({game_id:42,is_final:false,finality_status:"live"},true);
 const report=await coordinateReplayPostIngest({prisma:{},source:"api_direct",receipts:[receipt],dependencies:{
   admitLiveWatcherMarkets:async()=>{throw Error("transient PostgreSQL failure");},
   ensureBetMarkets:async()=>{},reconcileTournamentMatchProofs:async()=>{},
 }});
 assert.equal(report.admission.liveMarkets.succeeded,false);
 assert.equal(replayPostIngestReportSucceeded(report),false);
});
test("live post-ingest never falls back to process timer or public GET",()=>{
 for(const route of ["app/api/replay/post-ingest/route.ts"]){
   const s=readFileSync(new URL("../"+route,import.meta.url),"utf8");
   assert.ok(!s.includes("queueBetMarketEnsure"));
   assert.ok(s.indexOf("if (!authorized(request))")<s.indexOf("coordinateReplayPostIngest({"));
 }
 const recovery=readFileSync(new URL("../app/api/admin/replay-auto-recovery/route.ts",import.meta.url),"utf8");
 assert.ok(recovery.indexOf("!authorized(request)")<recovery.indexOf("recoverCommittedLiveWatcherMarkets(prisma,"));
});
