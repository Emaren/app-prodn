import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient, type ChampionshipChallenge } from "@/lib/generated/prisma";
import { championshipBeltPolicy, championshipEligibility } from "@/lib/champions/beltPolicy";
import { acquireChampionshipTitleLock, getChampionshipCustody, transitionChampionshipCustody, loadChampionshipCandidate, loadHeldChampionshipStack } from "@/lib/trophies/championship";
import { ensureTrophySeedData, lockTrophyMoneyState, seededTrophyDefinition } from "@/lib/trophies/service";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import { postChallengeInboxNotice, postChallengeCommissionerNotice } from "@/lib/contactInbox";
import { verifyChallengeFundingTransfer } from "@/lib/woloBetSettlement";
import { executeScheduledMatchSettlement } from "@/lib/scheduledMatchSettlements";
import { normalizeChallengeSteamId } from "@/lib/challengeProtocol";
import { normalizeChallengeWoloAmount } from "@/lib/challengeEconomy";
function normalizeChallengeNote(value:unknown) { return typeof value === "string" ? value.trim().replace(/\s+/g," ").slice(0,160) || null : null; }
import { loadLiveSessionSnapshot, type LiveGameSession } from "@/lib/liveSessionSnapshot";
import { replayEloLane } from "@/lib/champions/eloTrophy";
import { acquireChallengeDesyncAdvisoryLock, loadDesyncIncidentsForSettlement, assertTitleTransferAllowed, assertWinnerSettlementAllowed } from "@/lib/desyncChallenge";
import { ChallengeConflictError } from "@/lib/challenge/domain/errors";
import { championshipClock, championshipDefaultDecision, projectChampionshipChallenge, validateChampionshipBattleStart, validateChampionshipBattleFinal, CHAMPIONSHIP_CHALLENGE_WINDOW_MS, CHAMPIONSHIP_COMMISSIONER_GRACE_MS, CHAMPIONSHIP_PROTOCOL_VERSION, type ChampionshipParticipantProof, type ChampionshipProjection, type ChampionshipBattleProof } from "@/lib/challengeChampionshipProtocol";
import {
  applyReplayResultAdjudication,
  replayResultAdjudicationAuthorizesChampionship,
  type EffectiveReplayResultAdjudication,
} from "@/lib/replayResultAdjudications";

export type ChampionshipChallengeProjection = ChampionshipProjection;
const LOCK_NAMESPACE = 752_017;
const ACTIVE = ["open", "ready", "defense_in_progress", "default_grace", "commissioner_review"];
const AUTOMATIC_EVIDENCE = ["open", "ready", "defense_in_progress", "default_grace"];
export const CHAMPIONSHIP_INCLUDE = { participants: { orderBy: [{ side: "asc" }, { seat: "asc" }] }, legs: true } satisfies Prisma.ChampionshipChallengeInclude;
const USER_SELECT = { id: true, uid: true, inGameName: true, steamPersonaName: true, steamId: true, walletAddress: true, representedCountry: true, genderDivision: true, isAdmin: true } as const;
type ProtocolRow = Prisma.ChampionshipChallengeGetPayload<{ include: typeof CHAMPIONSHIP_INCLUDE }>;
function sealedCandidates(row:ChampionshipChallenge) {
  const snapshot=row.eligibilitySnapshot as {candidates?:Array<{userId:number;representedCountry:string|null;genderDivision?:string|null;rmRating?:number|null;dmRating?:number|null}>;overrideReceipt?:{actorUserId:number;reason:string}}|null;
  return { candidates:snapshot?.candidates ?? [], overrideReceipt:row.eligibilityOverride && snapshot?.overrideReceipt && row.trophyChallengeId ? {...snapshot.overrideReceipt,challengeId:row.trophyChallengeId}:undefined };
}
async function protocolLock(tx: Prisma.TransactionClient, id: number) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${id})`; }
async function lockChampionship(tx:Prisma.TransactionClient,row:{id:number;trophyId:number|null}) {
  if(row.trophyId) await acquireChampionshipTitleLock(tx,row.trophyId);
  await protocolLock(tx,row.id);
}
async function lockChampionships(tx:Prisma.TransactionClient,rows:Array<{id:number;trophyId:number|null}>) {
  for(const trophyId of [...new Set(rows.map(row=>row.trophyId).filter((id):id is number=>Boolean(id)))].sort((a,b)=>a-b))await acquireChampionshipTitleLock(tx,trophyId);
  for(const row of [...rows].sort((a,b)=>a.id-b.id))await protocolLock(tx,row.id);
}
function name(user: { uid: string; inGameName: string | null; steamPersonaName: string | null }) { return user.inGameName || user.steamPersonaName || user.uid; }
function legIds(row: ProtocolRow) { return [row.scheduledMatchId, ...row.legs.map(leg => leg.scheduledMatchId)]; }
async function participantProofs(prisma: Pick<PrismaClient, "scheduledMatchFundingProof" | "scheduledMatch">, row: ProtocolRow): Promise<ChampionshipParticipantProof[]> {
  const [proofs,legs] = await Promise.all([
    prisma.scheduledMatchFundingProof.findMany({ where: { scheduledMatchId: { in: legIds(row) } } }),
    prisma.scheduledMatch.findMany({where:{id:{in:legIds(row)}},select:{id:true,wagerAmountWolo:true,guaranteeAmountWolo:true}})]);
  return row.participants.map(p => ({ userId:p.userId, uid:p.uidSnapshot, name:p.displayNameSnapshot, side:p.side as "challenger" | "defender", seat:p.seat, steamId:p.steamIdSnapshot, accepted:Boolean(p.acceptedAt), notified:Boolean(p.notifiedAt), funded:proofs.some(proof => {const leg=legs.find(leg=>leg.id===p.fundingScheduledMatchId);return leg && proof.scheduledMatchId === leg.id && proof.participantSide === p.fundingSide && proof.walletAddress === p.walletAddressSnapshot && proof.amountWolo===leg.wagerAmountWolo+leg.guaranteeAmountWolo && Boolean(proof.txHash);}), fundingChallengeId:p.fundingScheduledMatchId, fundingSide:p.fundingSide as "left" | "right" }));
}
async function championshipSettlementProjection(prisma:PrismaClient,row:ProtocolRow) {
  const [group,settlements,proofs,trophy]=await Promise.all([
    row.trophyChallengeId ? prisma.championshipTransferGroup.findFirst({where:{challengeId:row.trophyChallengeId},orderBy:{id:"desc"}}) : null,
    prisma.scheduledMatchSettlement.findMany({where:{scheduledMatchId:{in:legIds(row)},status:{not:"superseded"}}}),
    prisma.scheduledMatchFundingProof.findMany({where:{scheduledMatchId:{in:legIds(row)}}}),
    row.trophyId ? prisma.trophy.findUnique({where:{id:row.trophyId}}) : null]);
  const executed=settlements.filter(s=>s.status==="executed"&&Boolean(s.txHash));
  const purseFundedWolo=proofs.reduce((sum,p)=>sum+p.amountWolo,0),pursePaidWolo=executed.reduce((sum,p)=>sum+p.amountWolo,0);
  const paymentStatus=proofs.length===0?"unfunded":executed.length===settlements.length&&pursePaidWolo===purseFundedWolo?"proven":executed.length>0?"partial":settlements.some(s=>s.status==="failed")?"failed":"pending";
  const bounty=group?.bountyPayoutId ? await prisma.trophyPayout.findUnique({where:{id:group.bountyPayoutId},include:{allocations:true}}) : null;
  const paidBountySeats=bounty?.allocations.filter(p=>p.status==="paid"&&Boolean(p.txHash))??[];
  const bountyStatus=!group||group.frozenBountyWolo===0?"none":!bounty?"pending":bounty.status==="paid"&&Boolean(bounty.txHash)?"paid":bounty.allocations.length>0&&paidBountySeats.length===bounty.allocations.length?"paid":paidBountySeats.length>0?"partial":bounty.status==="failed"?"failed":"pending";
  const custody=trophy ? await getChampionshipCustody(prisma,trophy) : null;
  const definition=trophy ? seededTrophyDefinition(trophy.trophyId)?.definition : null;
  return {winnerSide:row.winnerSide,resultStatus:row.state==="completed"?"verified":row.state==="defaulted"?"default":row.state==="disputed"?"disputed":row.state==="commissioner_review"?"review":"pending",resultReplayId:row.resultReplayId,titleCustodyStatus:!row.trophyId?"none":row.state==="disputed"?"disputed":row.state==="commissioner_review"?"review":group?.appStatus==="changed"?"transferred":row.state==="completed"&&row.winnerSide==="defender"?"holder_retained":"pending",custodyEpoch:custody?.epoch??null,transferGroupId:group?.id??null,currentHolderNames:custody?.roster.map(p=>p.displayName)??[],currentHolderUserIds:custody?.roster.map(p=>p.userId)??[],titleId:trophy?championshipBeltPolicy(trophy).titleId:null,titleImageUri:trophy?managedMediaPublicUrl("belt",definition?.id??trophy.trophyId,trophy.nftImageUri??definition?.assetUrl):null,teamSize:row.teamSize,mode:row.mode,paymentStatus,paymentTxHashes:executed.map(s=>s.txHash!),purseFundedWolo,pursePaidWolo,bountyStatus,bountyAmountWolo:group?.frozenBountyWolo??0,bountyTxHashes:[...new Set([bounty?.status==="paid"?bounty.txHash:null,...paidBountySeats.map(p=>p.txHash)].filter((hash):hash is string=>Boolean(hash)))],nftStatus:!row.trophyId?"none":group?.nftStatus??(row.state==="completed"&&row.winnerSide==="defender"?"not_required":"not_started"),nftReasonCode:group?.reasonCode??null};
}
export async function loadChampionshipProjection(prisma: PrismaClient, challengeId: number, viewerUserId?: number | null, now = new Date()) {
  const row = await prisma.championshipChallenge.findUnique({ where: { scheduledMatchId:challengeId }, include:CHAMPIONSHIP_INCLUDE });
  if (!row) return null;
  return {...projectChampionshipChallenge({ ...row, participants:await participantProofs(prisma,row) },now,viewerUserId),...await championshipSettlementProjection(prisma,row)};
}
export async function loadChampionshipProjectionMap(prisma: PrismaClient, challengeIds: number[], viewerUserId?: number | null) {
  const rows = await prisma.championshipChallenge.findMany({ where:{scheduledMatchId:{in:challengeIds}},include:CHAMPIONSHIP_INCLUDE });
  const entries = await Promise.all(rows.map(async row => [row.scheduledMatchId, {...projectChampionshipChallenge({...row,participants:await participantProofs(prisma,row)},new Date(),viewerUserId),...await championshipSettlementProjection(prisma,row)}] as const));
  return new Map(entries);
}
async function audit(tx: Prisma.TransactionClient, row: ChampionshipChallenge, eventType: string, reasonCode: string | null, actorUserId?: number | null, raw: Record<string,unknown> = {}, now = new Date()) {
  const actor=actorUserId?await tx.user.findUnique({where:{id:actorUserId},select:{isAdmin:true}}):null;
  await tx.scheduledMatchActivity.create({ data:{scheduledMatchId:row.scheduledMatchId,actorUserId:actorUserId ?? null,eventType:eventType.slice(0,32),detail:reasonCode || eventType,metadata:{protocolId:row.id,canonicalEventType:eventType,...raw} as Prisma.InputJsonValue,createdAt:now} });
  if (row.trophyId) await tx.trophyEvent.create({data:{trophyId:row.trophyId,challengeId:row.trophyChallengeId,eventType:eventType.toUpperCase(),actorUserId:actorUserId??null,actorRole:actorUserId ? actor?.isAdmin?"admin":"user" : "system",initiatedBy:actorUserId ? String(actorUserId):"system",status:"recorded",rawRequest:{reasonCode,scheduledMatchId:row.scheduledMatchId,...raw} as Prisma.InputJsonValue}});
}
type ChampionshipCreationPayload = { challengedUid?:string; trophyId?:string|number|null; challengerTeamUids?:string[]; mode?:string; creationRequestId?:string; challengeNote?:string; wagerAmountWolo?:unknown; eligibilityOverride?:boolean; commissionerReason?:string };
function requestedCreationTerms(payload:ChampionshipCreationPayload,creatorUid:string,requestedTrophyId:number|null,override:boolean) {
  return {challengedUid:payload.challengedUid??"",challengerTeamUids:[...new Set(payload.challengerTeamUids??[])].filter(uid=>uid!==creatorUid),requestedTrophyId,requestedMode:payload.mode??null,challengeNote:normalizeChallengeNote(payload.challengeNote),eligibilityOverride:override,commissionerReason:payload.commissionerReason?.trim()??null};
}
async function existingCreation(prisma:Pick<PrismaClient,"scheduledMatch"|"trophy">,requestId:string,creator:{id:number;uid:string;isAdmin:boolean},payload:ChampionshipCreationPayload,wager:number) {
  const existing=await prisma.scheduledMatch.findUnique({where:{creationRequestId:requestId},include:{championshipProtocol:{include:CHAMPIONSHIP_INCLUDE}}});
  if(!existing)return null;
  if(existing.challengerUserId!==creator.id)throw new ChallengeConflictError("Request identity belongs to another warrior.");
  const row=existing.championshipProtocol;
  const selected=payload.trophyId?await prisma.trophy.findUnique({where:typeof payload.trophyId==="number"?{id:payload.trophyId}:{trophyId:payload.trophyId}}):null;
  const terms=requestedCreationTerms(payload,creator.uid,selected?.id??null,creator.isAdmin&&payload.eligibilityOverride===true);
  const sealed=(row?.eligibilitySnapshot as {creationTerms?:ReturnType<typeof requestedCreationTerms>}|null)?.creationTerms;
  if(!row || existing.wagerAmountWolo!==wager || (payload.trophyId&&!selected) || (sealed?!isDeepStrictEqual(terms,sealed):selected?.id!==undefined&&selected.id!==row.trophyId))throw new ChallengeConflictError("Request identity was reused with different stake, title or roster terms.");
  const sealedChallengers=row.participants.filter(p=>p.side==="challenger").sort((a,b)=>a.seat-b.seat).map(p=>p.uidSnapshot);
  if(JSON.stringify(sealedChallengers)!==JSON.stringify([creator.uid,...terms.challengerTeamUids]) || !row.participants.some(p=>p.side==="defender"&&p.uidSnapshot===payload.challengedUid))throw new ChallengeConflictError("Request identity was reused with different stake, title or roster terms.");
  return existing.id;
}
export async function createChampionshipChallenge(prisma: PrismaClient, viewerUserId: number, payload: ChampionshipCreationPayload) {
  const now = new Date(), clock = championshipClock(now);
  const creator = await prisma.user.findUnique({where:{id:viewerUserId},select:USER_SELECT});
  const rival = await prisma.user.findUnique({where:{uid:payload.challengedUid || ""},select:USER_SELECT});
  if (!creator || !rival || creator.id === rival.id) throw new ChallengeConflictError("Choose another linked warrior.",400);
  const requestId = typeof payload.creationRequestId === "string" && /^[A-Za-z0-9:_-]{12,128}$/.test(payload.creationRequestId) ? payload.creationRequestId : `championship-v2:${creator.id}:${randomUUID()}`;
  const wager = normalizeChallengeWoloAmount(payload.wagerAmountWolo);
  if (wager === null || wager <= 0) throw new ChallengeConflictError("Put positive WOLO on the line.",400);
  const replay=await existingCreation(prisma,requestId,creator,payload,wager);
  if(replay)return replay;
  await ensureTrophySeedData(prisma);
  const candidate = await loadChampionshipCandidate(prisma,creator.id);
  const stack=await loadHeldChampionshipStack(prisma,rival.id,creator.id);
  let target = stack.soloTitleId ? await prisma.trophy.findUnique({where:{id:stack.soloTitleId}}) : null;
  if (payload.trophyId) {
    const selected = await prisma.trophy.findUnique({where:typeof payload.trophyId === "number" ? {id:payload.trophyId} : {trophyId:payload.trophyId}});
    if (!selected) throw new ChallengeConflictError("That championship does not exist.",404);
    if (championshipBeltPolicy(selected).teamSize === 1 && !creator.isAdmin) throw new ChallengeConflictError("AoE2WAR selects the first eligible solo title.",403);
    target = selected;
  }
  const override = creator.isAdmin && payload.eligibilityOverride === true;
  const commissionerReason = payload.commissionerReason?.trim();
  if (override && (!commissionerReason || commissionerReason.length<5)) throw new ChallengeConflictError("Record a concrete Commissioner reason for bypassing challenger eligibility.",400);
  if(payload.trophyId&&target&&championshipBeltPolicy(target).teamSize===1&&(!commissionerReason||commissionerReason.length<5))throw new ChallengeConflictError("Record a concrete Commissioner reason for selecting a solo title manually.",400);
  if(target && !championshipEligibility(target,candidate,override).eligible) throw new ChallengeConflictError(championshipEligibility(target,candidate,override).reason,422);
  const policy = target ? championshipBeltPolicy(target) : null;
  if(payload.mode && !["rm","dm"].includes(payload.mode))throw new ChallengeConflictError("Choose RM or DM for the battle.",400);
  if(policy?.mode && payload.mode && policy.mode!==payload.mode)throw new ChallengeConflictError("Battle mode must match the selected title.",422);
  const size = policy?.teamSize ?? 1;
  const teammateUids = [...new Set(payload.challengerTeamUids || [])].filter(uid => uid !== creator.uid);
  if (teammateUids.length !== size - 1) throw new ChallengeConflictError(`This championship requires exactly ${size} challengers.`,422);
  const teammates = teammateUids.length ? await prisma.user.findMany({where:{uid:{in:teammateUids}},select:USER_SELECT}) : [];
  if (teammates.length !== teammateUids.length) throw new ChallengeConflictError("Every teammate must be an existing warrior.",422);
  const challengers = [creator,...teammateUids.map(uid => teammates.find(user => user.uid === uid)!)];
  const candidateAuthorities=await Promise.all(challengers.map(async user=>({userId:user.id,...await loadChampionshipCandidate(prisma,user.id)})));
  const sealedEligibility={policy,candidates:candidateAuthorities,overrideReceipt:override ? {actorUserId:creator.id,reason:commissionerReason!}:null,creationTerms:requestedCreationTerms(payload,creator.uid,payload.trophyId?target!.id:null,override),originalClock:{createdAt:now.toISOString(),challengeDeadline:clock.challengeDeadline.toISOString(),commissionerGraceDeadline:clock.commissionerGraceDeadline.toISOString()}};
  const createdId = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`championship-create:${requestId}`}, 0))`;
    const repeat=await existingCreation(tx,requestId,creator,payload,wager);
    if(repeat)return repeat;
    if(target) {await acquireChampionshipTitleLock(tx,target.id);target=await lockTrophyMoneyState(tx,target.id);}
    const custody = target ? await getChampionshipCustody(tx,target) : null;
    if (target && (!custody || custody.roster.length !== size || !custody.roster.some(p => p.userId === rival.id))) throw new ChallengeConflictError("The rival does not hold the complete challenged championship roster.");
    if (target && !["held","active","guardian_held"].includes(target.status)) throw new ChallengeConflictError("This title is not open for a championship defense.");
    const defenderIds = custody ? custody.roster.map(p => p.userId) : [rival.id];
    const defenderUsers = await tx.user.findMany({where:{id:{in:defenderIds}},select:USER_SELECT});
    const defenders = defenderIds.map(id => defenderUsers.find(user => user.id === id)!);
    const all = [...challengers,...defenders];
    if (new Set(all.map(user => user.id)).size !== 2*size || all.some(user => !normalizeChallengeSteamId(user.steamId))) throw new ChallengeConflictError("Every roster seat needs a distinct linked Steam warrior.",422);
    if(new Set(all.map(user => user.steamId)).size !== all.length) throw new ChallengeConflictError("Steam identities must be unique across the complete roster.",422);
    for(const challenger of challengers) {
      if(target && !championshipEligibility(target,candidateAuthorities.find(candidate=>candidate.userId===challenger.id)!,override).eligible) throw new ChallengeConflictError("Every challenger must be eligible for this championship.",422);
    }
    const financial = [];
    for(let seat=0;seat<size;seat++) financial.push(await tx.scheduledMatch.create({data:{challengerUserId:challengers[seat]!.id,challengedUserId:defenders[seat]!.id,status:"proposed",scheduledAt:clock.challengeDeadline,timingMode:"open",acceptBy:clock.challengeDeadline,fundBy:clock.challengeDeadline,playBy:clock.challengeDeadline,creationRequestId:seat === 0 ? requestId:`championship-leg:${requestId}:${seat}`,protocolVersion:CHAMPIONSHIP_PROTOCOL_VERSION,challengerSteamIdSnapshot:challengers[seat]!.steamId,challengedSteamIdSnapshot:defenders[seat]!.steamId,wagerAmountWolo:wager,guaranteeAmountWolo:0,challengeNote:normalizeChallengeNote(payload.challengeNote),createdAt:now}}));
    const parent = financial[0]!;
    const titleChallenge = target ? await tx.trophyChallenge.create({data:{trophyId:target.id,challengeKind:size>1?"team_title":"belt_title",challengerUserId:creator.id,defenderUserId:defenders[0]!.id,scheduledMatchId:parent.id,status:"proposed",settlementStatus:"not_started",eligibilityOverride:override,eligibilitySnapshot:{protocolVersion:CHAMPIONSHIP_PROTOCOL_VERSION,...sealedEligibility,expectedCustodyEpoch:custody?.epoch,defenderRoster: defenderIds,challengerRoster:challengers.map(p => p.id)},expectedPlayerNames:all.map(name)}}) : null;
    const protocol = await tx.championshipChallenge.create({data:{scheduledMatchId:parent.id,trophyChallengeId:titleChallenge?.id,trophyId:target?.id,titleName:target?.displayName,mode:policy?.mode ?? (payload.mode === "dm" ? "dm":"rm"),teamSize:size,...clock,expectedCustodyEpoch:custody?.epoch,expectedDefenderRoster:defenderIds,eligibilitySnapshot:sealedEligibility,eligibilityOverride:override,createdAt:now}});
    for(let seat=1;seat<size;seat++) await tx.championshipChallengeLeg.create({data:{protocolId:protocol.id,scheduledMatchId:financial[seat]!.id,seat}});
    for (const [side,users] of [["challenger",challengers],["defender",defenders]] as const) for(let seat=0;seat<size;seat++) {
      const user = users[seat]!;
      await tx.championshipChallengeParticipant.create({data:{protocolId:protocol.id,userId:user.id,uidSnapshot:user.uid,displayNameSnapshot:name(user),side,seat,steamIdSnapshot:user.steamId!,walletAddressSnapshot:user.walletAddress,fundingScheduledMatchId:financial[seat]!.id,fundingSide:side === "challenger" ? "left":"right",acceptedAt:user.id === creator.id ? now:null,notifiedAt:now}});
      if(user.id !== creator.id) await postChallengeInboxNotice(tx,{senderUserId:creator.id,targetUserId:user.id,challengeId:parent.id,body:["Challenge issued",`${name(creator)} vs ${name(rival)}`,`Title Stakes: ${target?.displayName || "Warrior battle"}`,`Challenge deadline ISO: ${clock.challengeDeadline.toISOString()}`,"ALL CHALLENGES REMAIN OPEN FOR 24 HOURS",`${wager} WOLO per warrior`,"Status: Accept, fund your side, and start the qualifying battle before the deadline."].join("\n"),now});
    }
    await audit(tx,protocol,"title_challenge_created",null,creator.id,{rosters:all.map(user => ({id:user.id,steamId:user.steamId})),deadline:clock.challengeDeadline.toISOString(),eligibilityOverride:override,commissionerReason:commissionerReason??null},now);
    return parent.id;
  },{timeout:60_000});
  await postChallengeCommissionerNotice(prisma,createdId).catch(error => console.error("Championship notice failed:",error));
  return createdId;
}

export async function mutateChampionshipParticipant(prisma: PrismaClient, challengeId: number, actorUserId: number, action: "accept"|"fund"|"decline"|"cancel", payload: {fundingTxHash?:string|null;fundingWalletAddress?:string|null}={},dependencies:{executeSettlement?:typeof executeScheduledMatchSettlement}={}) {
  const row = await prisma.championshipChallenge.findUnique({where:{scheduledMatchId:challengeId},include:CHAMPIONSHIP_INCLUDE});
  if (!row) return false;
  const participant = row.participants.find(p => p.userId === actorUserId);
  if (!participant) throw new ChallengeConflictError("You are not part of this championship roster.",403);
  if(!["open","ready"].includes(row.state) || row.defenseStartedAt || row.challengeDeadline <= new Date()) throw new ChallengeConflictError("The Challenge is no longer open for participant actions.");
  if(action === "cancel" && participant.side !== "challenger") throw new ChallengeConflictError("Only a challenger can cancel their Challenge.",403);
  let verifiedHash: string | null = null;
  if (action === "fund") {
    if (!participant.acceptedAt) throw new ChallengeConflictError("Accept your roster seat before funding.");
    const user = await prisma.user.findUnique({where:{id:actorUserId},select:{walletAddress:true,steamId:true}});
    const wallet = payload.fundingWalletAddress?.trim();
    if (!wallet || wallet !== user?.walletAddress || (participant.walletAddressSnapshot && wallet !== participant.walletAddressSnapshot) || user.steamId !== participant.steamIdSnapshot) throw new ChallengeConflictError("Sign with your own linked, sealed roster wallet and Steam identity.",403);
    const leg = await prisma.scheduledMatch.findUniqueOrThrow({where:{id:participant.fundingScheduledMatchId}});
    const verified = await verifyChallengeFundingTransfer({challengeId:leg.id,txHash:payload.fundingTxHash || "",fromAddress:wallet,participantSide:participant.fundingSide as "left"|"right",wagerAmountWolo:leg.wagerAmountWolo,guaranteeAmountWolo:leg.guaranteeAmountWolo});
    if (!verified.verified || !verified.txHash) throw new ChallengeConflictError(verified.detail || "WoloChain did not verify this signed deposit.");
    verifiedHash = verified.txHash;
  }
  const now = new Date();
  await prisma.$transaction(async tx => {
    await lockChampionship(tx,row);
    const current = await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id},include:CHAMPIONSHIP_INCLUDE});
    if(!["open","ready"].includes(current.state) || current.defenseStartedAt || current.challengeDeadline <= now) throw new ChallengeConflictError("The Challenge deadline or state changed during the action.");
    const seat = current.participants.find(p => p.userId === actorUserId)!;
    if(action === "decline" || action === "cancel") {
      // A defender decline is durable default evidence. It must not erase a funded claimant's title right.
      if(action === "decline" && seat.side === "defender" && current.trophyId) {
        await audit(tx,current,"title_challenge_participant_declined","DEFENDER_NOT_READY",actorUserId,{side:seat.side,seat:seat.seat},now);
        return;
      }
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:action === "decline" ? "declined":"cancelled",reasonCode:"CHALLENGER_NOT_READY"}});
      await tx.scheduledMatch.updateMany({where:{id:{in:legIds(current)}},data:{status:"cancelled",cancelledAt:now,resultAt:now,settlementReadyAt:now}});
    } else if(action === "accept") {
      if(!seat.acceptedAt) {
        await tx.championshipChallengeParticipant.update({where:{id:seat.id},data:{acceptedAt:now}});
        if(seat.side === "defender") await tx.scheduledMatch.update({where:{id:seat.fundingScheduledMatchId},data:{acceptedAt:now,status:"terms_accepted"}});
      }
      await audit(tx,current,"title_challenge_participant_accepted",null,actorUserId,{side:seat.side,seat:seat.seat},now);
    } else {
      if(!seat.acceptedAt) throw new ChallengeConflictError("Roster acceptance changed during funding.");
      const user = await tx.user.findUniqueOrThrow({where:{id:actorUserId},select:{walletAddress:true,steamId:true}});
      if(user.walletAddress !== payload.fundingWalletAddress || user.steamId !== seat.steamIdSnapshot) throw new ChallengeConflictError("Linked identity changed during funding verification.");
      const leg = await tx.scheduledMatch.findUniqueOrThrow({where:{id:seat.fundingScheduledMatchId}});
      const existing = await tx.scheduledMatchFundingProof.findUnique({where:{txHash:verifiedHash!}});
      if(existing) {
        if(existing.scheduledMatchId === leg.id && existing.participantSide === seat.fundingSide && existing.walletAddress === user.walletAddress) return;
        throw new ChallengeConflictError("That signed funding transaction is already consumed.");
      }
      await tx.scheduledMatchFundingProof.create({data:{scheduledMatchId:leg.id,participantSide:seat.fundingSide,txHash:verifiedHash!,walletAddress:user.walletAddress!,amountWolo:leg.wagerAmountWolo+leg.guaranteeAmountWolo,createdAt:now}});
      await tx.championshipChallengeParticipant.update({where:{id:seat.id},data:{walletAddressSnapshot:user.walletAddress}});
      const isLeft = seat.fundingSide === "left";
      const both = isLeft ? Boolean(leg.challengedFundedAt) : Boolean(leg.challengerFundedAt);
      await tx.scheduledMatch.update({where:{id:leg.id},data:{status:both?"funded":isLeft?"creator_funded":"opponent_funded",...(isLeft?{challengerFundedAt:now,challengerFundingTxHash:verifiedHash,challengerFundingWalletAddress:user.walletAddress}:{challengedFundedAt:now,challengedFundingTxHash:verifiedHash,challengedFundingWalletAddress:user.walletAddress}),fundBy:current.challengeDeadline,playBy:current.challengeDeadline}});
      await audit(tx,current,"title_challenge_funded",null,actorUserId,{side:seat.side,seat:seat.seat,fundingChallengeId:leg.id,txHash:verifiedHash},now);
    }
    const refreshed = await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id},include:CHAMPIONSHIP_INCLUDE});
    const participants = await participantProofs(tx,refreshed);
    if(participants.every(p => p.accepted && p.funded) && ["open","ready"].includes(refreshed.state)) {
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:"ready"}});
      await tx.scheduledMatch.update({where:{id:challengeId},data:{status:"funded",acceptedAt:refreshed.participants.filter(p => p.side === "defender").reduce((latest,p) => p.acceptedAt && p.acceptedAt > latest ? p.acceptedAt:latest,refreshed.createdAt)}});
      if(refreshed.state !== "ready") await audit(tx,refreshed,"title_challenge_ready",null,null,{},now);
    }
  },{timeout:30_000});
  if(action === "cancel" || action === "decline" && participant.side === "challenger") for(const id of legIds(row)) await (dependencies.executeSettlement??executeScheduledMatchSettlement)(prisma,id,actorUserId).catch(error => console.error(`Refund ${id} queued:`,error));
  return true;
}
function battleProof(session: LiveGameSession,row:ProtocolRow,participants:ChampionshipParticipantProof[]):ChampionshipBattleProof {
  const base={id:session.id,sessionKey:session.sessionKey,startedAt:null,mode:replayEloLane(session.gameType),state:session.state,finalProofPending:session.finalProofPending,desync:session.disconnectDetected,watcherParticipantUids:session.authenticatedWatcherParticipantUids ?? [],players:session.players};
  if(row.defenseStartedAt && row.defenseSessionKey===session.sessionKey) {
    const frozen=row.defenseProof as ChampionshipBattleProof|null;
    return {...base,startedAt:row.defenseStartedAt.toISOString(),startProvenance:"preserved_defense_start",startWatcherParticipantUids:frozen?.startWatcherParticipantUids??[]};
  }
  for(const observation of session.authenticatedLiveObservations??[]) {
    const observedProof:ChampionshipBattleProof={...base,startedAt:observation.observedAt,mode:replayEloLane(observation.gameType),players:observation.players,startProvenance:"authenticated_live_observation",startWatcherParticipantUids:[observation.uid]};
    if(validateChampionshipBattleStart({...row,participants,battle:observedProof}).ok)return {...base,startedAt:observation.observedAt,startProvenance:"authenticated_live_observation",startWatcherParticipantUids:[observation.uid]};
  }
  return base;
}
async function championshipResultSession(
  tx: Pick<Prisma.TransactionClient, "replayResultAdjudication">,
  session: LiveGameSession
): Promise<LiveGameSession> {
  if (session.state !== "completed") return session;

  const adjudication = await tx.replayResultAdjudication.findFirst({
    where: {
      gameStatsId: session.id,
      decisionStatus: "accepted",
      sourceReplayHash: session.replayHash,
      sourceParseIteration: session.parseIteration,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      idempotencyKey: true,
      decisionStatus: true,
      affectsStats: true,
      affectsBets: true,
      actorDisplayNameSnapshot: true,
      actorRole: true,
      teamAssignments: true,
      winningTeamKey: true,
      winningPlayerKeys: true,
      reason: true,
      evidence: true,
      sourceReplayHash: true,
      sourceParseIteration: true,
      sourceRosterHash: true,
      sourcePropositionHash: true,
      createdAt: true,
    },
  });

  if (!replayResultAdjudicationAuthorizesChampionship(adjudication)) {
    return session;
  }

  const projected = applyReplayResultAdjudication(
    session,
    adjudication as EffectiveReplayResultAdjudication
  ) as LiveGameSession;

  if (projected === session || !projected.winner) {
    return session;
  }

  const winnerBySteamId = new Map(
    projected.players
      .filter((player) => Boolean(player.steamId))
      .map((player) => [player.steamId as string, player.winner === true])
  );

  return {
    ...session,
    winner: projected.winner,
    players: session.players.map((player) => ({
      ...player,
      winner:
        player.steamId && winnerBySteamId.has(player.steamId)
          ? winnerBySteamId.get(player.steamId) === true
          : player.winner,
    })),
  };
}

async function readinessPrecedesStart(tx:Pick<PrismaClient,"scheduledMatchFundingProof">,row:ProtocolRow,startedAt:Date) {
  if(row.participants.some(p=>!p.acceptedAt||p.acceptedAt>startedAt))return false;
  const deposits=await tx.scheduledMatchFundingProof.findMany({where:{scheduledMatchId:{in:legIds(row)}}});
  return deposits.every(deposit=>deposit.createdAt<=startedAt);
}
export async function reconcileChampionshipEvidence(prisma: PrismaClient, options:{now?:Date;take?:number;executeSettlements?:boolean;challengeIds?:number[]}={},dependencies:{loadSnapshot?:typeof loadLiveSessionSnapshot}={}) {
  const now = options.now ?? new Date();
  const resolved:number[] = [];
  const rows = await prisma.championshipChallenge.findMany({where:{scheduledMatchId:options.challengeIds?{in:options.challengeIds}:undefined,state:{in:AUTOMATIC_EVIDENCE},commissionerActionAt:null},include:CHAMPIONSHIP_INCLUDE,take:options.take ?? 100,orderBy:{createdAt:"asc"}});
  if(!rows.length)return resolved;
  const evidenceParticipantUids=[...new Set(rows.flatMap(row=>row.participants.map(participant=>participant.uidSnapshot)))];
  const snapshot = await (dependencies.loadSnapshot ?? loadLiveSessionSnapshot)(
    prisma,
    {
      evidenceLookbackMs:
        CHAMPIONSHIP_CHALLENGE_WINDOW_MS +
        CHAMPIONSHIP_COMMISSIONER_GRACE_MS,
      evidenceParticipantUids,
    }
  );
  if(!snapshot.recentlyCompletedSessions.length&&!snapshot.activeSessions.length)return resolved;
  for(const row of rows) {
    if(row.commissionerActionAt || row.state === "commissioner_review") continue;
    const participants = await participantProofs(prisma,row);
    const sessions = [...snapshot.recentlyCompletedSessions,...snapshot.activeSessions].filter(session => !row.defenseSessionKey || session.sessionKey === row.defenseSessionKey);
    for(const session of sessions) {
      const proof = battleProof(session,row,participants);
      const input = {...row,participants,battle:proof};
      const start = validateChampionshipBattleStart(input);
      if(!start.ok) {
        // A signed final may contradict default while lacking a trustworthy server-observed start.
        // Preserve it for review; a client/header timestamp cannot award custody or freeze a defense.
        const signedDefenders=participants.filter(p=>p.side==="defender"&&session.authenticatedWatcherParticipantUids?.includes(p.uid)).map(p=>p.uid);
        const plausible=validateChampionshipBattleStart({...input,battle:{...proof,startedAt:session.playedOn,startProvenance:"authenticated_live_observation",startWatcherParticipantUids:signedDefenders}});
        if(now>=row.challengeDeadline&&session.state==="completed"&&plausible.ok)await prisma.$transaction(async tx=>{
          await acquireChallengeDesyncAdvisoryLock(tx,row.scheduledMatchId);
          await tx.$queryRaw`SELECT 1::int AS lock_acquired FROM pg_advisory_xact_lock(${session.id})`;
          await lockChampionship(tx,row);
          const current=await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id}});
          if(!AUTOMATIC_EVIDENCE.includes(current.state)||current.defenseStartedAt||current.commissionerActionAt)return;
          await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode:"WATCHER_PROOF_MISSING"}});
          await tx.scheduledMatch.update({where:{id:row.scheduledMatchId},data:{status:"result_pending"}});
          await audit(tx,current,"title_capture_blocked","WATCHER_PROOF_MISSING",null,{replayId:session.id,parsedStartAt:session.playedOn,trustedStartObserved:false},now);
        });
        continue;
      }
      if(!await readinessPrecedesStart(prisma,row,start.startedAt))continue;
      const matching = await prisma.championshipChallenge.findMany({where:{state:{in:["open","ready","default_grace"]},defenseSessionKey:null},include:CHAMPIONSHIP_INCLUDE});
      const eligibleMatches:ProtocolRow[]=[];
      for(const other of matching) {
        const otherParticipants=await participantProofs(prisma,other);
        const otherStart=validateChampionshipBattleStart({...other,participants:otherParticipants,battle:battleProof(session,other,otherParticipants)});
        if(otherStart.ok&&await readinessPrecedesStart(prisma,other,otherStart.startedAt))eligibleMatches.push(other);
      }
      if(!row.defenseSessionKey && eligibleMatches.length>1) {
        await prisma.$transaction(async tx=>{
          for(const other of [...eligibleMatches].sort((a,b)=>a.scheduledMatchId-b.scheduledMatchId))await acquireChallengeDesyncAdvisoryLock(tx,other.scheduledMatchId);
          await tx.$queryRaw`SELECT 1::int AS lock_acquired FROM pg_advisory_xact_lock(${session.id})`;
          await lockChampionships(tx,eligibleMatches);
          await tx.championshipChallenge.updateMany({where:{id:{in:eligibleMatches.map(other=>other.id)},defenseSessionKey:null,state:{in:["open","ready","default_grace"]}},data:{state:"commissioner_review",reasonCode:"TITLE_ALREADY_COMMITTED"}});
          await tx.scheduledMatch.updateMany({where:{id:{in:eligibleMatches.map(other=>other.scheduledMatchId)}},data:{status:"result_pending"}});
        });
        continue;
      }
      const completed=await prisma.$transaction(async tx => {
        await acquireChallengeDesyncAdvisoryLock(tx,row.scheduledMatchId);
        await tx.$queryRaw`SELECT 1::int AS lock_acquired FROM pg_advisory_xact_lock(${session.id})`;
        await lockChampionship(tx,row);
        const current = await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id},include:CHAMPIONSHIP_INCLUDE});
        if(!ACTIVE.includes(current.state) || current.commissionerActionAt || current.state === "commissioner_review") return;
        const currentParticipants=await participantProofs(tx,current);
        const resultSession=await championshipResultSession(tx,session);
        const currentProof=battleProof(resultSession,current,currentParticipants);
        const currentInput={...current,participants:currentParticipants,battle:currentProof};
        const lockedStart=validateChampionshipBattleStart(currentInput);
        if(!lockedStart.ok||!await readinessPrecedesStart(tx,current,lockedStart.startedAt))return;
        const final=validateChampionshipBattleFinal(currentInput);
        const conflicting = await tx.championshipChallenge.findFirst({where:{defenseSessionKey:session.sessionKey,id:{not:row.id}}});
        if(conflicting) {await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode:"TITLE_ALREADY_COMMITTED"}});return;}
        if(current.defenseSessionKey && current.defenseSessionKey !== session.sessionKey) return;
        if(current.trophyId) {
          const trophy = await tx.trophy.findUniqueOrThrow({where:{id:current.trophyId}});
          const custody = await getChampionshipCustody(tx,trophy);
          if(custody.epoch !== current.expectedCustodyEpoch) {await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode:"TITLE_CUSTODY_CHANGED"}}); await audit(tx,current,"title_capture_blocked","TITLE_CUSTODY_CHANGED"); return;}
        }
        if(!current.defenseStartedAt) {
          await tx.championshipChallenge.update({where:{id:row.id},data:{state:"defense_in_progress",defenseStartedAt:lockedStart.startedAt,defenseSessionKey:session.sessionKey,defenseProof:currentProof as unknown as Prisma.InputJsonValue}});
          await tx.scheduledMatch.update({where:{id:row.scheduledMatchId},data:{status:"live_confirmed",liveConfirmedAt:lockedStart.startedAt,linkedSessionKey:session.sessionKey,linkedMapName:session.mapName}});
          await audit(tx,current,"title_defense_started",null,null,{sessionKey:session.sessionKey,startedAt:lockedStart.startedAt.toISOString()},now);
        }
        if(session.state !== "completed") return;
        const incidents=await loadDesyncIncidentsForSettlement(tx,{gameStatsId:session.id,scheduledMatchId:row.scheduledMatchId});
        let desync=false;
        try {
          assertTitleTransferAllowed({incidents,competitiveCandidate:{gameStatsId:session.id,observedAt:now}});
          assertWinnerSettlementAllowed({incidents,competitiveCandidate:{gameStatsId:session.id,observedAt:now}});
        } catch { desync=true; }
        if(!final.ok || desync) {
          const reasonCode = desync ? "MATCH_DESYNC" : !final.ok ? final.code:"REPLAY_RESULT_AMBIGUOUS";
          await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode}});
          await tx.scheduledMatch.update({where:{id:row.scheduledMatchId},data:{status:"result_pending"}});
          await audit(tx,current,"title_capture_blocked",reasonCode,null,{replayId:session.id},now);
          return;
        }
        const claimed = await tx.scheduledMatchReplayClaim.findUnique({where:{gameStatsId:session.id}});
        if(claimed && claimed.scheduledMatchId !== row.scheduledMatchId) throw new ChallengeConflictError("Canonical replay already belongs to another Challenge.");
        const replayClaim = claimed ?? await tx.scheduledMatchReplayClaim.create({data:{scheduledMatchId:row.scheduledMatchId,gameStatsId:session.id,linkedSessionKeySnapshot:session.sessionKey,claimSource:"championship_reconciler"}});
        const winnerSide = final.winnerSide;
        if(current.trophyId && winnerSide === "challenger") {
          await transitionChampionshipCustody(tx,{trophyId:current.trophyId,requestKey:`championship-result:${row.id}:${session.id}`,expectedEpoch:current.expectedCustodyEpoch!,expectedRosterUserIds:current.participants.filter(p => p.side === "defender").map(p => p.userId),nextRosterUserIds:current.participants.filter(p => p.side === winnerSide).sort((a,b)=>a.seat-b.seat).map(p => p.userId),reason:"match",challengeId:current.trophyChallengeId ?? undefined,replayId:session.id,eligibilityOverride:current.eligibilityOverride,eligibilityOverrideReceipt:sealedCandidates(current).overrideReceipt,eligibilityCandidates:sealedCandidates(current).candidates,now});
        }
        await tx.championshipChallenge.update({where:{id:row.id},data:{state:"completed",winnerSide,resultReplayId:session.id,reasonCode:null}});
        if(current.trophyChallengeId) await tx.trophyChallenge.update({where:{id:current.trophyChallengeId},data:{status:"settled",settlementStatus:winnerSide === "challenger" ? "app_custody_transferred":"holder_retained",winnerUserId:current.participants.find(p=>p.side===winnerSide&&p.seat===0)!.userId,replayId:session.id,verificationSummary:"Complete sealed roster, participant Watcher coverage and final replay winner verified."}});
        await tx.scheduledMatch.updateMany({where:{id:{in:legIds(current)}},data:{status:"completed",resultWinnerSide:winnerSide === "challenger"?"challenger":"challenged",linkedSessionKey:session.sessionKey,linkedMapName:session.mapName,linkedWinner:resultSession.winner,linkedDurationSeconds:session.durationSeconds,resultAt:now,settlementReadyAt:now,liveConfirmedAt:lockedStart.startedAt}});
        await tx.scheduledMatch.update({where:{id:row.scheduledMatchId},data:{currentReplayClaimId:replayClaim.id}});
        await audit(tx,current,"title_result_verified",null,null,{replayId:session.id,winnerSide},now);
        resolved.push(row.scheduledMatchId);
        return true;
      },{timeout:30_000});
      if(completed && options.executeSettlements) for(const legId of legIds(row)) await executeScheduledMatchSettlement(prisma,legId,null).catch(error=>console.error(`Championship settlement ${legId} remains queued:`,error));
      break;
    }
  }
  return resolved;
}

async function notifyDefaultGrace(prisma: PrismaClient,row: ProtocolRow,now:Date) {
  await prisma.$transaction(async tx => {
    await lockChampionship(tx,row);
    const current = await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id}});
    if(current.graceNotifiedAt || current.state !== "default_grace") return;
    const admins = await tx.user.findMany({where:{isAdmin:true},select:{id:true}});
    for(const admin of admins) {
      const sender = row.participants.find(p=>p.userId!==admin.id);
      if(sender) await postChallengeInboxNotice(tx,{senderUserId:sender.userId,targetUserId:admin.id,challengeId:row.scheduledMatchId,body:["Challenge result review","TITLE DEFENSE DEFAULT",row.titleName || "Championship",`Commissioner grace deadline ISO: ${row.commissionerGraceDeadline.toISOString()}`,"Status: One-hour Commissioner grace. Inspect the championship cockpit before automatic disposition."].join("\n"),now});
    }
    await tx.championshipChallenge.update({where:{id:row.id},data:{graceNotifiedAt:now}});
  });
}
async function defaultDisposition(prisma: PrismaClient,row: ProtocolRow,now:Date,forced=false,actorUserId?:number,reason?:string) {
  await prisma.$transaction(async tx => {
    const preliminaryPeers=row.trophyId ? await tx.championshipChallenge.findMany({where:{trophyId:row.trophyId,expectedCustodyEpoch:row.expectedCustodyEpoch,state:{in:ACTIVE}},select:{id:true,trophyId:true,scheduledMatchId:true}}) : [{id:row.id,trophyId:null,scheduledMatchId:row.scheduledMatchId}];
    if(!preliminaryPeers.some(peer=>peer.id===row.id))preliminaryPeers.push({id:row.id,trophyId:row.trophyId,scheduledMatchId:row.scheduledMatchId});
    for(const peer of [...preliminaryPeers].sort((a,b)=>a.scheduledMatchId-b.scheduledMatchId)) await acquireChallengeDesyncAdvisoryLock(tx,peer.scheduledMatchId);
    // Shared order: desync -> title -> protocol -> Trophy money.
    await lockChampionships(tx,preliminaryPeers);
    const current = await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id},include:CHAMPIONSHIP_INCLUDE});
    if(!ACTIVE.includes(current.state)||(!forced&&current.commissionerActionAt))return;
    if(current.defenseStartedAt) {if(forced)throw new ChallengeConflictError("A proven defense start blocks title default.");return;}
    const participants = await participantProofs(tx,current);
    const incidents=await loadDesyncIncidentsForSettlement(tx,{gameStatsId:current.resultReplayId,scheduledMatchId:row.scheduledMatchId});
    try {assertTitleTransferAllowed({incidents});} catch {
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode:"MATCH_DESYNC"}});
      await audit(tx,current,"title_capture_blocked","MATCH_DESYNC",actorUserId);return;
    }
    const decision = championshipDefaultDecision({...current,participants,commissionerActionAt:forced?null:current.commissionerActionAt,state:forced?"default_grace":current.state},forced?new Date(Math.max(now.getTime(),current.commissionerGraceDeadline.getTime())):now);
    if(current.trophyId && ["wait","hold","grace"].includes(decision)) return;
    if(!current.trophyId || decision === "invalid_claimant") {
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:"expired",reasonCode:decision==="invalid_claimant"?"CHALLENGER_NOT_READY":null}});
      await tx.scheduledMatch.updateMany({where:{id:{in:legIds(current)}},data:{status:"expired",expiredAt:now,resultAt:now,settlementReadyAt:now}});
      if(current.trophyChallengeId) await tx.trophyChallenge.update({where:{id:current.trophyChallengeId},data:{status:"cancelled",settlementStatus:"cancelled",errorState:"CHALLENGER_NOT_READY"}});
      await audit(tx,current,"title_capture_blocked","CHALLENGER_NOT_READY",actorUserId,{reason:reason??null},now);
      return;
    }
    if(decision === "review") {
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode:participants.every(p=>p.notified)?"MATCH_NOT_STARTED_BEFORE_DEADLINE":"DEFENDER_NOTIFICATION_UNPROVEN"}});
      await tx.scheduledMatch.update({where:{id:row.scheduledMatchId},data:{status:"result_pending"}});
      await audit(tx,current,"title_default_contested","MATCH_NOT_STARTED_BEFORE_DEADLINE",actorUserId,{reason:reason??null},now);
      return;
    }
    const peers = await tx.championshipChallenge.findMany({where:{trophyId:current.trophyId,expectedCustodyEpoch:current.expectedCustodyEpoch,state:{in:ACTIVE}},include:CHAMPIONSHIP_INCLUDE,orderBy:{id:"asc"}});
    if(peers.some(peer=>!preliminaryPeers.some(locked=>locked.scheduledMatchId===peer.scheduledMatchId))) throw new ChallengeConflictError("The championship contender set changed during default review; retry safely.");
    if(peers.some(peer => peer.defenseStartedAt)) {
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode:"TITLE_ALREADY_COMMITTED"}});return;
    }
    const valid:ProtocolRow[]=[];
    for(const peer of peers) {
      if(peer.commissionerActionAt && peer.id !== current.id) continue;
      const peerIncidents=await loadDesyncIncidentsForSettlement(tx,{gameStatsId:peer.resultReplayId,scheduledMatchId:peer.scheduledMatchId});
      try {assertTitleTransferAllowed({incidents:peerIncidents});} catch {continue;}
      const claims = (await participantProofs(tx,peer)).filter(p=>p.side==="challenger");
      const deposits=await tx.scheduledMatchFundingProof.findMany({where:{scheduledMatchId:{in:legIds(peer)},participantSide:"left"}});
      if(claims.length===peer.teamSize && claims.every(p=>p.accepted&&p.funded) && peer.participants.filter(p=>p.side==="challenger").every(p=>p.acceptedAt&&p.acceptedAt<peer.challengeDeadline) && deposits.every(p=>p.createdAt<peer.challengeDeadline)) valid.push(peer);
    }
    // Seal title-specific challenger eligibility, revalidate live nationality/division, and never count an ineligible claimant.
    const trophy = await tx.trophy.findUniqueOrThrow({where:{id:current.trophyId}});
    const custody=await getChampionshipCustody(tx,trophy);
    if(custody.epoch!==current.expectedCustodyEpoch) {
      await tx.championshipChallenge.update({where:{id:current.id},data:{state:"commissioner_review",reasonCode:"TITLE_CUSTODY_CHANGED"}});
      await audit(tx,current,"title_capture_blocked","TITLE_CUSTODY_CHANGED",actorUserId);return;
    }
    const eligible:ProtocolRow[]=[];
    for(const peer of valid) {
      const candidates = await Promise.all(peer.participants.filter(p=>p.side==="challenger").map(async p=>{const live=await tx.user.findUniqueOrThrow({where:{id:p.userId}});return {...sealedCandidates(peer).candidates.find(c=>c.userId===p.userId),userId:p.userId,representedCountry:live.representedCountry,genderDivision:live.genderDivision};}));
      if(candidates.every(candidate => championshipEligibility(trophy,candidate,peer.eligibilityOverride).eligible)) eligible.push(peer);
    }
    if(!eligible.some(peer=>peer.id===current.id)) {
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:"commissioner_review",reasonCode:"WINNER_NOT_ELIGIBLE"}});return;
    }
    const claimant = eligible[0]!;
    const contenderSides = new Map<string,ProtocolRow>();
    for(const peer of eligible) contenderSides.set(peer.participants.filter(p=>p.side==="challenger").map(p=>p.userId).sort((a,b)=>a-b).join(":"),peer);
    const dispute = contenderSides.size>1;
    const nextRoster = claimant.participants.filter(p=>p.side==="challenger").sort((a,b)=>a.seat-b.seat).map(p=>p.userId);
    const candidates = sealedCandidates(claimant).candidates;
    await transitionChampionshipCustody(tx,{trophyId:current.trophyId,requestKey:`championship-default:${current.trophyId}:${current.expectedCustodyEpoch}`,expectedEpoch:current.expectedCustodyEpoch!,expectedRosterUserIds:current.participants.filter(p=>p.side==="defender").map(p=>p.userId),nextRosterUserIds:dispute?[]:nextRoster,reason:dispute?"dispute":"default",toDispute:dispute,actorUserId,challengeId:claimant.trophyChallengeId,eligibilityOverride:!dispute&&claimant.eligibilityOverride,eligibilityOverrideReceipt:sealedCandidates(claimant).overrideReceipt,eligibilityCandidates:candidates,now,note:reason});
    if(dispute) await tx.championshipTitleDispute.upsert({where:{trophyId_custodyEpoch:{trophyId:current.trophyId,custodyEpoch:current.expectedCustodyEpoch!}},create:{trophyId:current.trophyId,custodyEpoch:current.expectedCustodyEpoch!,contenderSnapshot:[...contenderSides.values()].map(peer=>({challengeId:peer.scheduledMatchId,roster:peer.participants.filter(p=>p.side==="challenger").map(p=>({userId:p.userId,steamId:p.steamIdSnapshot,seat:p.seat}))}))},update:{}});
    for(const peer of eligible) {
      await tx.championshipChallenge.update({where:{id:peer.id},data:{state:dispute?"disputed":"defaulted",winnerSide:dispute?null:"challenger",reasonCode:dispute?"MULTIPLE_CHALLENGERS_PLAYOFF_REQUIRED":null,...(forced?{commissionerActionAt:now,commissionerUserId:actorUserId,commissionerReason:reason}: {})}});
      await tx.scheduledMatch.updateMany({where:{id:{in:legIds(peer)}},data:{status:"expired",expiredAt:now,resultAt:now,settlementReadyAt:now}});
      if(peer.trophyChallengeId) await tx.trophyChallenge.update({where:{id:peer.trophyChallengeId},data:{status:dispute?"disputed":"settled",settlementStatus:dispute?"playoff_required":"default_app_custody_transferred"}});
      await audit(tx,peer,dispute?"title_dispute_created":"title_default_executed",dispute?"MULTIPLE_CHALLENGERS_PLAYOFF_REQUIRED":null,actorUserId,{contenderChallengeIds:eligible.map(peer=>peer.scheduledMatchId),reason:reason??null},now);
    }
  },{timeout:60_000});
}
export async function reconcileChampionshipChallenges(prisma: PrismaClient,options:{now?:Date;take?:number;executeRefunds?:boolean;challengeIds?:number[]}={}) {
  const now=options.now??new Date();
  // Evidence runs first: even delayed final processing may prove a start that occurred inside the original window.
  const resolved = await reconcileChampionshipEvidence(prisma,{now,take:options.take,executeSettlements:options.executeRefunds,challengeIds:options.challengeIds});
  const rows=await prisma.championshipChallenge.findMany({where:{scheduledMatchId:options.challengeIds?{in:options.challengeIds}:undefined,state:{in:["open","ready","default_grace"]},defenseStartedAt:null,commissionerActionAt:null,challengeDeadline:{lte:now}},include:CHAMPIONSHIP_INCLUDE,orderBy:{challengeDeadline:"asc"},take:options.take??100});
  const paymentAttempted:number[]=[],paymentExecuted:number[]=[],paymentFailed:Array<{challengeId:number;detail:string}>=[];
  for(const row of rows) {
    if(row.defenseStartedAt || row.commissionerActionAt || row.state==="commissioner_review")continue;
    if(row.trophyId && row.state !== "default_grace") await prisma.$transaction(async tx=>{
      await lockChampionship(tx,row);
      const current=await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id}});
      if(current.defenseStartedAt||current.commissionerActionAt||!["open","ready"].includes(current.state))return;
      await tx.championshipChallenge.update({where:{id:row.id},data:{state:"default_grace"}});
      await tx.scheduledMatch.update({where:{id:row.scheduledMatchId},data:{status:"result_pending"}});
      if(row.trophyChallengeId)await tx.trophyChallenge.update({where:{id:row.trophyChallengeId},data:{status:"forfeit_pending_commissioner",settlementStatus:"commissioner_default_review"}});
      await audit(tx,current,"title_default_grace_started",null,null,{deadline:row.challengeDeadline.toISOString(),graceDeadline:row.commissionerGraceDeadline.toISOString()},now);
    });
    if(row.trophyId) await notifyDefaultGrace(prisma,{...row,state:"default_grace"},now);
    if(now >= row.commissionerGraceDeadline || !row.trophyId) await defaultDisposition(prisma,row,now);
  }
  if(options.executeRefunds) {
    const terminal=await loadActionableChampionshipPayments(prisma,options.take??100,now,options.challengeIds);
    for(const row of terminal)for(const legId of legIds(row)) {
      const [funding,paid]=await Promise.all([prisma.scheduledMatchFundingProof.aggregate({where:{scheduledMatchId:legId},_sum:{amountWolo:true}}),prisma.scheduledMatchSettlement.aggregate({where:{scheduledMatchId:legId,status:"executed",txHash:{not:null}},_sum:{amountWolo:true}})]);
      if((funding._sum.amountWolo??0)<=(paid._sum.amountWolo??0))continue;
      paymentAttempted.push(legId);
      try {const outcome=await executeScheduledMatchSettlement(prisma,legId,null);if(outcome.plan.state==="executed")paymentExecuted.push(legId);else paymentFailed.push({challengeId:legId,detail:outcome.execution.detail??"Chain payment remains unproven."});}
      catch(error){paymentFailed.push({challengeId:legId,detail:error instanceof Error?error.message:"Chain payment remains unproven."});}
    }
  }
  return {examined:rows.length,resolved,paymentAttempted,paymentExecuted,paymentFailed};
}
/** Rotate outstanding verified principal by oldest payment attempt; paid history cannot consume the worker batch. */
export async function loadActionableChampionshipPayments(prisma:PrismaClient,take=100,now=new Date(),challengeIds?:number[]) {
  if(challengeIds?.length===0)return [];
  const retryCutoff=new Date(now.getTime()-15*60*1000);
  const challengeIdCsv=challengeIds?.join(",")??"";
  const limit=Math.max(1,Math.min(500,Math.floor(take)));
  const ids=await prisma.$queryRaw<Array<{id:number}>>`
    WITH challenge_filter AS (
      SELECT ${challengeIdCsv}::text AS ids
    ), legs AS (
      SELECT id AS protocol_id,scheduled_match_id FROM championship_challenges
      UNION ALL SELECT protocol_id,scheduled_match_id FROM championship_challenge_legs
    )
    SELECT c.id FROM championship_challenges c
    CROSS JOIN challenge_filter cf
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(p.amount_wolo),0) AS funded FROM scheduled_match_funding_proofs p
      JOIN legs l ON l.scheduled_match_id=p.scheduled_match_id WHERE l.protocol_id=c.id
    ) funding
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(s.amount_wolo) FILTER (WHERE s.status='executed' AND NULLIF(s.tx_hash,'') IS NOT NULL),0) AS paid,
             MAX(s.last_attempt_at) AS last_attempt,
             COUNT(*) FILTER (WHERE s.status<>'executed' OR NULLIF(s.tx_hash,'') IS NULL) AS outstanding_rows,
             BOOL_OR(s.attempt_count<8 AND (s.last_attempt_at IS NULL OR s.last_attempt_at<=${retryCutoff})) FILTER (WHERE s.status<>'executed' OR NULLIF(s.tx_hash,'') IS NULL) AS retry_due
      FROM scheduled_match_settlements s JOIN legs l ON l.scheduled_match_id=s.scheduled_match_id WHERE l.protocol_id=c.id AND s.status<>'superseded'
    ) payment
    WHERE c.state IN ('completed','defaulted','disputed','cancelled','declined','expired') AND funding.funded>payment.paid
      AND (payment.outstanding_rows=0 OR payment.retry_due=true)
      AND (cf.ids='' OR c.scheduled_match_id = ANY(string_to_array(cf.ids, ',')::int[]))
    ORDER BY payment.last_attempt ASC NULLS FIRST,c.created_at ASC,c.id ASC LIMIT ${limit}
  `;
  const rows=await prisma.championshipChallenge.findMany({where:{id:{in:ids.map(row=>row.id)}},include:CHAMPIONSHIP_INCLUDE});
  return ids.map(id=>rows.find(row=>row.id===id.id)!);
}
export async function commissionerChampionshipAction(prisma:PrismaClient,actorUserId:number,input:{challengeId:number;action:string;reason:string;extensionHours?:number}) {
  const row=await prisma.championshipChallenge.findUnique({where:{scheduledMatchId:input.challengeId},include:CHAMPIONSHIP_INCLUDE});
  if(!row)throw new ChallengeConflictError("Championship Challenge not found.",404);
  const reason=input.reason?.trim();
  if(!reason||reason.length<5)throw new ChallengeConflictError("Record a concrete Commissioner reason.",400);
  const admin=await prisma.user.findUnique({where:{id:actorUserId},select:{isAdmin:true}});
  if(!admin?.isAdmin)throw new ChallengeConflictError("Commissioner authority required.",403);
  const now=new Date();
  if(input.action==="force_default") {if(!ACTIVE.includes(row.state))throw new ChallengeConflictError("This Challenge already reached a durable disposition.");await defaultDisposition(prisma,row,now,true,actorUserId,reason);return;}
  if(!["protect","veto","extend","review","acknowledge_evidence"].includes(input.action))throw new ChallengeConflictError("Unknown Commissioner action.",400);
  await prisma.$transaction(async tx=>{
    await lockChampionship(tx,row);
    const current=await tx.championshipChallenge.findUniqueOrThrow({where:{id:row.id},include:CHAMPIONSHIP_INCLUDE});
    if(!ACTIVE.includes(current.state))throw new ChallengeConflictError("This Challenge has already reached a durable disposition.");
    if(input.action==="extend"&&current.defenseStartedAt)throw new ChallengeConflictError("The defense already started; preserve its original proof.");
    const hours=Math.max(1,Math.min(168,Math.floor(input.extensionHours??24)));
    const deadline=new Date(now.getTime()+hours*60*60*1000);
    await tx.championshipChallenge.update({where:{id:row.id},data:{state:input.action==="extend"?"open":"commissioner_review",reasonCode:input.action==="veto"?"COMMISSIONER_VETO":"COMMISSIONER_OVERRIDE",commissionerActionAt:input.action==="extend"?null:now,commissionerUserId:actorUserId,commissionerReason:reason,...(input.action==="extend"?{challengeDeadline:deadline,commissionerGraceDeadline:new Date(deadline.getTime()+60*60*1000),graceNotifiedAt:null}: {})}});
    await tx.scheduledMatch.update({where:{id:row.scheduledMatchId},data:{status:input.action==="extend"?"funded":"result_pending",...(input.action==="extend"?{acceptBy:deadline,fundBy:deadline,playBy:deadline,scheduledAt:deadline}: {})}});
    await audit(tx,current,"title_commissioner_override",input.action==="veto"?"COMMISSIONER_VETO":"COMMISSIONER_OVERRIDE",actorUserId,{action:input.action,reason,previousState:current.state,originalDeadline:current.challengeDeadline.toISOString(),nextDeadline:input.action==="extend"?deadline.toISOString():null},now);
  });
}
