/** End-to-end positive signed origin in a disposable Prisma/PostgreSQL database.
 * The isolated test loader is the ONLY place where the hardcoded source HOLD
 * is replaced. This fixture is not a custody proof, mainnet signer or release.
 */
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {mkdtempSync,realpathSync,writeFileSync,rmSync} from "node:fs";
import test from "node:test";
import type {Prisma} from "../lib/generated/prisma/index.js";
import {startLifecycleDatabase} from "./fixtures/satchel-lifecycle-db.mts";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";
import {admitCommittedLiveWatcherMarkets,admitReviewedFundedWatcherBooks} from "../lib/bets.ts";
import {loadLiveSessionSnapshot} from "../lib/liveSessionSnapshot.ts";
import {runBetAutoShadowWorker} from "../lib/betAutomationShadowWorker.ts";
import {fundedMechaEligibleQuery} from "../lib/warSatchelEligibleOutbox.ts";
import {fundedWatcherOriginSignBytes,type SignedFundedWatcherOrigin} from "../lib/warSatchelFundedWatcherOrigin.ts";

test("signed separate funded Watcher books preserve original preview in real isolated PostgreSQL",{
  skip:process.env.RUN_SATCHEL_REAL_CREDIT_TESTS!=="1"||
       process.env.RUN_SATCHEL_FULL_LIFECYCLE_TESTS!=="1",
  timeout:120000,
},async t=>{
  const db=await startLifecycleDatabase(),root=realpathSync(mkdtempSync("/tmp/aoe2-funding-origin-"));
  const oldFetch=globalThis.fetch;
  const oldW=process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE;
  const oldR=process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE;
  const oldMode=process.env.BET_AUTOMATION_MODE;
  const reviewer=generateKeyPairSync("ed25519"),other=generateKeyPairSync("ed25519");
  const pub=(k:typeof reviewer)=>k.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
  const w=root+"/wager.json",r=root+"/withdrawal.json";
  writeFileSync(w,JSON.stringify({wager_approval_public_key_hex:pub(reviewer)}),{mode:0o600});
  writeFileSync(r,JSON.stringify({approval_public_key_hex:pub(other)}),{mode:0o600});
  process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE=w;
  process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE=r;
  process.env.BET_AUTOMATION_MODE="shadow";
  let network=0;globalThis.fetch=(async()=>{network++;throw Error("NETWORK_OR_SIGNER_FORBIDDEN")}) as typeof fetch;
  try{
    const owner=await db.prisma.user.create({data:{
      uid:"controlled-live-owner",steamId:"76561198000000001",
      inGameName:"LiveOwner",verified:true,verificationLevel:2,
    }});
    await db.prisma.betAutoPreset.create({data:{
      userId:owner.id,enabled:true,winnerStakeWolo:10000,desyncSide:"none",
      desyncStakeWolo:0,untilOut:false,gamesRemaining:5,selfOnly:true,version:1,
    }});
    const evidence=controlledOriginalLiveRow({name:"funded-positive"});
    const game=await db.prisma.gameStats.create({data:{
      userUid:owner.uid,replay_file:"controlled-live-funded-positive.aoe2record",
      original_filename:"controlled-live-funded-positive.aoe2record",
      replayHash:evidence.replayHash,is_final:evidence.is_final,
      parse_source:evidence.parse_source,parse_reason:"watcher_live_snapshot",
      parse_iteration:evidence.parse_iteration,game_version:evidence.game_version,
      game_type:evidence.game_type,createdAt:evidence.createdAt,
      timestamp:evidence.createdAt,played_on:evidence.played_on,
      game_duration:30,winner:evidence.winner,
      players:evidence.players as Prisma.InputJsonValue,
      key_events:evidence.key_events as Prisma.InputJsonValue,
    }});
    const original=await admitCommittedLiveWatcherMarkets(db.prisma,[game.id]);
    assert.equal(original.createdCount,2);
    const previews=await db.prisma.betMarket.findMany({where:{bookPhase:"preview_only"}});
    assert.equal(previews.length,2);
    assert.equal(await db.prisma.betAutoExecution.count(),0,
      "a preview-only market cannot schedule a funded Mecha bet");
    const snapshot=await loadLiveSessionSnapshot(db.prisma);
    const session=snapshot.activeSessions.find(x=>x.sessionKey==="platform:controlled-hd-funded-positive");
    assert.ok(session,"source must be independently committed and canonical");
    assert.ok(session.teamResolution.propositionHash&&session.teamResolution.rosterHash);
    const sec=Math.floor(Date.now()/1000);
    const unsigned:SignedFundedWatcherOrigin={
      version:1,chain_id:"wolo-1",session_key:session.sessionKey,
      proposition_hash:session.teamResolution.propositionHash!,
      roster_hash:session.teamResolution.rosterHash!,
      source_game_stats_id:game.id,nonce:"synthetic-independent-origin-review-0001",
      issued_at:sec-1,expires_at:sec+40,signature:"",
    };
    const approved={...unsigned,signature:sign(null,fundedWatcherOriginSignBytes(unsigned),reviewer.privateKey).toString("base64")};
    await t.test("forged signed proposition and missing authority are rejected with zero economic effects",async()=>{
      await assert.rejects(admitReviewedFundedWatcherBooks(db.prisma,{sourceGameStatsId:game.id,
        signedOrigin:{...approved,nonce:"forged-origin-review-nonce-0002"}}),/independent_signature/);
      assert.equal(await db.prisma.betMarket.count(),2);
      assert.equal(await db.prisma.pendingWoloClaim.count(),0);
    });
    await t.test("authentic but near-expiry signature cannot start either market insert",async()=>{
      const near={...unsigned,nonce:"synthetic-expiry-under-lock-00001",
        expires_at:Math.floor(Date.now()/1000)+6,signature:""};
      const signedNear={...near,signature:sign(null,fundedWatcherOriginSignBytes(near),reviewer.privateKey).toString("base64")};
      assert.ok(signedNear.expires_at>Math.floor(Date.now()/1000),
        "negative approval is genuinely valid at request entrance");
      await assert.rejects(admitReviewedFundedWatcherBooks(db.prisma,{
        sourceGameStatsId:game.id,signedOrigin:signedNear,
      }),/FUNDED_WATCHER_ORIGIN_TOO_CLOSE_TO_EXPIRY/);
      assert.equal(await db.prisma.betMarket.count(),2);
      assert.equal(await db.prisma.betAutoExecution.count(),0);
      assert.equal(await db.prisma.satchelFundedReservation.count(),0);
      assert.equal(await db.prisma.pendingWoloClaim.count(),0);
      assert.equal(network,0,"expired-boundary denial may never invoke signer/network");
    });
    const first=await admitReviewedFundedWatcherBooks(db.prisma,{sourceGameStatsId:game.id,signedOrigin:approved});
    assert.equal(first.created,true);
    assert.ok(first.winnerMarketId>0&&first.desyncMarketId>0);
    assert.notEqual(first.winnerMarketId,first.desyncMarketId);
    const second=await admitReviewedFundedWatcherBooks(db.prisma,{sourceGameStatsId:game.id,signedOrigin:approved});
    assert.equal(second.created,false);
    assert.deepEqual([second.winnerMarketId,second.desyncMarketId],
      [first.winnerMarketId,first.desyncMarketId],"signed replay cannot create another funded pair");
    const all=await db.prisma.betMarket.findMany();
    assert.equal(all.length,4);
    assert.ok(previews.every(p=>all.find(q=>q.id===p.id)?.bookPhase==="preview_only"));
    const funded=all.filter(q=>q.bookPhase==="funded");
    assert.equal(funded.length,2);
    assert.ok(funded.every(q=>!previews.some(p=>p.id===q.id||p.slug===q.slug)));
    assert.equal(funded.find(q=>q.marketType==="desync")?.parentMarketId,first.winnerMarketId);
    assert.ok(funded.every(q=>q.seedLeftWolo===0&&q.seedRightWolo===0));
    const shadow=await runBetAutoShadowWorker(db.prisma,{activeSessions:snapshot.activeSessions});
    assert.ok(shadow.createdCount>=1,"separately authorized winner becomes actual Mecha candidate");
    const execs=await db.prisma.betAutoExecution.findMany();
    assert.ok(execs.some(e=>e.winnerMarketId===first.winnerMarketId));
    assert.ok(execs.every(e=>!previews.some(p=>p.id===e.winnerMarketId)));
    assert.equal(fundedMechaEligibleQuery().where.winnerMarket.bookPhase,"funded");
    assert.equal(await db.prisma.betWager.count(),0);
    assert.equal(await db.prisma.betStakeTicket.count(),0);
    assert.equal(await db.prisma.pendingWoloClaim.count(),0);
    assert.equal(network,0);
  }finally{
    globalThis.fetch=oldFetch;
    if(oldW===undefined)delete process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE;
    else process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE=oldW;
    if(oldR===undefined)delete process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE;
    else process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE=oldR;
    if(oldMode===undefined)delete process.env.BET_AUTOMATION_MODE;
    else process.env.BET_AUTOMATION_MODE=oldMode;
    await db.cleanup();rmSync(root,{recursive:true,force:true});
  }
});
