/** Isolated PostgreSQL original-LIVE end-to-end; fixture capture not human LIVE. */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
import test from "node:test";
import type {Prisma} from "../lib/generated/prisma/index.js";
import {coordinateReplayPostIngest,classifyReplayIngestReceipt} from "../lib/replayPostIngest.ts";
import {admitCommittedLiveWatcherMarkets,recoverCommittedLiveWatcherMarkets} from "../lib/bets.ts";
import {startLifecycleDatabase} from "./fixtures/satchel-lifecycle-db.mts";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";

test("original LIVE admitted from real committed PG; terminal races and lost notification fail closed",{
  skip:process.env.RUN_LIVE_MARKET_PG_TESTS!=="1",timeout:120000
},async t=>{
 const db=await startLifecycleDatabase(),oldFetch=globalThis.fetch,prior=process.env.BET_AUTOMATION_MODE;
 let network=0;
 globalThis.fetch=(async()=>{network++;throw Error("no bank/signer/network in live admission");}) as typeof fetch;
 process.env.BET_AUTOMATION_MODE="shadow";
 try{
   const owner=await db.prisma.user.create({data:{uid:"controlled-live-owner",steamId:"76561198000000001",inGameName:"LiveOwner",verified:true,verificationLevel:2}});
   await db.prisma.betAutoPreset.create({data:{userId:owner.id,enabled:true,winnerStakeWolo:25,desyncSide:"none",
     desyncStakeWolo:0,untilOut:false,gamesRemaining:12,selfOnly:true,version:1}});
   async function persist(name:string,change:Partial<ReturnType<typeof controlledOriginalLiveRow>>={}){
     const e={...controlledOriginalLiveRow({name}),...change};
     return db.prisma.gameStats.create({data:{userUid:owner.uid,replay_file:"controlled-"+name+".aoe2record",
       original_filename:"controlled-"+name+".aoe2record",replayHash:e.replayHash,
       is_final:e.is_final,parse_source:e.parse_source,parse_reason:"watcher_live_snapshot",parse_iteration:e.parse_iteration,
       game_version:e.game_version,game_type:e.game_type,createdAt:e.createdAt,timestamp:e.createdAt,
       played_on:e.played_on,game_duration:30,winner:e.winner,
       players:e.players as Prisma.InputJsonValue,key_events:e.key_events as Prisma.InputJsonValue}});
   }
   async function ingest(row:{id:number;replayHash:string}){
     return coordinateReplayPostIngest({prisma:db.prisma,source:"api_direct",
       receipts:[classifyReplayIngestReceipt({game_id:row.id,replay_hash:row.replayHash,
         is_final:false,effective_is_final:false,finality_status:"live",parse_completed:true,
         result_resolved:false,result_trusted:false,should_settle:false},true)]});
   }
   const first=await persist("first-original");
   await t.test("four concurrent accepted notifications create exactly one wagerable pair",async()=>{
     const reports=await Promise.all(Array.from({length:4},()=>ingest(first)));
     for(const r of reports){
       assert.equal(r.admission.liveMarkets.succeeded,true);
       assert.equal(r.financial.markets.requested,false);
       assert.equal(r.financial.tournament.requested,false);
     }
     const markets=await db.prisma.betMarket.findMany();
     assert.equal(markets.length,2);
     const winner=markets.find(m=>m.marketType==="winner"),desync=markets.find(m=>m.marketType==="desync");
     assert.ok(winner);assert.ok(desync);
     assert.equal(winner.status,"live");assert.equal(winner.winnerSide,null);
     assert.equal(desync.parentMarketId,winner.id);
     assert.equal(await db.prisma.betAutoExecution.count(),1);
   });
   await t.test("stale, DE, unverified and terminal committed rows cannot open books",async()=>{
     const before=await db.prisma.betMarket.count();
     const e=controlledOriginalLiveRow({name:"spoof"}),events=e.key_events as Record<string,unknown>,upload=events.watcher_upload as Record<string,unknown>;
     for(const [name,change] of [
       ["stale",{played_on:new Date(Date.now()-13*60000)}],
       ["de",{game_version:"Version.DE"}],
       ["unsigned",{key_events:{...events,watcher_upload:{...upload,provenance_signature_verified:false}}}],
       ["final",{is_final:true,winner:"LiveOwner"}],
     ] as const){
       const row=await persist(name,change);
       const report=await ingest(row);
       assert.equal(report.admission.liveMarkets.createdCount,0);
     }
     assert.equal(await db.prisma.betMarket.count(),before);
   });
   await t.test("late duplicate cannot reopen already closing/voided books",async()=>{
     const markets=await db.prisma.betMarket.findMany({where:{linkedSessionKey:"platform:controlled-hd-first-original"}});
     assert.equal(markets.length,2);
     await db.prisma.betMarket.updateMany({where:{id:{in:markets.map(m=>m.id)}},data:{status:"closing",closeAt:new Date(Date.now()-1)}});
     await admitCommittedLiveWatcherMarkets(db.prisma,[first.id]);
     assert.ok((await db.prisma.betMarket.findMany({where:{id:{in:markets.map(m=>m.id)}}})).every(m=>m.status==="closing"));
     await db.prisma.betMarket.updateMany({where:{id:{in:markets.map(m=>m.id)}},data:{status:"voided",voidedAt:new Date(),refundStatus:"queued"}});
     await ingest(first);
     assert.ok((await db.prisma.betMarket.findMany({where:{id:{in:markets.map(m=>m.id)}}})).every(m=>m.status==="voided"&&m.refundStatus==="queued"));
   });
   await t.test("original source becoming final while market waits cannot create market",async()=>{
     const row=await persist("result-under-lock");
     await db.sql.query("BEGIN");
     await db.sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["platform:controlled-hd-result-under-lock"]);
     const pending=ingest(row);
     try{
       let blocked=false;
       for(let i=0;i<100;i++){
         await db.sql.query("SELECT pg_stat_clear_snapshot()");
         const r=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event='advisory' AND pid<>pg_backend_pid()");
         if(Number(r.rows[0].count)>0){blocked=true;break;}
         await sleep(10);
       }
       assert.ok(blocked,"market write must actually reach advisory lock");
       await db.prisma.gameStats.update({where:{id:row.id},data:{is_final:true,parse_source:"watcher_final",winner:"LiveOwner"}});
     }finally{await db.sql.query("COMMIT");}
     const report=await pending;
     assert.equal(report.admission.liveMarkets.createdCount,0);
     assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:"platform:controlled-hd-result-under-lock"}}),0);
   });
   await t.test("committed upload lost before notifier is recovered idempotently",async()=>{
     const row=await persist("lost-notifier");
     const preview=await recoverCommittedLiveWatcherMarkets(db.prisma,{dryRun:true,targetGameStatsId:row.id});
     assert.deepEqual(preview.candidateIds,[row.id]);assert.equal(preview.admission,null);
     const first=await recoverCommittedLiveWatcherMarkets(db.prisma,{dryRun:false,targetGameStatsId:row.id});
     assert.equal(first.admission?.createdCount,2);
     const second=await recoverCommittedLiveWatcherMarkets(db.prisma,{dryRun:false,targetGameStatsId:row.id});
     assert.equal(second.admission?.createdCount,0);
     assert.equal(second.admission?.existingCount,2);
   });
   assert.equal(await db.prisma.betWager.count(),0);
   assert.equal(await db.prisma.satchelFundedReservation.count(),0);
   assert.equal(network,0);
 }finally{
   globalThis.fetch=oldFetch;
   if(prior===undefined)delete process.env.BET_AUTOMATION_MODE;else process.env.BET_AUTOMATION_MODE=prior;
   await db.cleanup();
 }
});
