/** Explicit disposable database only. No production connection, no invented chain proof. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "../lib/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { createChampionshipChallenge,loadChampionshipProjection,loadActionableChampionshipPayments,mutateChampionshipParticipant,reconcileChampionshipChallenges,reconcileChampionshipEvidence,commissionerChampionshipAction,CHAMPIONSHIP_INCLUDE } from "../lib/championshipChallenges.ts";
import { getChampionshipCustody,transitionChampionshipCustody } from "../lib/trophies/championship.ts";
import { loadScheduledMatchSettlementPlans, executeScheduledMatchSettlement } from "../lib/scheduledMatchSettlements.ts";
import type { LiveGameSession } from "../lib/liveSessionSnapshot.ts";
import { buildRosterHash, normalizeReplayPlayers } from "../lib/teamResolution.ts";
import { submitReplayResultAdjudication } from "../lib/replayResultAdjudications.ts";
const url=process.env.CHAMPIONSHIP_QA_DATABASE_URL;
const enabled=Boolean(url&&/^postgresql:\/\/(?:[^@]+@)?(?:127\.0\.0\.1|localhost):5432\/aoe2_championship_v1_qa_/.test(url));
if(url&&!enabled)throw new Error("Integration tests require an explicitly named isolated local championship QA database.");
const prisma=enabled?new PrismaClient({adapter:new PrismaPg({connectionString:url!})}):null;
const prefix=`clockqa-${Date.now()}`;
let steam=76500000000000000n+BigInt(Date.now())*10n;
async function warrior(label:string,admin=false){return prisma!.user.create({data:{uid:`${prefix}-${label}`,inGameName:`${prefix}-${label}`,steamId:String(++steam),representedCountry:"USA",walletAddress:`wolo1qa${prefix.replaceAll("-","")}${label.replaceAll("-","")}`,isAdmin:admin}})};
async function protocol(id:number){return prisma!.championshipChallenge.findUniqueOrThrow({where:{scheduledMatchId:id},include:CHAMPIONSHIP_INCLUDE})};
async function soloTitle(label:string,holder:Awaited<ReturnType<typeof warrior>>) {
 return prisma!.trophy.create({data:{trophyId:`${prefix}-${label}`,displayName:`QA ${label} Championship`,kind:"belt",family:"national",eligibleNationality:"USA",status:"held",currentHolderUserId:holder.id,currentHolderDisplayName:holder.inGameName,currentHolderWoloAddress:holder.walletAddress,holderSince:new Date(),currentBountyWolo:3,bountyGrowthWolo:1,chainStatus:"app_only"}});
}
/** Model fixtures exercise durable proof consumers; they never claim a real signed chain transfer. */
async function modeledFunding(id:number,sides:string[]=["challenger","defender"]) {
 const row=await protocol(id),at=row.createdAt;
 for(const p of row.participants.filter(p=>sides.includes(p.side))) {
  const txHash=`QA_MODELLED_PROOF_${prefix}_${id}_${p.side}_${p.seat}`;
  await prisma!.championshipChallengeParticipant.update({where:{id:p.id},data:{acceptedAt:at}});
  await prisma!.scheduledMatchFundingProof.create({data:{scheduledMatchId:p.fundingScheduledMatchId,participantSide:p.fundingSide,txHash,walletAddress:p.walletAddressSnapshot!,amountWolo:5,createdAt:at}});
  await prisma!.scheduledMatch.update({where:{id:p.fundingScheduledMatchId},data:{status:"funded",acceptedAt:at,...(p.fundingSide==="left"?{challengerFundedAt:at,challengerFundingTxHash:txHash,challengerFundingWalletAddress:p.walletAddressSnapshot}:{challengedFundedAt:at,challengedFundingTxHash:txHash,challengedFundingWalletAddress:p.walletAddressSnapshot})}});
 }
 if(sides.length===2)await prisma!.championshipChallenge.update({where:{id:row.id},data:{state:"ready"}});
 return protocol(id);
}
async function battle(id:number,state:"live"|"completed",at?:Date,coverage?:string[],gameType="rm",winnerKnown=true) {
 const row=await protocol(id),startedAt=at??new Date(row.createdAt.getTime()+1000);
 const players=row.participants.map(p=>({steamId:p.steamIdSnapshot,teamId:p.side==="challenger"?"0":"1",winner:winnerKnown?p.side==="challenger":null,name:p.displayNameSnapshot}));
 const game=await prisma!.gameStats.create({data:{replay_file:`qa/${prefix}/${id}`,replayHash:`${prefix}-${id}-${state}-${Date.now()}`,is_final:state==="completed",game_type:gameType,players,played_on:startedAt,createdAt:startedAt,parse_source:state==="live"?"watcher_live":"watcher_final",parse_reason:"qa_modelled_evidence"}});
 return {id:game.id,sessionKey:`platform:qa-${prefix}-${id}`,state,playedOn:startedAt.toISOString(),gameType,players,authenticatedWatcherParticipantUids:coverage??row.participants.map(p=>p.uidSnapshot),authenticatedLiveObservations:[{uid:row.participants.find(p=>p.side==="defender")!.uidSnapshot,observedAt:startedAt.toISOString(),gameType,players}],finalProofPending:false,disconnectDetected:false,mapName:"QA Arabia",winner:winnerKnown?row.participants.find(p=>p.side==="challenger")!.displayNameSnapshot:null,durationSeconds:state==="completed"?18000:null} as unknown as LiveGameSession;
}
const snapshot=(session:LiveGameSession)=>({loadSnapshot:async()=>({activeSessions:session.state==="live"?[session]:[],recentlyCompletedSessions:session.state==="completed"?[session]:[]})});
test("real protocol creation is idempotent, seals one clock, and per-participant acceptance never renews it",{skip:!enabled},async()=>{
 const a=await warrior("creator"),b=await warrior("defender");
 const request=`${prefix}:create:solo`;
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5,creationRequestId:request});
 assert.equal(await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5,creationRequestId:request}),id);
 await assert.rejects(createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:6,creationRequestId:request}),/different stake, title or roster/);
 await assert.rejects(createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5,mode:"dm",creationRequestId:request}),/different stake, title or roster/);
 const row=await prisma!.championshipChallenge.findUniqueOrThrow({where:{scheduledMatchId:id}});
 assert.equal(row.challengeDeadline.getTime()-row.createdAt.getTime(),24*60*60*1000);
 await mutateChampionshipParticipant(prisma!,id,b.id,"accept");
 const after=await prisma!.championshipChallenge.findUniqueOrThrow({where:{id:row.id}});
 assert.equal(after.challengeDeadline.getTime(),row.challengeDeadline.getTime());
 const projection=await loadChampionshipProjection(prisma!,id,b.id);
 assert.equal(projection!.participants.find(p=>p.userId===b.id)!.canFund,true);
 assert.equal(projection!.participants.every(p=>p.funded),false);
 await assert.rejects(mutateChampionshipParticipant(prisma!,id,a.id,"fund",{fundingTxHash:"not-chain-proof",fundingWalletAddress:"wolo1invalid"}),/own linked|WoloChain|Sign/);
 assert.equal(await prisma!.scheduledMatchFundingProof.count({where:{scheduledMatchId:id}}),0);
});
test("funded claimant defaults once after the Commissioner hour; payment and NFT remain unproven",{skip:!enabled},async()=>{
 const a=await warrior("default-a"),b=await warrior("default-b"),title=await soloTitle("default",b);
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),row=await modeledFunding(id,["challenger"]);
 await Promise.all([reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:row.commissionerGraceDeadline}),reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:row.commissionerGraceDeadline})]);
 assert.equal((await protocol(id)).state,"defaulted");
 assert.equal((await prisma!.trophy.findUniqueOrThrow({where:{id:title.id}})).currentHolderUserId,a.id);
 assert.equal(await prisma!.championshipTransferGroup.count({where:{trophyId:title.id}}),1);
 const projected=await loadChampionshipProjection(prisma!,id,a.id);
 assert.equal(projected!.resultStatus,"default");assert.equal(projected!.paymentStatus,"pending");assert.equal(projected!.pursePaidWolo,0);assert.equal(projected!.nftStatus,"blocked");assert.equal(projected!.nftReasonCode,"NFT_EXECUTOR_UNAVAILABLE");
 const late=await battle(id,"completed");
 await reconcileChampionshipEvidence(prisma!,{now:new Date(row.commissionerGraceDeadline.getTime()+1000)},snapshot(late));
 assert.equal((await protocol(id)).state,"defaulted");assert.equal(await prisma!.scheduledMatchReplayClaim.count({where:{scheduledMatchId:id}}),0);
});
test("multiple funded claimant rosters enter one durable dispute without awarding a click-order winner",{skip:!enabled},async()=>{
 const a=await warrior("dispute-a"),b=await warrior("dispute-b"),c=await warrior("dispute-c"),title=await soloTitle("dispute",b);
 const left=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),right=await createChampionshipChallenge(prisma!,c.id,{challengedUid:b.uid,wagerAmountWolo:5});
 const rows=await Promise.all([modeledFunding(left,["challenger"]),modeledFunding(right,["challenger"])]);
 const now=new Date(Math.max(...rows.map(row=>row.commissionerGraceDeadline.getTime())));
 await Promise.all([reconcileChampionshipChallenges(prisma!,{challengeIds:[left,right],now}),reconcileChampionshipChallenges(prisma!,{challengeIds:[left,right],now})]);
 assert.equal((await protocol(left)).state,"disputed");assert.equal((await protocol(right)).state,"disputed");
 const dispute=await prisma!.championshipTitleDispute.findUniqueOrThrow({where:{trophyId_custodyEpoch:{trophyId:title.id,custodyEpoch:rows[0]!.expectedCustodyEpoch!}}});
 assert.deepEqual(new Set((dispute.contenderSnapshot as Array<{challengeId:number}>).map(p=>p.challengeId)),new Set([left,right]));
 assert.equal(await prisma!.championshipTransferGroup.count({where:{trophyId:title.id}}),1);
 assert.equal((await prisma!.trophy.findUniqueOrThrow({where:{id:title.id}})).status,"disputed");
 assert.equal(await prisma!.trophyPayout.count({where:{trophyId:title.id,payoutKind:"dethrone_bounty"}}),0);
});
test("TurboRandom HD watcher encounter starts RM championship without any check-in ceremony",{skip:!enabled},async()=>{
 const a=await warrior("turbo-rm-a"),b=await warrior("turbo-rm-b");
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5,mode:"rm"}),row=await modeledFunding(id);
 const scheduledBefore=await prisma!.scheduledMatch.findUniqueOrThrow({where:{id}});
 assert.equal(scheduledBefore.challengerCheckedInAt,null);
 assert.equal(scheduledBefore.challengedCheckedInAt,null);
 const live=await battle(id,"live",new Date(row.createdAt.getTime()+60_000),[b.uid],"TurboRandom9");
 await reconcileChampionshipEvidence(prisma!,{challengeIds:[id],now:new Date(row.createdAt.getTime()+61_000)},snapshot(live));
 const protocolAfter=await protocol(id);
 const scheduledAfter=await prisma!.scheduledMatch.findUniqueOrThrow({where:{id}});
 assert.equal(protocolAfter.state,"defense_in_progress");
 assert.equal(protocolAfter.defenseSessionKey,live.sessionKey);
 assert.ok(protocolAfter.defenseStartedAt);
 assert.equal(scheduledAfter.status,"live_confirmed");
 assert.ok(scheduledAfter.liveConfirmedAt);
 assert.equal(scheduledAfter.challengerCheckedInAt,null);
 assert.equal(scheduledAfter.challengedCheckedInAt,null);
});
test("accepted Commissioner replay verdict settles an ambiguous watched championship without granting betting authority",{skip:!enabled},async()=>{
 const a=await warrior("commissioner-result-a",true),b=await warrior("commissioner-result-b");
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5,mode:"rm"}),row=await modeledFunding(id);
 const completed=await battle(id,"completed",new Date(row.createdAt.getTime()+60_000),[a.uid,b.uid],"TurboRandom9",false);
 const replayHash=createHash("sha256").update(prefix+":"+id+":commissioner-result").digest("hex");
 const updatedGame=await prisma!.gameStats.update({where:{id:completed.id},data:{replayHash}});
 completed.replayHash=replayHash;
 completed.parseIteration=updatedGame.parse_iteration;
 const canonical=normalizeReplayPlayers(completed.players);
 const winner=canonical.find(player=>player.steamId===a.steamId)!;
 await submitReplayResultAdjudication({
  prisma:prisma!,
  viewerUid:a.uid,
  gameStatsId:completed.id,
  payload:{
   idempotencyKey:`commissioner:qa:${id}:result:v1`,
   sourceReplayHash:completed.replayHash,
   sourceParseIteration:completed.parseIteration,
   sourceRosterHash:buildRosterHash(canonical),
   teams:canonical.map(player=>({teamKey:player.stablePlayerKey,playerKeys:[player.stablePlayerKey]})),
   winningTeamKey:winner.stablePlayerKey,
   reason:"Commissioner observed the completed title game and records the unambiguous winner.",
   evidence:{kind:"qa_commissioner_observation"}
  }
 });
 await reconcileChampionshipEvidence(prisma!,{now:new Date(row.createdAt.getTime()+61_000)},snapshot(completed));
 const after=await protocol(id);
 const scheduled=await prisma!.scheduledMatch.findUniqueOrThrow({where:{id}});
 const adjudication=await prisma!.replayResultAdjudication.findFirstOrThrow({where:{gameStatsId:completed.id},orderBy:{id:"desc"}});
 assert.equal(after.state,"completed");
 assert.equal(after.winnerSide,"challenger");
 assert.equal(after.resultReplayId,completed.id);
 assert.equal(scheduled.status,"completed");
 assert.equal(scheduled.linkedWinner,a.inGameName);
 assert.equal(adjudication.decisionStatus,"accepted");
 assert.equal(adjudication.actorRole,"site_admin");
 assert.equal(adjudication.affectsStats,true);
 assert.equal(adjudication.affectsBets,false);
});
test("authenticated exact defending start freezes default and a full final after five hours transfers once",{skip:!enabled},async()=>{
 const a=await warrior("proof-a"),b=await warrior("proof-b"),title=await soloTitle("proof",b);
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),row=await modeledFunding(id);
 const live=await battle(id,"live",new Date(row.challengeDeadline.getTime()-1000),[b.uid]);
 await reconcileChampionshipEvidence(prisma!,{now:row.challengeDeadline},snapshot(live));
 assert.equal((await protocol(id)).state,"defense_in_progress");
 await reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:new Date(row.commissionerGraceDeadline.getTime()+1000)});
 assert.equal((await protocol(id)).state,"defense_in_progress");
 const final=await battle(id,"completed",new Date(row.challengeDeadline.getTime()-1000));final.authenticatedLiveObservations=[];
 await Promise.all([reconcileChampionshipEvidence(prisma!,{now:new Date(row.challengeDeadline.getTime()+5*60*60*1000)},snapshot(final)),reconcileChampionshipEvidence(prisma!,{now:new Date(row.challengeDeadline.getTime()+5*60*60*1000)},snapshot(final))]);
 assert.equal((await protocol(id)).state,"completed");assert.equal((await protocol(id)).winnerSide,"challenger");
 assert.equal(await prisma!.championshipTransferGroup.count({where:{trophyId:title.id}}),1);assert.equal(await prisma!.scheduledMatchReplayClaim.count({where:{gameStatsId:final.id}}),1);
});
test("an unsigned parsed early start cannot suppress default; partial final coverage goes to review",{skip:!enabled},async()=>{
 const a=await warrior("unsigned-a"),b=await warrior("unsigned-b");await soloTitle("unsigned",b);
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),row=await modeledFunding(id);
 const unsigned=await battle(id,"live");unsigned.authenticatedLiveObservations=[];unsigned.authenticatedWatcherParticipantUids=[];
 await reconcileChampionshipEvidence(prisma!,{now:row.challengeDeadline},snapshot(unsigned));assert.equal((await protocol(id)).defenseStartedAt,null);
 const weakFinal=await battle(id,"completed",undefined,[b.uid]);
 await reconcileChampionshipEvidence(prisma!,{now:row.commissionerGraceDeadline},snapshot(weakFinal));
 assert.equal((await protocol(id)).state,"commissioner_review");assert.equal((await protocol(id)).reasonCode,"FULL_ROSTER_PROOF_REQUIRED");
 assert.equal(await prisma!.championshipTransferGroup.count({where:{challengeId:row.trophyChallengeId!}}),0);
});
test("human-confirmed desync blocks automatic default custody",{skip:!enabled},async()=>{
 const a=await warrior("desync-a"),b=await warrior("desync-b"),admin=await warrior("desync-admin",true),title=await soloTitle("desync",b);
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),row=await modeledFunding(id,["challenger"]),game=await battle(id,"completed");
 await prisma!.replayDesyncIncident.create({data:{gameStatsId:game.id,scheduledMatchId:id,reviewerUserId:admin.id,idempotencyKey:`${prefix}:desync:${id}`,inputHash:"0".repeat(64),desyncOccurred:true,reviewerUidSnapshot:admin.uid,reviewerDisplayNameSnapshot:admin.inGameName!,sourceReplayHash:"1".repeat(64),sourceParseIteration:1,machineEvidence:{qaFixture:true}}});
 await reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:row.commissionerGraceDeadline});
 assert.equal((await protocol(id)).state,"commissioner_review");assert.equal((await protocol(id)).reasonCode,"MATCH_DESYNC");assert.equal((await prisma!.trophy.findUniqueOrThrow({where:{id:title.id}})).currentHolderUserId,b.id);
 assert.equal(await prisma!.championshipTransferGroup.count({where:{trophyId:title.id}}),0);
});
test("a signed final with only parsed start time prevents silent default and requires Commissioner review",{skip:!enabled},async()=>{
 const a=await warrior("parsed-start-a"),b=await warrior("parsed-start-b");await soloTitle("parsed-start",b);
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),row=await modeledFunding(id),final=await battle(id,"completed");final.authenticatedLiveObservations=[];
 await reconcileChampionshipEvidence(prisma!,{now:row.challengeDeadline},snapshot(final));
 assert.equal((await protocol(id)).state,"commissioner_review");assert.equal((await protocol(id)).defenseStartedAt,null);assert.equal((await protocol(id)).reasonCode,"WATCHER_PROOF_MISSING");
 assert.equal(await prisma!.scheduledMatchReplayClaim.count({where:{scheduledMatchId:id}}),0);
});
test("a durable Commissioner review cannot starve the next timed Challenge in a one-row worker batch",{skip:!enabled},async()=>{
 const a=await warrior("fair-review-a"),b=await warrior("fair-review-b"),c=await warrior("fair-timed-a"),d=await warrior("fair-timed-b");
 const held=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),due=await createChampionshipChallenge(prisma!,c.id,{challengedUid:d.uid,wagerAmountWolo:5});
 await prisma!.championshipChallenge.update({where:{scheduledMatchId:held},data:{state:"commissioner_review"}});
 await reconcileChampionshipChallenges(prisma!,{challengeIds:[held,due],now:(await protocol(due)).challengeDeadline,take:1});
 assert.equal((await protocol(held)).state,"commissioner_review");assert.equal((await protocol(due)).state,"expired");
});
test("payment selection skips proven history and retains outstanding funded principal",{skip:!enabled},async()=>{
 const a=await warrior("paid-a"),b=await warrior("paid-b"),c=await warrior("pending-a"),d=await warrior("pending-b");
 const paid=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5}),pending=await createChampionshipChallenge(prisma!,c.id,{challengedUid:d.uid,wagerAmountWolo:5});
 await modeledFunding(paid,["challenger"]);await modeledFunding(pending,["challenger"]);
 await prisma!.championshipChallenge.updateMany({where:{scheduledMatchId:{in:[paid,pending]}},data:{state:"cancelled"}});
 await prisma!.scheduledMatchSettlement.create({data:{scheduledMatchId:paid,status:"executed",action:"left_full_refund",recipientAddress:a.walletAddress!,amountWolo:5,requestId:`${prefix}:modeled-paid`,txHash:`QA_MODELLED_SETTLEMENT_${paid}`,lastAttemptAt:new Date()}});
 const ids=(await loadActionableChampionshipPayments(prisma!,500)).map(row=>row.scheduledMatchId);
 const filteredIds=(await loadActionableChampionshipPayments(prisma!,500,new Date(),[paid,pending])).map(row=>row.scheduledMatchId);
 assert.equal(ids.includes(paid),false);assert.equal(ids.includes(pending),true);
 assert.equal(filteredIds.includes(paid),false);assert.equal(filteredIds.includes(pending),true);
 assert.deepEqual(await loadActionableChampionshipPayments(prisma!,500,new Date(),[paid]),[]);
 assert.equal((await loadChampionshipProjection(prisma!,paid))!.paymentStatus,"proven");assert.equal((await loadChampionshipProjection(prisma!,pending))!.paymentStatus,"pending");
});
test("team cancellation queues exact original-stake refunds for every financial leg without declaring chain payment",{skip:!enabled},async()=>{
 const admin=await warrior("cancel-admin",true),roster=await Promise.all(Array.from({length:4},(_,i)=>warrior(`cancel-${i}`)));
 const title=await prisma!.trophy.findUniqueOrThrow({where:{trophyId:"2v2-rm"}}),custody=await getChampionshipCustody(prisma!,title);
 await prisma!.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:title.id,requestKey:`${prefix}:cancel-team`,expectedEpoch:custody.epoch,expectedRosterUserIds:custody.roster.map(p=>p.userId),nextRosterUserIds:roster.slice(2).map(p=>p.id),reason:"commissioner",actorUserId:admin.id,note:"QA complete team assignment"}));
 const id=await createChampionshipChallenge(prisma!,roster[0]!.id,{challengedUid:roster[2]!.uid,trophyId:title.id,challengerTeamUids:[roster[1]!.uid],wagerAmountWolo:5}),row=await modeledFunding(id);
 const queued:number[]=[];
 const executeSettlement=(async(_db,legId)=>{queued.push(legId);throw new Error("QA fixture intentionally leaves chain execution unavailable");}) as typeof executeScheduledMatchSettlement;
 await mutateChampionshipParticipant(prisma!,id,roster[1]!.id,"cancel",{},{executeSettlement});
 const ids=[id,...row.legs.map(p=>p.scheduledMatchId)];assert.deepEqual(new Set(queued),new Set(ids));assert.equal((await protocol(id)).state,"cancelled");
 const plans=await loadScheduledMatchSettlementPlans(prisma!,{ids});
 assert.equal(plans.rows.length,2);for(const plan of plans.rows){assert.equal(plan.transfers.reduce((sum,p)=>sum+p.amountWolo,0),10);assert.ok(plan.transfers.every(p=>p.reason==="refund"&&p.amountWolo===5));}
 assert.equal((await loadChampionshipProjection(prisma!,id))!.pursePaidWolo,0);assert.equal((await loadChampionshipProjection(prisma!,id))!.paymentStatus,"pending");
});
test("one full 3v3 final replaces all seats and every financial leg inherits the parent's desync settlement guard",{skip:!enabled},async()=>{
 const admin=await warrior("team-proof-admin",true),roster=await Promise.all(Array.from({length:6},(_,i)=>warrior(`team-proof-${i}`)));
 const title=await prisma!.trophy.findUniqueOrThrow({where:{trophyId:"3v3-rm"}}),custody=await getChampionshipCustody(prisma!,title);
 await prisma!.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:title.id,requestKey:`${prefix}:proof-team`,expectedEpoch:custody.epoch,expectedRosterUserIds:custody.roster.map(p=>p.userId),nextRosterUserIds:roster.slice(3).map(p=>p.id),reason:"commissioner",actorUserId:admin.id,note:"QA complete team assignment"}));
 const id=await createChampionshipChallenge(prisma!,roster[0]!.id,{challengedUid:roster[3]!.uid,trophyId:title.id,challengerTeamUids:roster.slice(1,3).map(p=>p.uid),wagerAmountWolo:5}),row=await modeledFunding(id),final=await battle(id,"completed");
 await Promise.all([reconcileChampionshipEvidence(prisma!,{challengeIds:[id],now:row.challengeDeadline},snapshot(final)),reconcileChampionshipEvidence(prisma!,{challengeIds:[id],now:row.challengeDeadline},snapshot(final))]);
 assert.equal((await protocol(id)).state,"completed");
 const current=await getChampionshipCustody(prisma!,await prisma!.trophy.findUniqueOrThrow({where:{id:title.id}}));assert.deepEqual(current.roster.map(p=>p.userId),roster.slice(0,3).map(p=>p.id));
 const group=await prisma!.championshipTransferGroup.findUniqueOrThrow({where:{requestKey:`championship-result:${row.id}:${final.id}`},include:{seats:true}});assert.equal(group.seats.length,3);assert.equal(group.nftStatus,"blocked");
 assert.equal(await prisma!.scheduledMatchReplayClaim.count({where:{gameStatsId:final.id}}),1);
 await prisma!.replayDesyncIncident.create({data:{gameStatsId:final.id,scheduledMatchId:id,reviewerUserId:admin.id,idempotencyKey:`${prefix}:team-desync:${id}`,inputHash:"2".repeat(64),desyncOccurred:true,reviewerUidSnapshot:admin.uid,reviewerDisplayNameSnapshot:admin.inGameName!,sourceReplayHash:"3".repeat(64),sourceParseIteration:1,machineEvidence:{qaFixture:true}}});
 for(const leg of row.legs)await assert.rejects(executeScheduledMatchSettlement(prisma!,leg.scheduledMatchId,admin.id),error=>(error as {code?:string}).code==="DESYNC_WINNER_SETTLEMENT_BLOCKED");
 assert.equal(await prisma!.scheduledMatchSettlement.count({where:{scheduledMatchId:{in:row.legs.map(p=>p.scheduledMatchId)}}}),0);
});
test("unfunded solo cannot capture at Hour25; repeat workers are idempotent",{skip:!enabled},async()=>{
 const a=await warrior("unfunded-a"),b=await warrior("unfunded-b");
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:b.uid,wagerAmountWolo:5});
 const row=await prisma!.championshipChallenge.findUniqueOrThrow({where:{scheduledMatchId:id}});
 await reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:new Date(row.challengeDeadline.getTime()),take:100});
 assert.equal((await prisma!.championshipChallenge.findUniqueOrThrow({where:{id:row.id}})).state,"expired");
 await Promise.all([reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:row.commissionerGraceDeadline}),reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:row.commissionerGraceDeadline})]);
 assert.equal((await prisma!.championshipChallenge.findUniqueOrThrow({where:{id:row.id}})).state,"expired");
 assert.equal(await prisma!.championshipTransferGroup.count({where:{challengeId:row.trophyChallengeId ?? -1}}),0);
});
test("team roster is durable, every participant receives parent notice, and hidden finance legs cannot become independent title claims",{skip:!enabled},async()=>{
 const admin=await warrior("commissioner",true),a=await warrior("team-a"),b=await warrior("team-b"),c=await warrior("team-c"),d=await warrior("team-d"),e=await warrior("team-e"),f=await warrior("team-f");
 const trophy=await prisma!.trophy.findUniqueOrThrow({where:{trophyId:"3v3-rm"}});
 const custody=await getChampionshipCustody(prisma!,trophy);
 await prisma!.$transaction(tx=>transitionChampionshipCustody(tx,{trophyId:trophy.id,requestKey:`${prefix}:assign-team`,expectedEpoch:custody.epoch,expectedRosterUserIds:custody.roster.map(p=>p.userId),nextRosterUserIds:[c.id,d.id,f.id],reason:"commissioner",actorUserId:admin.id,eligibilityOverride:true,note:"Isolated protocol integration fixture"}));
 const id=await createChampionshipChallenge(prisma!,a.id,{challengedUid:c.uid,trophyId:trophy.id,challengerTeamUids:[b.uid,e.uid],wagerAmountWolo:5});
 const row=await prisma!.championshipChallenge.findUniqueOrThrow({where:{scheduledMatchId:id},include:{participants:true,legs:true}});
 assert.equal(row.participants.length,6);assert.equal(row.legs.length,2);assert.equal(row.mode,"rm");
 assert.equal(row.participants.every(p=>Boolean(p.notifiedAt)),true);
 assert.deepEqual(new Set(row.participants.filter(p=>p.side==="defender").map(p=>p.userId)),new Set([c.id,d.id,f.id]));
 await mutateChampionshipParticipant(prisma!,id,b.id,"accept");
 assert.equal((await loadChampionshipProjection(prisma!,id,b.id))!.participants.find(p=>p.userId===b.id)!.accepted,true);
 assert.equal(await prisma!.trophyChallenge.count({where:{scheduledMatchId:{in:row.legs.map(p=>p.scheduledMatchId)}}}),0);
 await reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:row.challengeDeadline});
 assert.equal((await prisma!.championshipChallenge.findUniqueOrThrow({where:{id:row.id}})).state,"default_grace");
 await commissionerChampionshipAction(prisma!,admin.id,{challengeId:id,action:"protect",reason:"No signed challengers; preserve championship pending operator review."});
 await reconcileChampionshipChallenges(prisma!,{challengeIds:[id],now:row.commissionerGraceDeadline});
 assert.equal((await prisma!.championshipChallenge.findUniqueOrThrow({where:{id:row.id}})).state,"commissioner_review");
 assert.deepEqual((await getChampionshipCustody(prisma!,await prisma!.trophy.findUniqueOrThrow({where:{id:trophy.id}}))).roster.map(p=>p.userId),[c.id,d.id,f.id]);
});
test.after(async()=>{await prisma?.$disconnect()});
