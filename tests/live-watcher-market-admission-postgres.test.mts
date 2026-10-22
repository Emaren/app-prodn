/** Controlled original-LIVE admission through actual committed PG rows and HD
 * coordinator/market writers. No game client, independent oracle or finance
 * activation is certified; no token, stake, claim or reserve is fabricated. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {setTimeout as sleep} from "node:timers/promises";
import test from "node:test";
import type {Prisma} from "../lib/generated/prisma/index.js";
import {coordinateReplayPostIngest,classifyReplayIngestReceipt} from "../lib/replayPostIngest.ts";
import {admitCommittedLiveWatcherMarkets,recoverCommittedLiveWatcherMarkets} from "../lib/bets.ts";
import {freshBettingCloseReason} from "../lib/betMarketWagerability.ts";
import {startLifecycleDatabase} from "./fixtures/satchel-lifecycle-db.mts";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";

test("private original HD LIVE commits admit canonical markets before result/close without page visits",{
  skip:process.env.RUN_LIVE_MARKET_PG_TESTS!=="1",timeout:120000,
},async t=>{
  const db=await startLifecycleDatabase(),originalFetch=globalThis.fetch,previousMode=process.env.BET_AUTOMATION_MODE;
  let networkCalls=0;
  globalThis.fetch=(async()=>{networkCalls++;throw Error("live admission may not reach a signer or chain");}) as typeof fetch;
  process.env.BET_AUTOMATION_MODE="shadow";
  try{
    const owner=await db.prisma.user.create({data:{uid:"controlled-live-owner",steamId:"76561198000000001",inGameName:"LiveOwner",verified:true,verificationLevel:2}});
    const preset=await db.prisma.betAutoPreset.create({data:{userId:owner.id,enabled:true,winnerStakeWolo:25,
      desyncSide:"none",desyncStakeWolo:0,untilOut:false,gamesRemaining:12,selfOnly:true,version:1}});
    async function persist(name:string,team=false,mode:"Random Map"|"Deathmatch"="Random Map",change:Partial<ReturnType<typeof controlledOriginalLiveRow>>={}){
      const evidence={...controlledOriginalLiveRow({name,team,mode}),...change};
      const row=await db.prisma.gameStats.create({data:{userUid:owner.uid,replay_file:"controlled-original-live-"+name+".aoe2record",
        original_filename:"controlled-original-live-"+name+".aoe2record",replayHash:evidence.replayHash,is_final:evidence.is_final,
        parse_source:evidence.parse_source,parse_reason:"watcher_live_snapshot",parse_iteration:evidence.parse_iteration,
        game_version:evidence.game_version,game_type:evidence.game_type,createdAt:evidence.createdAt,timestamp:evidence.createdAt,
        played_on:evidence.played_on,game_duration:30,winner:evidence.winner,players:evidence.players as Prisma.InputJsonValue,
        key_events:evidence.key_events as Prisma.InputJsonValue}});
      return row;
    }
    async function ingest(row:{id:number;replayHash:string}){
      return coordinateReplayPostIngest({prisma:db.prisma,source:"api_direct",receipts:[classifyReplayIngestReceipt({
        game_id:row.id,replay_hash:row.replayHash,is_final:false,effective_is_final:false,finality_status:"live",
        parse_completed:true,result_resolved:false,result_trusted:false,should_settle:false,
      ...(actualApiReceipt&&row.id===Number(actualApiReceipt.game_id)?actualApiReceipt:{}),
      },true)]});
    }
    let actualApiReceipt:Record<string,unknown>|undefined;
    let invalidHmacGameId:number|undefined;
    const apiSource=process.env.LIVE_ADMISSION_API_SOURCE;
    if(apiSource){
      assert.equal(execFileSync("git",["rev-parse","HEAD"],{cwd:apiSource,encoding:"utf8"}).trim(),"5a2750849e59f0e4551c6e9e0417b59254cff467");
      assert.equal(execFileSync("git",["status","--porcelain"],{cwd:apiSource,encoding:"utf8"}).trim(),"");
      const output=execFileSync(process.env.LIVE_ADMISSION_API_PYTHON??"python3",[
        fileURLToPath(new URL("./fixtures/live-watcher-api-upload.py",import.meta.url)),db.root],
        {env:process.env,encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
      const line=output.split("\n").find(value=>value.startsWith("LIVE_ADMISSION_API_RECEIPT="));assert.ok(line);
      const proof=JSON.parse(line.slice("LIVE_ADMISSION_API_RECEIPT=".length));
      assert.equal(proof.hmac_verified,true);assert.equal(proof.original_capture_recorded,true);
      assert.equal(proof.human_live_capture,false);assert.equal(proof.financial_authority,false);
      actualApiReceipt=proof.private_bridge.receipt;
      invalidHmacGameId=proof.invalid_hmac_game_id;assert.ok(Number.isSafeInteger(invalidHmacGameId));
      assert.equal(proof.private_bridge.source,"api_direct");
    }
    const first=actualApiReceipt?await db.prisma.gameStats.findUniqueOrThrow({where:{id:Number(actualApiReceipt.game_id)}}):await persist("1v1-rm");
    await t.test("four concurrent authenticated post-commit consumers create one book and one preview event",async()=>{
      const reports=await Promise.all(Array.from({length:4},()=>ingest(first)));
      for(const report of reports){assert.equal(report.admission.liveMarkets.succeeded,true);assert.equal(report.financial.markets.requested,false);}
      const markets=await db.prisma.betMarket.findMany({orderBy:{id:"asc"}});
      assert.equal(markets.length,2);const winner=markets.find(m=>m.marketType==="winner")!,desync=markets.find(m=>m.marketType==="desync")!;
      assert.ok(winner);assert.ok(desync);assert.equal(winner.status,"live");assert.equal(winner.linkedGameStatsId,null);
      assert.equal(winner.winnerSide,null);assert.equal(freshBettingCloseReason(winner),null);
      assert.equal(desync.parentMarketId,winner.id);assert.equal(desync.battleId,winner.battleId);
      assert.equal(await db.prisma.betAutoExecution.count(),1);
      assert.equal((await db.prisma.betAutoPreset.findUniqueOrThrow({where:{id:preset.id}})).gamesRemaining,12);
    });
    if(invalidHmacGameId)await t.test("actual API rejects HMAC elevation despite a spoofed account header and valid upload bytes",async()=>{
      const row=await db.prisma.gameStats.findUniqueOrThrow({where:{id:invalidHmacGameId}});
      const report=await ingest(row);assert.equal(report.admission.liveMarkets.createdCount,0);
      assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:"platform:controlled-hd-forged-hmac"}}),0);
    });
    for(const [name,team,mode] of [["team-rm",true,"Random Map"],["1v1-dm",false,"Deathmatch"],["team-dm",true,"Deathmatch"]] as const){
      await t.test(`canonical ${name} LIVE event is wagerable before final evidence`,async()=>{
        const row=await persist(name,team,mode),report=await ingest(row);
        assert.equal(report.admission.liveMarkets.succeeded,true);assert.equal(report.admission.liveMarkets.createdCount,2);
        assert.equal(report.financial.markets.requested,false);assert.equal(report.financial.tournament.requested,false);
      });
    }
    await t.test("forged receipt flags cannot elevate stale, DE or unverified persisted capture",async()=>{
      const before=await db.prisma.betMarket.count();
      const unverified=controlledOriginalLiveRow({name:"spoof"});
      const events=unverified.key_events as Record<string,unknown>,upload=events.watcher_upload as Record<string,unknown>;
      for(const [name,change] of [
        ["stale",{played_on:new Date(Date.now()-13*60_000)}], ["de",{game_version:"Version.DE"}],
        ["spoof",{key_events:{...events,watcher_upload:{...upload,provenance_signature_verified:false}}}],
        ["custom",{game_type:"Regicide"}],
      ] as const){
        const row=await persist(name,false,"Random Map",change),report=await ingest(row);
        assert.equal(report.admission.liveMarkets.succeeded,true);assert.equal(report.admission.liveMarkets.createdCount,0);
      }
      assert.equal(await db.prisma.betMarket.count(),before);
    });
    await t.test("restart replay and delayed LIVE observations cannot reopen a closed or voided book",async()=>{
      const markets=await db.prisma.betMarket.findMany({where:{linkedSessionKey:"platform:controlled-hd-1v1-rm"}});
      assert.equal(markets.length,2);
      await db.prisma.betMarket.updateMany({where:{id:{in:markets.map(m=>m.id)}},data:{status:"closing",closeAt:new Date(Date.now()-1)}});
      await admitCommittedLiveWatcherMarkets(db.prisma,[first.id]);
      assert.ok((await db.prisma.betMarket.findMany({where:{id:{in:markets.map(m=>m.id)}}})).every(m=>m.status==="closing"));
      await db.prisma.betMarket.updateMany({where:{id:{in:markets.map(m=>m.id)}},data:{status:"voided",voidedAt:new Date(),refundStatus:"queued"}});
      await ingest(first);
      assert.ok((await db.prisma.betMarket.findMany({where:{id:{in:markets.map(m=>m.id)}}})).every(m=>m.status==="voided"&&m.refundStatus==="queued"));
    });
    await t.test("terminal source committed while admission waits cannot create a new book",async()=>{
      const row=await persist("terminal-during-wait");
      await db.sql.query("BEGIN");
      await db.sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["platform:controlled-hd-terminal-during-wait"]);
      const pending=ingest(row);
      try{
        let blocked=false;
        for(let attempt=0;attempt<100;attempt++){
          const waiting=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event='advisory' AND pid<>pg_backend_pid()");
          if(Number(waiting.rows[0].count)>0){blocked=true;break;}
          await sleep(10);
        }
        assert.equal(blocked,true,"actual canonical advisory wait must precede terminal update");
        await db.prisma.gameStats.update({where:{id:row.id},data:{is_final:true,parse_source:"watcher_final",winner:"LiveOwner"}});
      }finally{await db.sql.query("COMMIT");}
      const report=await pending;
      assert.equal(report.admission.liveMarkets.succeeded,true);
      assert.equal(report.admission.liveMarkets.createdCount,0);
      assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:"platform:controlled-hd-terminal-during-wait"}}),0);
      assert.equal(await db.prisma.betAutoExecution.count(),4);
    });
    await t.test("a separately committed final artifact wins over a waiting LIVE seed",async()=>{
      const row=await persist("final-artifact-during-wait");
      await db.sql.query("BEGIN");
      await db.sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["platform:controlled-hd-final-artifact-during-wait"]);
      const pending=ingest(row);
      try{
        let blocked=false;
        for(let attempt=0;attempt<100;attempt++){
          const waiting=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event='advisory' AND pid<>pg_backend_pid()");
          if(Number(waiting.rows[0].count)>0){blocked=true;break;}
          await sleep(10);
        }
        assert.equal(blocked,true);
        const {id:ignoredId,...data}=row;assert.ok(ignoredId);
        await db.prisma.gameStats.create({data:{...data,replayHash:"f".repeat(64),is_final:true,parse_source:"watcher_final",
          winner:"LiveOwner",players:[{name:"LiveOwner",steamId:"76561198000000001",teamId:0,winner:true},
            {name:"LiveOpponent",steamId:"76561198000000002",teamId:1,winner:false}],
          key_events:{...(row.key_events as Record<string,Prisma.InputJsonValue>),completed:true,postgame_available:true}}});
      }finally{await db.sql.query("COMMIT");}
      const report=await pending;assert.equal(report.admission.liveMarkets.createdCount,0);
      assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:"platform:controlled-hd-final-artifact-during-wait"}}),0);
    });
    await t.test("fresh LIVE authority expiring during the canonical wait cannot create a book",async()=>{
      const row=await persist("stale-during-wait",false,"Random Map",{played_on:new Date(Date.now()-12*60_000+1200)});
      await db.sql.query("BEGIN");
      await db.sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["platform:controlled-hd-stale-during-wait"]);
      const pending=ingest(row);
      try{
        let blocked=false;
        for(let attempt=0;attempt<100;attempt++){
          const waiting=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event='advisory' AND pid<>pg_backend_pid()");
          if(Number(waiting.rows[0].count)>0){blocked=true;break;}
          await sleep(10);
        }
        assert.equal(blocked,true);
        await db.sql.query("SELECT pg_sleep(1.3)");
      }finally{await db.sql.query("COMMIT");}
      const report=await pending;assert.equal(report.admission.liveMarkets.createdCount,0);
      assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:"platform:controlled-hd-stale-during-wait"}}),0);
    });
    assert.equal(await db.prisma.betMarket.count(),8);assert.equal(await db.prisma.betAutoExecution.count(),4);
    await t.test("existing private recovery replays a durable LIVE commit lost before notification; dry run writes nothing",async()=>{
      const row=await persist("lost-notification");
      const plan=await recoverCommittedLiveWatcherMarkets(db.prisma,{dryRun:true,targetGameStatsId:row.id});
      assert.deepEqual(plan.candidateIds,[row.id]);assert.equal(plan.admission,null);
      assert.equal(await db.prisma.betMarket.count(),8);assert.equal(await db.prisma.betAutoExecution.count(),4);
      const first=await recoverCommittedLiveWatcherMarkets(db.prisma,{dryRun:false,targetGameStatsId:row.id});
      assert.equal(first.admission?.createdCount,2);
      const second=await recoverCommittedLiveWatcherMarkets(db.prisma,{dryRun:false,targetGameStatsId:row.id});
      assert.equal(second.admission?.createdCount,0);assert.equal(second.admission?.existingCount,2);
      assert.equal(await db.prisma.betMarket.count(),10);assert.equal(await db.prisma.betAutoExecution.count(),5);
    });
    assert.equal(await db.prisma.betWager.count(),0);assert.equal(await db.prisma.satchelFundedReservation.count(),0);
    assert.equal(await db.prisma.pendingWoloClaim.count(),0);assert.equal(networkCalls,0);
    assert.match(readFileSync(new URL("../lib/warSatchelFinancialBridgeHold.ts",import.meta.url),"utf8"),/SATCHEL_FINANCIAL_BRIDGE_READY = false as const/);
  }finally{globalThis.fetch=originalFetch;if(previousMode===undefined)delete process.env.BET_AUTOMATION_MODE;else process.env.BET_AUTOMATION_MODE=previousMode;await db.cleanup();}
});
