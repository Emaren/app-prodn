/** Controlled original-LIVE admission through actual committed PG rows and HD
 * coordinator/market writers. No game client, independent oracle or finance
 * activation is certified. Obligation sentinels are explicitly synthetic;
 * no real token movement, historical disposition or custody is inferred. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {setTimeout as sleep} from "node:timers/promises";
import test from "node:test";
import type {Prisma} from "../lib/generated/prisma/index.js";
import {coordinateReplayPostIngest,classifyReplayIngestReceipt} from "../lib/replayPostIngest.ts";
import {admitCommittedLiveWatcherMarkets,recoverCommittedLiveWatcherMarkets,buildWatcherMarketSlugForSessionKey} from "../lib/bets.ts";
import {loadLiveSessionSnapshot} from "../lib/liveSessionSnapshot.ts";
import {canonicalBattleIdentityKey} from "../lib/battleIdentity.ts";
import {readBetAutomationRuntime} from "../lib/betAutomation.ts";
import {freshBettingCloseReason,buildFreshBetMarketWriteWhere} from "../lib/betMarketWagerability.ts";
import {loadBetMarketPreflightContext,assertBetMarketPreflight} from "../lib/betWagering.ts";
import {createFounderBonus} from "../lib/betFounderBonuses.ts";
import {retryPendingClaimSettlement} from "../lib/adminWoloClaims.ts";
import {startLiveWatcherDatabase} from "./fixtures/live-watcher-db.mts";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";

test("private original HD LIVE commits admit canonical markets before result/close without page visits",{
  skip:process.env.RUN_LIVE_MARKET_PG_TESTS!=="1",timeout:120000,
},async t=>{
  const db=await startLiveWatcherDatabase(),originalFetch=globalThis.fetch,previousMode=process.env.BET_AUTOMATION_MODE;
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
      assert.equal(winner.winnerSide,null);
      assert.equal(winner.bookPhase,"preview_only");
      assert.equal(desync.bookPhase,"preview_only");
      assert.equal(freshBettingCloseReason(winner),"market_not_open");
      assert.equal(freshBettingCloseReason(desync),"market_not_open");
      assert.ok(winner.battleId !== null,"public identity is attached atomically to admitted preview");
      const context=await loadBetMarketPreflightContext(db.prisma,{marketId:winner.id,side:"left"});
      assert.throws(()=>assertBetMarketPreflight(context,{
        viewer:{id:owner.id,inGameName:owner.inGameName,steamPersonaName:null},side:"left",
      }),/preview-only battle/);
      const forbiddenStakeWrite=await db.prisma.betMarket.updateMany({
        where:{id:winner.id,...buildFreshBetMarketWriteWhere()},
        data:{bettingLockedAt:new Date()},
      });
      assert.equal(forbiddenStakeWrite.count,0,"final financial write cannot lock preview book");
      assert.equal(await db.prisma.betStakeIntent.count(),0);
      assert.equal(await db.prisma.betWager.count(),0);
      await assert.rejects(
        () => createFounderBonus(db.prisma,{
          marketId:winner.id,bonusType:"participants",amountWolo:100,
          createdByUserId:owner.id,requestId:"no-founder-on-preview",
        }),
        /Preview-only battles cannot receive WOLO founder bonuses/,
      );
      assert.equal(await db.prisma.betMarketFounderBonus.count({where:{marketId:winner.id}}),0);
      const fakeClaim=await db.prisma.pendingWoloClaim.create({data:{
        normalizedPlayerName:"preview-only-guard-probe",
        displayPlayerName:"Preview Only Guard Probe",
        amountWolo:1,claimKind:"bet_refund",claimGroupKey:"preview-refusal",
        status:"pending",sourceMarketId:winner.id,
      }});
      const refusedRetry=await retryPendingClaimSettlement(db.prisma,fakeClaim.id);
      assert.equal(refusedRetry.outcome,"skipped");
      assert.equal(refusedRetry.outcome==="skipped"?refusedRetry.reason:null,"preview_only_market");
      const afterRetry=await db.prisma.pendingWoloClaim.findUniqueOrThrow({where:{id:fakeClaim.id}});
      assert.equal(afterRetry.status,"pending");
      assert.equal(afterRetry.payoutTxHash,null);
      assert.equal(afterRetry.payoutAttemptedAt,null);
      await db.prisma.pendingWoloClaim.delete({where:{id:fakeClaim.id}});
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
      await t.test(`canonical ${name} LIVE preview is visible but not fundable before final evidence`,async()=>{
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
          await db.sql.query("SELECT pg_stat_clear_snapshot()");
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
          await db.sql.query("SELECT pg_stat_clear_snapshot()");
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
          await db.sql.query("SELECT pg_stat_clear_snapshot()");
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
    await t.test("new terminal INSERT cannot overtake the guarded source-read/market-write transaction",async()=>{
      const row=await persist("final-insert-after-source-read");
      await db.sql.query(`CREATE FUNCTION fixture_wait_before_live_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.linked_session_key='platform:controlled-hd-final-insert-after-source-read' THEN
          PERFORM pg_advisory_xact_lock(hashtextextended('fixture-live-final-insert-race',0));
        END IF; RETURN NEW; END $$`);
      await db.sql.query("CREATE TRIGGER fixture_wait_before_live_insert BEFORE INSERT ON bet_markets FOR EACH ROW EXECUTE FUNCTION fixture_wait_before_live_insert()");
      await db.sql.query("BEGIN");
      await db.sql.query("SELECT pg_advisory_xact_lock(hashtextextended('fixture-live-final-insert-race',0))");
      const pending=ingest(row);
      let finalCommitted=false,final:Promise<unknown>|undefined;
      try{
        let atWrite=false;
        for(let attempt=0;attempt<100;attempt++){
          await db.sql.query("SELECT pg_stat_clear_snapshot()");
          const waiting=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event='advisory' AND query ILIKE '%INSERT INTO%bet_markets%'");
          if(Number(waiting.rows[0].count)>0){atWrite=true;break;}
          await sleep(10);
        }
        assert.equal(atWrite,true,"real market INSERT must wait AFTER canonical source read");
        final=db.prisma.gameStats.create({data:{userUid:owner.uid,replay_file:"controlled-racing-final.aoe2record",
          original_filename:row.original_filename,replayHash:"e".repeat(64),is_final:true,parse_source:"watcher_final",parse_iteration:1,
          game_version:"Version.HD",game_type:"Random Map",winner:"LiveOwner",played_on:row.played_on,
          key_events:{...(row.key_events as Record<string,Prisma.InputJsonValue>),completed:true,postgame_available:true}}})
          .then(value=>{finalCommitted=true;return value;});
        let sourceBlocked=false;
        for(let attempt=0;attempt<100;attempt++){
          await db.sql.query("SELECT pg_stat_clear_snapshot()");
          const waiting=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE wait_event='relation' AND query ILIKE '%INSERT INTO%game_stats%'");
          if(Number(waiting.rows[0].count)>0){sourceBlocked=true;break;}
          if(finalCommitted)break;
          await sleep(10);
        }
        assert.equal(sourceBlocked,true,"new terminal artifact must serialize behind the brief source-table SHARE lock");
        assert.equal(finalCommitted,false);
      }finally{await db.sql.query("COMMIT");}
      try{
        const report=await pending;await final;
        assert.equal(report.admission.liveMarkets.succeeded,true);assert.ok(report.admission.liveMarkets.createdCount>=1);
        assert.equal(finalCommitted,true);
      }finally{
        await db.sql.query("DROP TRIGGER fixture_wait_before_live_insert ON bet_markets");
        await db.sql.query("DROP FUNCTION fixture_wait_before_live_insert()");
      }
    });
    await t.test("busy source writers cause a bounded fail-closed retry without creating books",async()=>{
      const row=await persist("source-writer-busy"),before=await db.prisma.betMarket.count();
      await db.sql.query("BEGIN");await db.sql.query("LOCK TABLE game_stats IN ROW EXCLUSIVE MODE");
      let report:Awaited<ReturnType<typeof ingest>>;
      const started=Date.now();
      try{report=await ingest(row);}finally{await db.sql.query("COMMIT");}
      assert.equal(report.admission.liveMarkets.succeeded,false);
      assert.match(report.admission.liveMarkets.error??"",/lock timeout|transaction/i);
      assert.ok(Date.now()-started<5000,"contention must not hold up ingestion indefinitely");
      assert.equal(await db.prisma.betMarket.count(),before);
      // No sibling seed transaction may commit after the timeout was returned.
      await sleep(80);
      assert.equal(await db.prisma.betMarket.count(),before);
      const retry=await ingest(row);assert.equal(retry.admission.liveMarkets.createdCount,2);
      const pair=await db.prisma.betMarket.findMany({where:{linkedSessionKey:"platform:controlled-hd-source-writer-busy"}});
      assert.equal(pair.length,2,"successful retry must create the full winner/desync pair");
      assert.equal(pair.filter(m=>m.marketType==="winner").length,1);
    });
    await t.test("terminal market writes cannot be overwritten by a concurrent LIVE redelivery",async()=>{
      const row=await persist("terminal-market-write");
      assert.equal((await ingest(row)).admission.liveMarkets.createdCount,2);
      const identity="platform:controlled-hd-terminal-market-write";
      await db.sql.query("BEGIN");
      await db.sql.query("SELECT id FROM bet_markets WHERE linked_session_key=$1 ORDER BY id FOR UPDATE",[identity]);
      const pending=ingest(row);
      try{
        let waiting=false;
        for(let attempt=0;attempt<70;attempt++){
          await db.sql.query("SELECT pg_stat_clear_snapshot()");
          const observed=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ILIKE '%bet_markets%'");
          if(Number(observed.rows[0].count)>0){waiting=true;break;}
          await sleep(5);
        }
        assert.equal(waiting,true,"LIVE writer must wait on the existing market's terminal transaction");
        await db.sql.query("UPDATE bet_markets SET status='voided', voided_at=clock_timestamp(), refund_status='queued' WHERE linked_session_key=$1",[identity]);
      }finally{await db.sql.query("COMMIT");}
      const report=await pending;
      assert.equal(report.admission.liveMarkets.succeeded,true);
      assert.equal(report.admission.liveMarkets.createdCount,0);
      assert.equal(report.admission.liveMarkets.existingCount,0);
      const markets=await db.prisma.betMarket.findMany({where:{linkedSessionKey:identity}});
      assert.equal(markets.length,2);
      assert.ok(markets.every(market=>market.status==="voided"&&market.refundStatus==="queued"));
    });
    // Synthetic obligations exercise noninterference; these are NOT observations
    // or dispositions of the real historical #889 / accepted-100-WOLO records.
    async function obligationSentinels(marketId:number,claimId:number,amountWolo:number){
      const market=await db.prisma.betMarket.update({where:{id:marketId},data:{refundStatus:"queued",
        settlementStatus:"accepted",settlementDetail:"fixture-only unresolved request",firstStakeAcceptedAt:new Date(Date.now()-5000)}});
      const wallet="wolo1fixtureonlyneverfunded000000000000000000";
      const intent=await db.prisma.betStakeIntent.create({data:{marketId,userId:owner.id,side:"left",amountWolo,
        propositionHash:market.propositionHash,walletAddress:wallet,status:"broadcast_submitted",broadcastSubmittedAt:new Date()}});
      const ticket=await db.prisma.betStakeTicket.create({data:{userId:owner.id,clientRequestId:"fixture-obligation-"+claimId,
        totalAmountWolo:amountWolo,propositionSetHash:market.propositionHash??"a".repeat(64),walletAddress:wallet,
        status:"broadcast_submitted",broadcastSubmittedAt:new Date()}});
      const leg=await db.prisma.betStakeLeg.create({data:{ticketId:ticket.id,marketId,legRole:"winner",side:"left",amountWolo,
        propositionHash:market.propositionHash??"a".repeat(64)}});
      const wager=await db.prisma.betWager.create({data:{marketId,userId:owner.id,stakeIntentId:intent.id,stakeLegId:leg.id,
        side:"left",amountWolo,status:"active",executionMode:"escrow",stakeWalletAddress:wallet}});
      const marketWallet=await db.prisma.betMarketWallet.create({data:{marketId,userId:owner.id,walletAddress:wallet,side:"left"}});
      const bonus=await db.prisma.betMarketFounderBonus.create({data:{marketId,bonusType:"founders_win",totalAmountWolo:300,
        status:"pending",createdByUserId:owner.id,requestId:"fixture-bonus-"+claimId}});
      const claim=await db.prisma.pendingWoloClaim.create({data:{id:claimId,normalizedPlayerName:"fixture-owner-"+claimId,
        displayPlayerName:"Synthetic obligation sentinel",amountWolo,claimKind:claimId===889?"founders_win":"bet_refund",
        claimGroupKey:"fixture-only-"+claimId,sourceMarketId:marketId,sourceFounderBonusId:bonus.id,status:"pending",
        payoutAttemptedAt:new Date(),payoutTxHash:null,errorState:"fixture UNKNOWN; never retry or infer chain outcome"}});
      const snapshot=async()=>({
        market:await db.prisma.betMarket.findUniqueOrThrow({where:{id:marketId}}),
        claim:await db.prisma.pendingWoloClaim.findUniqueOrThrow({where:{id:claim.id}}),
        bonus:await db.prisma.betMarketFounderBonus.findUniqueOrThrow({where:{id:bonus.id}}),
        wager:await db.prisma.betWager.findUniqueOrThrow({where:{id:wager.id}}),
        wallet:await db.prisma.betMarketWallet.findUniqueOrThrow({where:{id:marketWallet.id}}),
        intent:await db.prisma.betStakeIntent.findUniqueOrThrow({where:{id:intent.id}}),
        ticket:await db.prisma.betStakeTicket.findUniqueOrThrow({where:{id:ticket.id}}),
        leg:await db.prisma.betStakeLeg.findUniqueOrThrow({where:{id:leg.id}}),
      });
      const before=await snapshot();
      return {before,snapshot,cleanup:async()=>{
        await db.prisma.pendingWoloClaim.delete({where:{id:claim.id}});
        await db.prisma.betMarketFounderBonus.delete({where:{id:bonus.id}});
        await db.prisma.betWager.delete({where:{id:wager.id}});
        await db.prisma.betMarketWallet.delete({where:{id:marketWallet.id}});
        await db.prisma.betStakeIntent.delete({where:{id:intent.id}});
        await db.prisma.betStakeTicket.delete({where:{id:ticket.id}});
      }};
    }
    async function sourceIdentity(name:string){
      const canonical="platform:controlled-hd-"+name;
      // A real alias requires an earlier fallback observation of the SAME
      // replay/watcher context before a platform ID becomes available.
      const origin=await db.prisma.gameStats.findFirstOrThrow({where:{replay_file:"controlled-original-live-"+name+".aoe2record"},orderBy:{id:"asc"}});
      const fallbackEvents=JSON.parse(JSON.stringify(origin.key_events)) as Record<string,unknown>;
      delete fallbackEvents.platform_match_id;
      const fallbackHash=controlledOriginalLiveRow({name:name+"-earlier-fallback"}).replayHash;
      fallbackEvents.watcher_upload={...(fallbackEvents.watcher_upload as Record<string,unknown>),server_sha256:fallbackHash,client_sha256:fallbackHash};
      await persist(name,false,"Random Map",{createdAt:new Date(origin.createdAt.getTime()-500),
        played_on:origin.played_on,key_events:fallbackEvents,replayHash:fallbackHash});
      const session=(await loadLiveSessionSnapshot(db.prisma)).activeSessions.find(value=>value.sessionKey===canonical);
      assert.ok(session);const alias=session.identityAliases?.find(value=>value!==canonical);assert.ok(alias);
      return {canonical,alias,session};
    }
    async function aliasMarket(alias:string){
      const template=await db.prisma.betMarket.findFirstOrThrow({where:{marketType:"winner",status:"live"}});
      const {id,createdAt,updatedAt,...data}=template;void id;void createdAt;void updatedAt;
      return db.prisma.betMarket.create({data:{...data,battleId:null,parentMarketId:null,phaseBookKey:null,
        linkedSessionKey:alias,slug:buildWatcherMarketSlugForSessionKey(alias),scheduledMatchId:null,
        closeAt:new Date(Date.now()+600000),firstStakeAcceptedAt:null,refundStatus:null,settlementStatus:null}});
    }
    await t.test("occupied fallback alias refuses the entire canonical preview family without reattributing obligations",async()=>{
      const row=await persist("occupied-alias"),identity=await sourceIdentity("occupied-alias");
      const alias=await aliasMarket(identity.alias),sentinels=await obligationSentinels(alias.id,889,300);
      try{
        const marketCount=await db.prisma.betMarket.count(),previews=await db.prisma.betAutoExecution.count();
        const identitiesBefore=await db.prisma.battleIdentity.findMany({orderBy:{id:"asc"}});
        const report=await ingest(row);
        assert.equal(report.admission.liveMarkets.succeeded,true);
        assert.equal(report.admission.liveMarkets.createdCount,0);assert.equal(report.admission.liveMarkets.existingCount,0);
        assert.equal(await db.prisma.betMarket.count(),marketCount);
        assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:identity.canonical}}),0);
        assert.equal(await db.prisma.betAutoExecution.count(),previews);
        assert.deepEqual(await sentinels.snapshot(),sentinels.before);
        assert.deepEqual(await db.prisma.battleIdentity.findMany({orderBy:{id:"asc"}}),identitiesBefore);
      }finally{await sentinels.cleanup();await db.prisma.betMarket.delete({where:{id:alias.id}});}
    });
    await t.test("redelivery reads compatible canonical books without updating financial obligations or child links",async()=>{
      const row=await persist("occupied-canonical");assert.equal((await ingest(row)).admission.liveMarkets.createdCount,2);
      const identity=await sourceIdentity("occupied-canonical"),pair=await db.prisma.betMarket.findMany({where:{linkedSessionKey:identity.canonical}});
      const winner=pair.find(value=>value.marketType==="winner")!,child=pair.find(value=>value.marketType==="desync")!;
      assert.ok(winner);assert.ok(child);
      const sentinels=await obligationSentinels(winner.id,8477,100);
      // Existing child attribution is a read-only obligation, even if a normal
      // reconciliation lane would later repair its missing parent metadata.
      await db.prisma.betMarket.update({where:{id:child.id},data:{parentMarketId:null,title:"Existing child title must survive"}});
      const childBefore=await db.prisma.betMarket.findUniqueOrThrow({where:{id:child.id}});
      try{
        const count=await db.prisma.betMarket.count(),report=await ingest(row);
        assert.equal(report.admission.liveMarkets.createdCount,0);assert.equal(report.admission.liveMarkets.existingCount,2);
        assert.equal(await db.prisma.betMarket.count(),count);
        assert.deepEqual(await sentinels.snapshot(),sentinels.before);
        assert.deepEqual(await db.prisma.betMarket.findUniqueOrThrow({where:{id:child.id}}),childBefore);
      }finally{await sentinels.cleanup();}
    });
    await t.test("alias admission waits for the existing promotion lock and observes a newly committed occupied alias",async()=>{
      const row=await persist("concurrent-occupied-alias"),identity=await sourceIdentity("concurrent-occupied-alias");
      const key=canonicalBattleIdentityKey(identity.alias);assert.ok(key);
      const before=await db.prisma.betMarket.count(),previews=await db.prisma.betAutoExecution.count();
      await db.sql.query("BEGIN");await db.sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[key]);
      const pending=ingest(row);let alias:Awaited<ReturnType<typeof aliasMarket>>|undefined;
      try{
        let waiting=false;
        for(let attempt=0;attempt<90;attempt++){
          await db.sql.query("SELECT pg_stat_clear_snapshot()");
          const blocked=await db.sql.query("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ILIKE '%pg_advisory_xact_lock%'");
          if(Number(blocked.rows[0].count)>0){waiting=true;break;}await sleep(5);
        }
        assert.equal(waiting,true,"LIVE metadata must share canonical/alias advisory locks with financial promotion");
        alias=await aliasMarket(identity.alias);
      }finally{await db.sql.query("COMMIT");}
      try{
        const report=await pending;assert.equal(report.admission.liveMarkets.succeeded,true);
        assert.equal(report.admission.liveMarkets.createdCount,0);assert.equal(report.admission.liveMarkets.existingCount,0);
        assert.equal(await db.prisma.betMarket.count(),before+1);
        assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:identity.canonical}}),0);
        assert.equal(await db.prisma.betAutoExecution.count(),previews);
      }finally{if(alias)await db.prisma.betMarket.delete({where:{id:alias.id}});}
    });
    await t.test("terminal canonical winner with no child refuses the complete family without creating a desync book",async()=>{
      const row=await persist("terminal-parent-missing-child"),canonical="platform:controlled-hd-terminal-parent-missing-child";
      const winner=await aliasMarket(canonical);
      await db.prisma.betMarket.update({where:{id:winner.id},data:{status:"voided",refundStatus:"queued",settledAt:new Date(),voidedAt:new Date()}});
      const before=await db.prisma.betMarket.findUniqueOrThrow({where:{id:winner.id}});
      const count=await db.prisma.betMarket.count(),previews=await db.prisma.betAutoExecution.count();
      const report=await ingest(row);
      assert.equal(report.admission.liveMarkets.succeeded,true);
      assert.equal(report.admission.liveMarkets.createdCount,0);assert.equal(report.admission.liveMarkets.existingCount,0);
      assert.equal(await db.prisma.betMarket.count(),count);
      assert.deepEqual(await db.prisma.betMarket.findUniqueOrThrow({where:{id:winner.id}}),before);
      assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:canonical,marketType:"desync"}}),0);
      assert.equal(await db.prisma.betAutoExecution.count(),previews);
    });
    await t.test("an unrelated canonical slug owner with no child cannot admit or create any part of a preview family",async()=>{
      const row=await persist("unrelated-parent-missing-child"),canonical="platform:controlled-hd-unrelated-parent-missing-child";
      const occupied=await aliasMarket(canonical);
      await db.prisma.betMarket.update({where:{id:occupied.id},data:{linkedSessionKey:"platform:unrelated-existing-owner",marketType:"desync"}});
      const before=await db.prisma.betMarket.findUniqueOrThrow({where:{id:occupied.id}});
      const count=await db.prisma.betMarket.count(),previews=await db.prisma.betAutoExecution.count();
      const report=await ingest(row);
      assert.equal(report.admission.liveMarkets.succeeded,true);
      assert.equal(report.admission.liveMarkets.createdCount,0);assert.equal(report.admission.liveMarkets.existingCount,0);
      assert.equal(await db.prisma.betMarket.count(),count);
      assert.deepEqual(await db.prisma.betMarket.findUniqueOrThrow({where:{id:occupied.id}}),before);
      assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:canonical}}),0);
      assert.equal(await db.prisma.betAutoExecution.count(),previews);
    });
    await t.test("existing parent close clock expiring during child INSERT rolls back the complete preview family",async()=>{
      const row=await persist("parent-clock-during-child"),canonical="platform:controlled-hd-parent-clock-during-child";
      assert.equal((await ingest(row)).admission.liveMarkets.createdCount,2);
      const pair=await db.prisma.betMarket.findMany({where:{linkedSessionKey:canonical}});
      const parent=pair.find(value=>value.marketType==="winner")!,child=pair.find(value=>value.marketType==="desync")!;
      assert.ok(parent);assert.ok(child);
      await db.prisma.betMarket.delete({where:{id:child.id}});
      const sentinels=await obligationSentinels(parent.id,8477,100);
      await db.prisma.betMarket.update({where:{id:parent.id},data:{closeAt:new Date(Date.now()+1500)}});
      const before=await sentinels.snapshot(),count=await db.prisma.betMarket.count(),previews=await db.prisma.betAutoExecution.count();
      const identitiesBefore=await db.prisma.battleIdentity.findMany({orderBy:{id:"asc"}});
      await db.sql.query(`CREATE FUNCTION fixture_expire_parent_during_child() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.linked_session_key='platform:controlled-hd-parent-clock-during-child' AND NEW.market_type='desync' THEN
          PERFORM pg_sleep(1.8);
        END IF;
        RETURN NEW;
      END $$; CREATE TRIGGER fixture_expire_parent_during_child BEFORE INSERT ON bet_markets
        FOR EACH ROW EXECUTE FUNCTION fixture_expire_parent_during_child()`);
      try{
        const report=await ingest(row);
        assert.equal(report.admission.liveMarkets.succeeded,false);
        assert.match(report.admission.liveMarkets.error??"",/LIVE_MARKET_ADMISSION_EXISTING_BOOK_CLOSED_BEFORE_COMMIT/);
        assert.equal(await db.prisma.betMarket.count(),count);
        assert.equal(await db.prisma.betMarket.count({where:{linkedSessionKey:canonical,marketType:"desync"}}),0);
        assert.deepEqual(await sentinels.snapshot(),before);
        assert.deepEqual(await db.prisma.battleIdentity.findMany({orderBy:{id:"asc"}}),identitiesBefore);
        assert.equal(await db.prisma.betAutoExecution.count(),previews);
      }finally{
        await db.sql.query("DROP TRIGGER fixture_expire_parent_during_child ON bet_markets; DROP FUNCTION fixture_expire_parent_during_child()");
        await sentinels.cleanup();
      }
    });
    assert.equal(await db.prisma.betWager.count(),0);assert.equal((await db.sql.query("SELECT to_regclass('public.war_satchel_funded_reservations') AS name")).rows[0].name,null);
    assert.equal(await db.prisma.pendingWoloClaim.count(),0);assert.equal(networkCalls,0);
    assert.equal(readBetAutomationRuntime({BET_AUTOMATION_MODE:"live",WOLO_BET_CUSTODY_CAPABILITY:"bet-custody-v1",
      WOLO_BET_CUSTODY_URL:"http://127.0.0.1:8092",WOLO_SETTLEMENT_AUTH_TOKEN:"fixture-only"}).executionReady,false);
  }finally{globalThis.fetch=originalFetch;if(previousMode===undefined)delete process.env.BET_AUTOMATION_MODE;else process.env.BET_AUTOMATION_MODE=previousMode;await db.cleanup();}
});
