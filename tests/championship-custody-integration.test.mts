import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/index.js";
import { ensureChampionshipTeamTributePayouts, executeAllocatedTrophyPayout, getChampionshipCustody, transitionChampionshipCustody } from "../lib/trophies/championship.ts";

import { executeTrophyAdminAction } from "../lib/trophies/actions.ts";

const uri = process.env.CHAMPIONSHIP_TEST_DATABASE_URL;
const enabled = Boolean(uri);
if (uri) {
  const target = new URL(uri);
  if (!["127.0.0.1","localhost"].includes(target.hostname) || target.port !== "5432" || target.pathname !== "/aoe2_championship_v1_qa_20260930") throw new Error("Championship integration tests require the explicit isolated local QA database.");
}

test("real PostgreSQL custody transition, exact roster, payout lineage and concurrent CAS",{skip:!enabled},async t=>{
  const pool = new Pool({connectionString:uri});
  const prisma = new PrismaClient({adapter:new PrismaPg(pool)});
  const prefix=`core_${randomUUID().slice(0,8)}`;
  const now=new Date("2026-09-30T12:00:00.000Z");
  const users = await Promise.all(Array.from({length:10},(_,i)=>prisma.user.create({data:{uid:`${prefix}_${i}`,inGameName:`${prefix} Warrior ${i}`,representedCountry:"Canada",steamId:`${Date.now()}${i}`,walletAddress:`wolo1${prefix.replaceAll("_","")}seat${i}`}})));
  const fixture = async()=>prisma.trophy.create({data:{trophyId:`${prefix}_${randomUUID().slice(0,8)}`,displayName:"QA Canada Championship",kind:"belt",family:"national",eligibleNationality:"Canada",status:"held",currentHolderUserId:users[0].id,currentHolderDisplayName:users[0].inGameName,currentHolderWoloAddress:users[0].walletAddress,currentBountyWolo:5,bountyGrowthWolo:2,holderSince:new Date("2026-09-28T12:00:00.000Z"),chainStatus:"app_only"}});
  try {
    await t.test("outgoing bounty freezes once, new reign starts at transfer, repeated request is idempotent",async()=>{
      const trophy=await fixture(), custody=await getChampionshipCustody(prisma,trophy);
      const input={trophyId:trophy.id,requestKey:`${prefix}:solo`,expectedEpoch:custody.epoch,expectedRosterUserIds:[users[0].id],nextRosterUserIds:[users[1].id],reason:"match" as const,now};
      const first=await prisma.$transaction(tx=>transitionChampionshipCustody(tx,input));
      assert.equal(first.frozenBountyWolo,9); assert.equal(first.changed,true);
      const second=await prisma.$transaction(tx=>transitionChampionshipCustody(tx,input));
      assert.equal(second.idempotent,true); assert.equal(second.groupId,first.groupId);
      assert.equal(await prisma.trophyPayout.count({where:{trophyId:trophy.id,payoutKind:"dethrone_bounty"}}),1);
      const live=await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}});
      assert.equal(live.currentHolderUserId,users[1].id); assert.equal(live.holderSince?.toISOString(),now.toISOString()); assert.equal(live.currentBountyWolo,0);
      await assert.rejects(prisma.$transaction(tx=>transitionChampionshipCustody(tx,{...input,nextRosterUserIds:[users[2].id]})),/request identity was reused/i);
      for(const changed of [{expectedRosterUserIds:[]},{note:"Different financial audit reason"},{eligibilityCandidates:[{userId:users[1].id,representedCountry:"Canada",rmRating:1800}]}]) await assert.rejects(prisma.$transaction(tx=>transitionChampionshipCustody(tx,{...input,...changed})),/request identity was reused/i);
      await assert.rejects(prisma.$transaction(tx=>transitionChampionshipCustody(tx,{...input,requestKey:`${prefix}:stale`})),/custody changed/i);
    });
    await t.test("concurrent distinct claimants cannot both acquire one title epoch",async()=>{
      const trophy=await fixture(), custody=await getChampionshipCustody(prisma,trophy);
      const outcomes=await Promise.allSettled([1,2].map(index=>prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:race:${index}`,expectedEpoch:custody.epoch,expectedRosterUserIds:[users[0].id],nextRosterUserIds:[users[index].id],reason:"match",now}))));
      assert.equal(outcomes.filter(row=>row.status === "fulfilled").length,1);
      assert.equal(await prisma.championshipTransferGroup.count({where:{trophyId:trophy.id}}),1);
      assert.equal(await prisma.trophyPayout.count({where:{trophyId:trophy.id,payoutKind:"dethrone_bounty"}}),1);
    });
    await t.test("unpaid same-day Tribute supersedes; chain-backed same-day Tribute remains immutable",async()=>{
      for(const paid of [false,true]) {
        const trophy=await fixture(), custody=await getChampionshipCustody(prisma,trophy);
        const payout=await prisma.trophyPayout.create({data:{trophyId:trophy.id,recipientUserId:users[0].id,amountWolo:10,payoutKind:"daily_tribute",status:paid ? "paid" : "pending",txHash:paid ? "QA_REAL_PROOF_FIXTURE" : null,scheduledFor:new Date("2026-09-30T00:00:00.000Z")}});
        await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:tribute:${paid}`,expectedEpoch:custody.epoch,expectedRosterUserIds:[users[0].id],nextRosterUserIds:[users[1].id],reason:"match",now}));
        const result=await prisma.trophyPayout.findUniqueOrThrow({where:{id:payout.id}});
        assert.equal(result.status,paid ? "paid" : "superseded");
        assert.equal(result.txHash,paid ? "QA_REAL_PROOF_FIXTURE" : null);
        assert.equal(await prisma.trophyPayout.count({where:{trophyId:trophy.id,payoutKind:"daily_tribute"}}),1);
      }
    });
    for(const size of [2,3,4]) await t.test(`${size}v${size} replaces all members as one title total with exact NFT seats`,async()=>{
      const key=`${size}v${size}-dm`;
      const existing=await prisma.trophy.findUnique({where:{trophyId:key}});
      if (existing && existing.status !== "vacant" && !existing.currentHolderDisplayName?.startsWith("core_")) throw new Error(`${key} is reserved for another QA fixture; do not overwrite it.`);
      const trophy=existing ?? await prisma.trophy.create({data:{trophyId:key,displayName:`QA Core ${size}v${size} DM Champions`,kind:"belt",family:"champion",status:"vacant",currentBountyWolo:0,nftClassId:"aoe2war.wartrophy.champion",nftId:key,chainStatus:"app_only"}});
      const vacant=await getChampionshipCustody(prisma,trophy);
      const assigned=await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:team-assignment:${size}`,expectedEpoch:vacant.epoch,expectedRosterUserIds:vacant.roster.map(member=>member.userId),nextRosterUserIds:users.slice(0,size).map(user=>user.id),reason:"commissioner",now}));
      assert.equal(assigned.changed,true);
      await prisma.trophy.update({where:{id:trophy.id},data:{currentBountyWolo:9}});
      const current=await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}}), custody=await getChampionshipCustody(prisma,current);
      const wins=users.slice(5,5+size).map(user=>user.id);
      const transfer=await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:team-win:${size}`,expectedEpoch:custody.epoch,expectedRosterUserIds:custody.roster.map(member=>member.userId),nextRosterUserIds:wins,reason:"match",now:new Date(now.getTime()+1000)}));
      const live=await getChampionshipCustody(prisma,await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}}));
      assert.deepEqual(live.roster.map(member=>member.userId),wins); assert.equal(live.roster.length,size);
      const group=await prisma.championshipTransferGroup.findUniqueOrThrow({where:{id:transfer.groupId!},include:{seats:true}});
      assert.equal(group.seats.length,size);assert.equal(group.nftStatus,"blocked");assert.equal(group.reasonCode,"NFT_EXECUTOR_UNAVAILABLE");assert.ok(group.seats.every(seat=>seat.txHash === null));
      const payout=await prisma.trophyPayout.findUniqueOrThrow({where:{id:transfer.bountyPayoutId!},include:{allocations:{orderBy:{seat:"asc"}}}});
      assert.equal(payout.amountWolo,9);assert.equal(payout.allocations.length,size);assert.equal(payout.allocations.reduce((total,row)=>total+row.amountUwolo,BigInt(0)),BigInt(9000000));
      const historyBefore = await prisma.championshipTransferSeat.findMany({where:{groupId:transfer.groupId!},orderBy:{seat:"asc"}});
      await prisma.user.update({where:{id:wins[0]},data:{inGameName:`${prefix} Updated winner`,walletAddress:`wolo1${prefix.replaceAll("_","")}newwallet`}});
      const same=await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:team-refresh:${size}`,expectedEpoch:live.epoch,expectedRosterUserIds:wins,nextRosterUserIds:[...wins].reverse(),reason:"commissioner",now:new Date(now.getTime()+2000)}));
      assert.equal(same.changed,false);assert.equal((await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}})).holderSince?.toISOString(),new Date(now.getTime()+1000).toISOString());
      const refreshed=await getChampionshipCustody(prisma,await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}}));
      assert.equal(refreshed.epoch,live.epoch);assert.deepEqual(refreshed.roster.map(member=>member.userId),wins);assert.equal(refreshed.roster[0].displayName,`${prefix} Updated winner`);assert.equal(refreshed.roster[0].walletAddress,`wolo1${prefix.replaceAll("_","")}newwallet`);
      assert.deepEqual(await prisma.championshipTransferSeat.findMany({where:{groupId:transfer.groupId!},orderBy:{seat:"asc"}}),historyBefore);
      const retry=await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:team-refresh:${size}`,expectedEpoch:live.epoch,expectedRosterUserIds:wins,nextRosterUserIds:[...wins].reverse(),reason:"commissioner",now:new Date(now.getTime()+3000)}));
      assert.equal(retry.idempotent,true);assert.equal(retry.changed,false);
      await assert.rejects(prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:team-refresh:${size}`,expectedEpoch:live.epoch,expectedRosterUserIds:wins,nextRosterUserIds:[...wins].reverse(),reason:"commissioner",note:"Conflicting audit reason"})),/request identity was reused/i);
    });
    await t.test("paused/draft/retired titles reject ordinary outcomes despite the same reign epoch",async()=>{
      const trophy=await fixture(),legacy=await getChampionshipCustody(prisma,trophy);
      await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:inactive:assign`,expectedEpoch:legacy.epoch,expectedRosterUserIds:legacy.roster.map(member=>member.userId),nextRosterUserIds:[users[1].id],reason:"commissioner",now}));
      const active=await getChampionshipCustody(prisma,await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}}));
      for(const status of ["paused","draft","retired"]) {
        await prisma.trophy.update({where:{id:trophy.id},data:{status}});
        for(const reason of ["match","default"] as const) await assert.rejects(prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:inactive:${status}:${reason}`,expectedEpoch:active.epoch,expectedRosterUserIds:[users[1].id],nextRosterUserIds:[users[2].id],reason,now})),/cannot settle/i);
      }
      assert.equal(await prisma.championshipTransferGroup.count({where:{trophyId:trophy.id}}),1);
    });
    await t.test("legacy Guardian assignment and vacate/retire close explicit custody; pause retains ownership",async()=>{
      const actor={id:users[0].id,uid:users[0].uid};
      for(const operation of ["assign_guardian","vacant","retired","force_forfeiture"]) {
        const trophy=await fixture(),legacy=await getChampionshipCustody(prisma,trophy);
        await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:legacy:${operation}`,expectedEpoch:legacy.epoch,expectedRosterUserIds:legacy.roster.map(member=>member.userId),nextRosterUserIds:[users[1].id],reason:"commissioner",now}));
        const payload=operation === "assign_guardian" ? {action:operation,userId:users[2].id} : operation === "force_forfeiture" ? {action:operation} : {action:"change_status",status:operation};
        await executeTrophyAdminAction(prisma,actor,{...payload,trophyId:trophy.id});
        assert.equal(await prisma.championshipCustodyReign.count({where:{trophyId:trophy.id,endedAt:null}}),0);
      }
      const team=await prisma.trophy.findUniqueOrThrow({where:{trophyId:"2v2-dm"}});
      await executeTrophyAdminAction(prisma,actor,{action:"change_status",trophyId:team.id,status:"paused"});
      assert.equal(await prisma.championshipCustodyReign.count({where:{trophyId:team.id,endedAt:null}}),1);
      await executeTrophyAdminAction(prisma,actor,{action:"change_status",trophyId:team.id,status:"held"});
      await assert.rejects(executeTrophyAdminAction(prisma,actor,{action:"assign_guardian",trophyId:team.id,userId:users[2].id}),/complete roster custody/i);
    });
    await t.test("deactivated Tribute without any confirmed seat retains its unknown broadcast liability",async()=>{
      const trophy=await fixture(),requestKey=`${prefix}:unknown-no-paid-seat`;
      const payout=await prisma.trophyPayout.create({data:{trophyId:trophy.id,amountWolo:10,payoutKind:"daily_tribute",status:"failed",scheduledFor:new Date("2026-09-30T00:00:00.000Z"),allocations:{create:{seat:0,recipientUserId:users[0].id,recipientAddress:users[0].walletAddress,amountUwolo:BigInt(10000000),requestKey,status:"uncertain"}}}});
      const noNetwork=t.mock.method(globalThis,"fetch",async()=>{throw new Error("Unknown-hash request cannot be rebroadcast");});
      try {
        const retries=await Promise.all([executeAllocatedTrophyPayout(prisma,payout.id),executeAllocatedTrophyPayout(prisma,payout.id)]);
        assert.ok(retries.some(result=>/No payout was resent/.test(result.detail ?? "")));
        const retained=await prisma.trophyPayout.findUniqueOrThrow({where:{id:payout.id},include:{allocations:true}});
        assert.equal(retained.status,"failed");assert.equal(retained.allocations[0].status,"uncertain");assert.equal(retained.allocations[0].txHash,null);assert.equal(noNetwork.mock.callCount(),0);
        const custody=await getChampionshipCustody(prisma,trophy);
        await assert.rejects(prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:blocked-unknown-replacement`,expectedEpoch:custody.epoch,expectedRosterUserIds:[users[0].id],nextRosterUserIds:[users[1].id],reason:"match",now})),/executing; resolve it/i);
        assert.equal(await prisma.trophyPayout.count({where:{trophyId:trophy.id,payoutKind:"daily_tribute"}}),1);
      } finally {noNetwork.mock.restore();}
    });
    await t.test("executing parent's known-hash liability can commit through admin GET-only reconciliation",async()=>{
      const trophy=await fixture(),requestKey=`${prefix}:known-hash-recovery`,txHash="B".repeat(64),signer="wolo1qaprotectedfounder";
      const recipient=users[0].walletAddress!,memo=`AoE2WAR ${requestKey} | title ${trophy.id} daily_tribute seat 1`;
      const execution={ok:true,status:"accepted",request_id:requestKey,chain_id:"wolo-1",signer_role:"payout",signer_address:signer,to_address:recipient,amount_uwolo:"10000000",tx_hash:txHash};
      const payout=await prisma.trophyPayout.create({data:{trophyId:trophy.id,amountWolo:10,payoutKind:"daily_tribute",status:"executing",scheduledFor:new Date("2026-09-30T00:00:00.000Z"),allocations:{create:{seat:0,recipientUserId:users[0].id,recipientAddress:recipient,amountUwolo:BigInt(10000000),requestKey,status:"uncertain",proof:{execution}}}}});
      const previousUrl=process.env.WOLO_FOUNDER_SETTLEMENT_URL,previousToken=process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;
      process.env.WOLO_FOUNDER_SETTLEMENT_URL="http://127.0.0.1:8093";process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN="qa-only-token";
      const getOnly=t.mock.method(globalThis,"fetch",async(url:string|URL|Request,init?:RequestInit)=>{
        assert.notEqual(init?.method,"POST");
        if(String(url).endsWith("/health"))return Response.json({ok:true,chain_id:"wolo-1",runtime_chain_id:"wolo-1",loopback_only:true,auth_token_set:true,payout_address:signer});
        assert.ok(String(url).includes(`/txs/${txHash}?`));
        return Response.json({ok:true,found:true,tx_success:true,matched_expected:true,chain_id:"wolo-1",tx_hash:txHash,height:"100",memo,matched_transfer:{sender:signer,recipient,amount:"10000000",denom:"uwolo"}});
      });
      try {
        await executeTrophyAdminAction(prisma,{id:users[0].id,uid:users[0].uid},{action:"payout_action",payoutId:payout.id,operation:"reconcile"});
        const recovered=await prisma.trophyPayout.findUniqueOrThrow({where:{id:payout.id},include:{allocations:true}});
        assert.equal(recovered.status,"paid");assert.equal(recovered.allocations[0].status,"paid");assert.equal(recovered.allocations[0].txHash,txHash);assert.equal(getOnly.mock.callCount(),2);
      } finally {getOnly.mock.restore();if(previousUrl === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_URL;else process.env.WOLO_FOUNDER_SETTLEMENT_URL=previousUrl;if(previousToken === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;else process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN=previousToken;}
    });
    await t.test("partial team Tribute preserves paid seats and blocks a second same-day obligation after custody exit",async()=>{
      const trophy=await prisma.trophy.findUniqueOrThrow({where:{trophyId:"2v2-dm"}}),custody=await getChampionshipCustody(prisma,trophy);
      await prisma.trophy.update({where:{id:trophy.id},data:{tributeAmountWolo:10,payoutFrequency:"daily"}});
      await prisma.trophySetting.upsert({where:{key:"championship_tribute_active:2v2-dm"},create:{key:"championship_tribute_active:2v2-dm",value:true},update:{value:true}});
      const payout=await prisma.trophyPayout.create({data:{trophyId:trophy.id,amountWolo:10,payoutKind:"daily_tribute",status:"partial_paid",scheduledFor:new Date("2026-09-30T00:00:00.000Z"),allocations:{create:custody.roster.map((member,seat)=>({seat,recipientUserId:member.userId,recipientAddress:member.walletAddress,amountUwolo:BigInt(5000000),requestKey:`${prefix}:partial:${seat}`,status:seat===0 ? "paid" : "pending",txHash:seat===0 ? "QA_PARTIAL_SEAT_CHAIN_PROOF" : null}))}}});
      const before=await prisma.trophyPayout.count({where:{trophyId:trophy.id,payoutKind:"daily_tribute",scheduledFor:new Date("2026-09-30T00:00:00.000Z")}});
      const fresh=await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}});
      await prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:partial-exit`,expectedEpoch:custody.epoch,expectedRosterUserIds:custody.roster.map(member=>member.userId),nextRosterUserIds:[users[8].id,users[9].id],reason:"match",now:new Date(now.getTime()+3000)}));
      const retained=await prisma.trophyPayout.findUniqueOrThrow({where:{id:payout.id},include:{allocations:{orderBy:{seat:"asc"}}}});
      assert.equal(retained.status,"partial_paid");assert.equal(retained.allocations[0].txHash,"QA_PARTIAL_SEAT_CHAIN_PROOF");assert.equal(retained.allocations[1].status,"pending");
      assert.equal(await prisma.trophyPayout.count({where:{trophyId:fresh.id,payoutKind:"daily_tribute",scheduledFor:new Date("2026-09-30T00:00:00.000Z")}}),before);
      await ensureChampionshipTeamTributePayouts(prisma,new Date(now.getTime()+4000));
      assert.equal(await prisma.trophyPayout.count({where:{trophyId:fresh.id,payoutKind:"daily_tribute",scheduledFor:new Date("2026-09-30T00:00:00.000Z")}}),before);
      await assert.rejects(executeTrophyAdminAction(prisma,{id:users[0].id,uid:users[0].uid},{action:"payout_action",payoutId:payout.id,operation:"cancel"}),/proven member transfers|partially paid title total/i);
      const unpaidSeat=retained.allocations[1];
      await prisma.user.update({where:{id:unpaidSeat.recipientUserId},data:{walletAddress:null}});
      await prisma.trophyPayoutAllocation.update({where:{id:unpaidSeat.id},data:{recipientAddress:null}});
      // Missing wallet deliberately avoids every real settlement/network call.
      const resumed=await executeAllocatedTrophyPayout(prisma,payout.id);
      assert.equal(resumed.skipped,false);assert.equal(resumed.paid,false);assert.equal(resumed.detail,"WALLET_LINK_REQUIRED");
      const resumedGroup=await prisma.trophyPayout.findUniqueOrThrow({where:{id:payout.id},include:{allocations:{orderBy:{seat:"asc"}}}});
      assert.equal(resumedGroup.status,"partial_paid");assert.equal(resumedGroup.allocations[0].txHash,"QA_PARTIAL_SEAT_CHAIN_PROOF");assert.equal(resumedGroup.allocations[1].txHash,null);
      await prisma.trophyPayoutAllocation.update({where:{id:unpaidSeat.id},data:{status:"uncertain",recipientAddress:"wolo1uncertainqa",proof:{qaUncertaintyFixture:true,noRequestSent:true,requestId:unpaidSeat.requestKey,execution:{status:"accepted"}}}});
      await prisma.trophySetting.update({where:{key:"championship_tribute_active:2v2-dm"},data:{value:false}});
      const noNetwork=t.mock.method(globalThis,"fetch",async()=>{throw new Error("Uncertain QA request must never be resent");});
      const uncertainRetries=await Promise.all([executeAllocatedTrophyPayout(prisma,payout.id),executeAllocatedTrophyPayout(prisma,payout.id)]);
      assert.ok(uncertainRetries.some(result=>!result.skipped));
      assert.ok(uncertainRetries.some(result=>/no payout was resent/i.test(result.detail ?? "")));
      assert.equal(noNetwork.mock.callCount(),0);
      await prisma.trophyPayout.update({where:{id:payout.id},data:{status:"executing"}});
      await assert.rejects(executeTrophyAdminAction(prisma,{id:users[0].id,uid:users[0].uid},{action:"payout_action",payoutId:payout.id,operation:"reconcile"}),/No payout was resent/);
      assert.equal((await prisma.trophyPayout.findUniqueOrThrow({where:{id:payout.id}})).status,"executing");
      assert.equal(noNetwork.mock.callCount(),0);
      noNetwork.mock.restore();
      assert.equal((await prisma.trophyPayoutAllocation.findUniqueOrThrow({where:{id:unpaidSeat.id}})).status,"uncertain");
      const afterExit=await prisma.trophy.findUniqueOrThrow({where:{id:trophy.id}}),afterCustody=await getChampionshipCustody(prisma,afterExit);
      await assert.rejects(prisma.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:uncertain-exit`,expectedEpoch:afterCustody.epoch,expectedRosterUserIds:afterCustody.roster.map(member=>member.userId),nextRosterUserIds:[users[0].id,users[1].id],reason:"match",now:new Date(now.getTime()+5000)})),/executing; resolve it/i);
      await prisma.trophyPayout.update({where:{id:payout.id},data:{status:"partial_paid"}});
      // Synthetic uncertainty sent no request. Restore only this QA-injected state.
      await prisma.trophyPayoutAllocation.update({where:{id:unpaidSeat.id},data:{status:"pending",recipientAddress:null,proof:{qaUncertaintyFixture:true,noRequestSent:true}}});
      // Explicit test activation is restored without touching financial/audit fixtures.
      await prisma.trophySetting.update({where:{key:"championship_tribute_active:2v2-dm"},data:{value:false}});
    });
  } finally { await prisma.$disconnect(); await pool.end(); }
});
