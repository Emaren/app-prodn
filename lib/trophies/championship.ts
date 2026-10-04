import type { Prisma, PrismaClient, Trophy } from "@/lib/generated/prisma";
import { championshipBeltPolicy, championshipEligibility, soloDefenseLadder, splitTitleUwolo, type BeltCandidate } from "@/lib/champions/beltPolicy";
import { lockTrophyMoneyState, prepareManualTrophyHolderTransferPayouts, prepareTrophyCustodyExit, projectedTrophyBounty, loadPublicTrophies, seededTrophyDefinition, trophyIsPubliclyForcedVacant } from "@/lib/trophies/service";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { parsePlayers, readPlayerSteamDmRating, readPlayerSteamRmRating } from "@/lib/gameStatsView";
import { readLeaderboardSteamId } from "@/lib/leaderboardIdentity";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import { syncChampionshipBeltHonorMirror } from "@/lib/trophies/beltHonorMirror";

export class ChampionshipCustodyError extends Error {
  status = 409;
  reasonCode: string;
  constructor(reasonCode: string, message: string) { super(message); this.reasonCode = reasonCode; this.name = "ChampionshipCustodyError"; }
}
export type ChampionshipRosterMember = { userId: number; uid: string; displayName: string; walletAddress: string | null; steamId: string | null; seat: number; nftId?: string; nftClassId?: string | null };
type Db = PrismaClient | Prisma.TransactionClient;

// Custody writers share the protocol title lock before taking the money lock.
export async function acquireChampionshipTitleLock(tx: Prisma.TransactionClient, trophyId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(752008, ${trophyId})`;
}

type CustodyTransitionInput = {
  trophyId: number; requestKey: string; expectedEpoch: string; expectedRosterUserIds: number[]; nextRosterUserIds?: number[];
  reason: "match" | "default" | "commissioner" | "dispute"; actorUserId?: number | null; challengeId?: number | null; replayId?: number | null;
  eligibilityOverride?: boolean; eligibilityOverrideReceipt?: {actorUserId:number;reason:string;challengeId:number}; eligibilityCandidates?: Array<BeltCandidate & { userId: number }>; now?: Date; toDispute?: boolean; note?: string;
};

function stableRequestTerms(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableRequestTerms).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stableRequestTerms(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function custodyRequestTerms(input: CustodyTransitionInput) {
  return {
    trophyId: input.trophyId, fromEpoch: input.expectedEpoch,
    expectedRosterUserIds: [...input.expectedRosterUserIds].sort((a,b)=>a-b),
    nextRosterUserIds: input.nextRosterUserIds ?? [], reason: input.reason,
    actorUserId: input.actorUserId ?? null, challengeId: input.challengeId ?? null, replayId: input.replayId ?? null,
    eligibilityOverride: input.eligibilityOverride ?? false,
    eligibilityOverrideReceipt: input.eligibilityOverrideReceipt ? { actorUserId: input.eligibilityOverrideReceipt.actorUserId, reason: input.eligibilityOverrideReceipt.reason, challengeId: input.eligibilityOverrideReceipt.challengeId } : null,
    eligibilityCandidates: [...(input.eligibilityCandidates ?? [])].sort((a,b)=>a.userId-b.userId).map(candidate=>({userId:candidate.userId,representedCountry:candidate.representedCountry,genderDivision:candidate.genderDivision ?? null,rmRating:candidate.rmRating ?? null,dmRating:candidate.dmRating ?? null})),
    toDispute: input.toDispute ?? false, note: input.note ?? null,
  };
}
function name(user: { uid: string; inGameName: string | null; steamPersonaName: string | null }) { return user.inGameName || user.steamPersonaName || user.uid; }
function sameRoster(a: number[], b: number[]) { return a.length === b.length && [...a].sort((x,y)=>x-y).every((id,index)=> id === [...b].sort((x,y)=>x-y)[index]); }

export async function getChampionshipCustody(tx: Db, trophy: Trophy) {
  const policy = championshipBeltPolicy(trophy);
  const reign = await tx.championshipCustodyReign.findFirst({ where: { trophyId: trophy.id, endedAt: null }, include: { seats: { orderBy: { seat: "asc" } } } });
  if (reign) {
    if (reign.teamSize !== policy.teamSize || reign.mode !== policy.mode || reign.seats.length !== policy.teamSize || reign.seats.some((member,index)=>member.seat !== index)) throw new ChampionshipCustodyError("TEAM_ROSTER_MISMATCH", "Current championship roster is incomplete or conflicts with title policy.");
    return { epoch: `reign:${reign.id}`, roster: reign.seats.map(seat => ({ userId: seat.userId, uid: seat.uid, displayName: seat.displayName, walletAddress: seat.walletAddress, steamId: seat.steamId, seat: seat.seat, nftId: seat.nftId, nftClassId: seat.nftClassId })), mode: policy.mode, teamSize: policy.teamSize, reignId: reign.id };
  }
  // Team rows never borrow Trophy.currentHolderUserId: the complete roster is mandatory.
  const userId = policy.teamSize === 1 && !trophyIsPubliclyForcedVacant(trophy.trophyId) && ["held", "active", "guardian_held"].includes(trophy.status) ? trophy.currentHolderUserId ?? trophy.guardianHolderUserId : null;
  const user = userId ? await tx.user.findUnique({ where: { id: userId } }) : null;
  return { epoch: `legacy:${trophy.id}:${trophy.status}:${userId ?? "vacant"}:${trophy.holderSince?.toISOString() ?? "none"}`, roster: user ? [{ userId: user.id, uid: user.uid, displayName: name(user), walletAddress: user.walletAddress, steamId: user.steamId, seat: 0, nftId: trophy.nftId ?? trophy.trophyId, nftClassId: trophy.nftClassId }] : [] as ChampionshipRosterMember[], mode: policy.mode, teamSize: policy.teamSize, reignId: null };
}

async function loadAcceptedReplayRatings(
  prisma: Db,
  userId: number,
  steamId: string | null,
) {
  if (!steamId) return { rmRating: null as number | null, dmRating: null as number | null };

  const snapshots = await prisma.replayPlayerSnapshot.findMany({
    where: {
      userId,
      steamId,
      projection: {
        projectionStatus: "accepted",
        affectsPublicAggregates: true,
        supersededBy: null,
      },
    },
    orderBy: [
      { gameStats: { played_on: "desc" } },
      { gameStatsId: "desc" },
      { id: "desc" },
    ],
    take: 100,
    select: {
      steamId: true,
      gameStats: {
        select: {
          players: true,
        },
      },
    },
  });

  let rmRating: number | null = null;
  let dmRating: number | null = null;

  for (const snapshot of snapshots) {
    const exactSteamId = snapshot.steamId || steamId;
    const player = parsePlayers(snapshot.gameStats.players).find(
      candidate => readLeaderboardSteamId(candidate) === exactSteamId,
    );
    if (!player) continue;

    if (rmRating === null) {
      const observed = readPlayerSteamRmRating(player);
      if (typeof observed === "number" && Number.isFinite(observed)) {
        rmRating = observed;
      }
    }
    if (dmRating === null) {
      const observed = readPlayerSteamDmRating(player);
      if (typeof observed === "number" && Number.isFinite(observed)) {
        dmRating = observed;
      }
    }
    if (rmRating !== null && dmRating !== null) break;
  }

  return { rmRating, dmRating };
}

export async function loadChampionshipCandidateAuthority(prisma: Db, userId: number): Promise<BeltCandidate> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ChampionshipCustodyError("WINNER_NOT_ELIGIBLE", "Championship participant no longer exists.");

  let { rmRating, dmRating } = await loadAcceptedReplayRatings(prisma,user.id,user.steamId);

  try {
    if (rmRating === null || dmRating === null) {
      const board = await loadLobbyLeaderboard(prisma as PrismaClient, { limit: 500, includePendingClaimed: true, includePresence: false });
      const keys = [user.uid, user.inGameName, user.steamPersonaName].filter(Boolean).map(value=>value!.trim().toLowerCase());
      const entry = board.entries.find(entry => keys.includes(entry.name.trim().toLowerCase()) || entry.href?.endsWith(`/${user.uid}`));
      rmRating ??= entry?.steamRmRating ?? null;
      dmRating ??= entry?.steamDmRating ?? null;
      // Primary ratings never cross RM/DM lanes.
      if (entry?.primaryRating != null && /\brm\b|random map/i.test(entry.primaryRatingLabel)) rmRating ??= entry.primaryRating;
      if (entry?.primaryRating != null && /\bdm\b|death ?match/i.test(entry.primaryRatingLabel)) dmRating ??= entry.primaryRating;
    }
  } catch { /* Missing fallback authority fails closed for ELO, without hiding other titles. */ }

  return { representedCountry: user.representedCountry, genderDivision: user.genderDivision, rmRating, dmRating };
}

export async function loadHeldChampionshipStack(prisma: PrismaClient, holderUserId: number, challengerUserId: number) {
  const [all, candidate] = await Promise.all([loadPublicTrophies(prisma), loadChampionshipCandidateAuthority(prisma, challengerUserId)]);
  const held = [] as Array<{ trophy: Trophy; custody: Awaited<ReturnType<typeof getChampionshipCustody>> }>;
  for (const trophy of all) {
    if (trophy.kind === "artifact" || !["held", "active"].includes(trophy.status)) continue;
    const custody = await getChampionshipCustody(prisma, trophy);
    if (custody.roster.some(member=>member.userId === holderUserId)) held.push({ trophy, custody });
  }
  const solo = soloDefenseLadder(held.map(row=>row.trophy), candidate);
  const soloMap = new Map(solo.map(row=>[row.trophy.id,row]));
  const ordered = [...held].sort((a,b)=> championshipBeltPolicy(a.trophy).priority - championshipBeltPolicy(b.trophy).priority || a.trophy.trophyId.localeCompare(b.trophy.trophyId));
  const titles = ordered.map(({trophy,custody})=> {
    const eligibility = soloMap.get(trophy.id) ?? { ...championshipEligibility(trophy,candidate), attackable: false, protected: false };
    const definition = seededTrophyDefinition(trophy.trophyId)?.definition;
    return { trophyId: trophy.id, trophyKey: trophy.trophyId, championTitleId: championshipBeltPolicy(trophy).titleId, displayName: trophy.displayName, imageUri: managedMediaPublicUrl("belt", definition?.id ?? trophy.trophyId, trophy.nftImageUri ?? definition?.assetUrl), kind: trophy.kind, eligible: eligibility.eligible, reason: eligibility.reason, reasonCode: eligibility.reasonCode, attackable: eligibility.attackable, protected: eligibility.protected, teamSize: custody.teamSize, mode: custody.mode, roster: custody.roster, custodyEpoch: custody.epoch };
  });
  return { titles, soloTitleId: solo.find(row=>row.attackable)?.trophy.id ?? null };
}

async function createAllocatedPayout(tx: Prisma.TransactionClient, input: { trophy: Trophy; roster: ChampionshipRosterMember[]; amountWolo: number; kind: "daily_tribute" | "dethrone_bounty"; requestKey: string; now: Date; reason: string }) {
  if (input.amountWolo <= 0) return null;
  if (!Number.isSafeInteger(input.amountWolo)) throw new ChampionshipCustodyError("INVALID_TITLE_AMOUNT", "Title payout requires an exact whole WOLO total.");
  const payout = await tx.trophyPayout.create({ data: { trophyId: input.trophy.id, amountWolo: input.amountWolo, payoutKind: input.kind, status: input.kind === "daily_tribute" ? "dry_run" : "pending", scheduledFor: input.kind === "daily_tribute" ? new Date(input.now.toISOString().slice(0,10)+"T00:00:00.000Z") : input.now, recipientDisplayName: input.roster.map(member=>member.displayName).join(" + ").slice(0,120), rawRequest: { requestKey: input.requestKey, rosterUserIds: input.roster.map(member=>member.userId), economicsPolicy: "TITLE_TOTAL_EQUAL_UWOLO_STABLE_SEATS", reason: input.reason, fundingAuthority: "Founder Rewards settlement", executionMode: "manual_review" } } });
  const shares = splitTitleUwolo(BigInt(input.amountWolo)*BigInt(1_000_000),input.roster.length);
  await tx.trophyPayoutAllocation.createMany({ data: input.roster.map((member,index)=>({ payoutId: payout.id, seat: member.seat, recipientUserId: member.userId, recipientAddress: member.walletAddress, amountUwolo: shares[index], requestKey: `${input.requestKey}:seat:${member.seat}`, status: member.walletAddress ? "pending" : "wallet_required" })) });
  await tx.trophyEvent.create({ data: { trophyId: input.trophy.id, eventType: input.kind === "dethrone_bounty" ? "DETHRONE_BOUNTY_PAYOUT_QUEUED" : "DAILY_TRIBUTE_PAYOUT_QUEUED", amountWolo: input.amountWolo, status: "pending", rawRequest: { payoutId: payout.id, requestKey: input.requestKey, allocationUwolo: shares.map(String), policy: "TITLE_TOTAL_EQUAL_UWOLO_STABLE_SEATS" } } });
  return payout.id;
}

/** Every Commissioner, match and default transition shares this locked money/custody primitive.
 * Match/default callers must establish evidence under their own desync+Challenge lock first. */
export async function transitionChampionshipCustody(tx: Prisma.TransactionClient, input: CustodyTransitionInput) {
  await acquireChampionshipTitleLock(tx,input.trophyId);
  const trophy = await lockTrophyMoneyState(tx,input.trophyId);
  if (!trophy) throw new ChampionshipCustodyError("TITLE_CUSTODY_CHANGED", "Title no longer exists.");
  const existing = await tx.championshipTransferGroup.findUnique({ where: { requestKey: input.requestKey },include:{seats:{orderBy:{seat:"asc"}}} });
  if (existing) {
    const receipt = await tx.trophyEvent.findFirst({where:{trophyId:existing.trophyId,eventType:{in:["TITLE_APP_CUSTODY_CHANGED","TITLE_DISPUTE_CUSTODY_ENTERED"]},rawRequest:{path:["groupId"],equals:existing.id}},select:{rawRequest:true}});
    const storedTerms = receipt?.rawRequest && typeof receipt.rawRequest === "object" && !Array.isArray(receipt.rawRequest) ? receipt.rawRequest.requestTerms : null;
    if (!storedTerms || stableRequestTerms(storedTerms) !== stableRequestTerms(custodyRequestTerms(input))) throw new ChampionshipCustodyError("REQUEST_KEY_CONFLICT", "Title request identity was reused with different custody terms.");
    if (existing.trophyId !== input.trophyId || existing.fromEpoch !== input.expectedEpoch || existing.reason !== input.reason || existing.eligibilityOverride !== (input.eligibilityOverride ?? false) || existing.actorUserId !== (input.actorUserId ?? null) || existing.challengeId !== (input.challengeId ?? null) || existing.replayId !== (input.replayId ?? null) || (existing.appStatus === "disputed") !== Boolean(input.toDispute) || !sameRoster(existing.seats.map(seat=>seat.recipientUserId),input.nextRosterUserIds ?? [])) throw new ChampionshipCustodyError("REQUEST_KEY_CONFLICT", "Title request identity was reused with different custody terms.");
    return { groupId: existing.id, reignId: existing.toReignId, bountyPayoutId: existing.bountyPayoutId, frozenBountyWolo: existing.frozenBountyWolo, idempotent: true, changed: existing.appStatus === "changed" };
  }
  const priorRefresh = await tx.trophyEvent.findFirst({where:{eventType:"HOLDER_DETAILS_REFRESHED",rawRequest:{path:["requestKey"],equals:input.requestKey}},select:{rawRequest:true}});
  if (priorRefresh) {
    const receipt = priorRefresh.rawRequest && typeof priorRefresh.rawRequest === "object" && !Array.isArray(priorRefresh.rawRequest) ? priorRefresh.rawRequest : null;
    if (!receipt?.requestTerms || stableRequestTerms(receipt.requestTerms) !== stableRequestTerms(custodyRequestTerms(input))) throw new ChampionshipCustodyError("REQUEST_KEY_CONFLICT", "Title request identity was reused with different custody terms.");
    return {groupId:null,reignId:typeof receipt.reignId === "number" ? receipt.reignId : null,bountyPayoutId:null,frozenBountyWolo:0,idempotent:true,changed:false};
  }
  const custody = await getChampionshipCustody(tx,trophy), policy = championshipBeltPolicy(trophy);
  if (custody.epoch !== input.expectedEpoch || !sameRoster(custody.roster.map(member=>member.userId),input.expectedRosterUserIds)) throw new ChampionshipCustodyError("TITLE_CUSTODY_CHANGED", "Championship custody changed since Challenge creation.");
  if ((input.reason === "match" || input.reason === "default") && !["held","active","guardian_held","vacant"].includes(trophy.status)) throw new ChampionshipCustodyError("TITLE_NOT_ACTIVE", `This championship is ${trophy.status} and cannot settle a match or default.`);
  if ((input.reason === "match" || input.reason === "default") && policy.transferPolicy !== "MATCH_WINNER") throw new ChampionshipCustodyError("POPULAR_VOTE_REQUIRED", "This title does not transfer by an ordinary match or default.");
  if (input.eligibilityOverride) {
    const receipt = input.eligibilityOverrideReceipt;
    const actorId = input.reason === "commissioner" ? input.actorUserId : receipt?.actorUserId;
    const actor = actorId ? await tx.user.findUnique({where:{id:actorId},select:{isAdmin:true}}) : null;
    const sourceChallenge = receipt ? await tx.trophyChallenge.findUnique({where:{id:receipt.challengeId},select:{trophyId:true,eligibilityOverride:true}}) : null;
    if (!actor?.isAdmin || (input.reason !== "commissioner" && (!receipt?.reason?.trim() || receipt.challengeId !== input.challengeId || sourceChallenge?.trophyId !== trophy.id || !sourceChallenge.eligibilityOverride))) throw new ChampionshipCustodyError("COMMISSIONER_OVERRIDE_REQUIRED", "An audited Commissioner eligibility bypass is required.");
  }
  const ids = input.nextRosterUserIds ?? [];
  if (!input.toDispute && (ids.length !== policy.teamSize || new Set(ids).size !== ids.length)) throw new ChampionshipCustodyError("TEAM_SIZE_MISMATCH", `This championship requires exactly ${policy.teamSize} distinct member(s).`);
  const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids } } }) : [];
  if (users.length !== ids.length) throw new ChampionshipCustodyError("TEAM_ROSTER_MISMATCH", "Every championship seat requires an existing AoE2WAR identity.");
  const roster: ChampionshipRosterMember[] = ids.map((id,seat)=> {
    const user = users.find(user=>user.id === id)!;
    const sealed = input.eligibilityCandidates?.find(candidate=>candidate.userId === id);
    const eligibility = championshipEligibility(trophy,{ ...sealed, representedCountry: user.representedCountry, genderDivision: user.genderDivision },input.eligibilityOverride);
    if (!eligibility.eligible && input.reason !== "dispute") throw new ChampionshipCustodyError(eligibility.reasonCode,eligibility.reason);
    return { userId: id, uid: user.uid, displayName: name(user), walletAddress: user.walletAddress, steamId: user.steamId, seat, nftClassId: trophy.nftClassId, nftId: policy.teamSize === 1 ? trophy.nftId ?? trophy.trophyId : `${trophy.nftId ?? trophy.trophyId}:seat:${seat+1}` };
  });
  if (!input.toDispute && sameRoster(custody.roster.map(member=>member.userId),ids)) {
    // A roster set refresh never moves NFT seats or rewrites transfer/payout proof.
    const refreshed = custody.roster.map(member=>({ ...member, ...roster.find(next=>next.userId === member.userId), seat: member.seat, nftId: member.nftId, nftClassId: member.nftClassId }));
    if (custody.reignId) for (const member of refreshed) await tx.championshipCustodySeat.update({where:{reignId_seat:{reignId:custody.reignId,seat:member.seat}},data:{uid:member.uid,displayName:member.displayName,walletAddress:member.walletAddress,steamId:member.steamId}});
    await tx.trophy.update({where:{id:trophy.id},data:{currentHolderDisplayName:refreshed.map(member=>member.displayName).join(" + ").slice(0,120),currentHolderWoloAddress:policy.teamSize === 1 ? refreshed[0].walletAddress : null,forfeitureNeeded:false,eligibilityNote:input.note ?? trophy.eligibilityNote}});
    await syncChampionshipBeltHonorMirror(tx, {
      displayName: trophy.displayName,
      holderUserIds: refreshed.map(member => member.userId),
      actorUserId: input.actorUserId,
      now: input.now,
    });
    await tx.trophyEvent.create({ data: { trophyId: trophy.id, eventType: "HOLDER_DETAILS_REFRESHED", actorUserId: input.actorUserId, rawRequest: { requestKey: input.requestKey, custodyChanged: false, reason: input.reason, reignId:custody.reignId, requestTerms:custodyRequestTerms(input) } } });
    return { groupId: null, reignId: custody.reignId, bountyPayoutId: null, frozenBountyWolo: 0, idempotent: false, changed: false };
  }
  const now = input.now ?? new Date();
  const exit = await prepareTrophyCustodyExit(tx,{ trophy, now, reason: input.reason, createdBy: "championship_transition" });
  if (exit.inFlightPayoutId) throw new ChampionshipCustodyError("TRIBUTE_EXECUTION_IN_FLIGHT", `Tribute #${exit.inFlightPayoutId} is executing; resolve it before custody changes.`);
  const frozenBountyWolo = projectedTrophyBounty(trophy,now);
  let bountyPayoutId: number | null = null;
  if (!input.toDispute && policy.teamSize === 1 && trophy.currentHolderUserId) {
    const payouts = await prepareManualTrophyHolderTransferPayouts(tx,{ trophy, previousHolderUserId: trophy.currentHolderUserId, previousHolderDisplayName: trophy.currentHolderDisplayName, nextHolderUserId: roster[0].userId, nextHolderDisplayName: roster[0].displayName, nextHolderWoloAddress: roster[0].walletAddress, now });
    if (payouts.tributeInFlightPayoutId) throw new ChampionshipCustodyError("TRIBUTE_EXECUTION_IN_FLIGHT", "Tribute execution prevents custody change.");
    bountyPayoutId = payouts.bountyPayoutId;
  } else if (!input.toDispute && frozenBountyWolo > 0) {
    bountyPayoutId = await createAllocatedPayout(tx,{ trophy, roster, amountWolo: frozenBountyWolo, kind: "dethrone_bounty", requestKey: `${input.requestKey}:bounty`, now, reason: input.reason });
  }
  if (custody.reignId) await tx.championshipCustodyReign.update({ where: { id: custody.reignId }, data: { endedAt: now, frozenBountyWolo } });
  const reign = input.toDispute ? null : await tx.championshipCustodyReign.create({ data: { trophyId: trophy.id, mode: policy.mode, teamSize: policy.teamSize, startedAt: now, reason: input.reason, requestKey: input.requestKey, seats: { create: roster.map(member=>({ ...member, nftId: member.nftId! })) } } });
  await tx.trophy.update({ where: { id: trophy.id }, data: { status: input.toDispute ? "disputed" : "held", currentHolderUserId: policy.teamSize === 1 && !input.toDispute ? roster[0].userId : null, currentHolderDisplayName: input.toDispute ? null : roster.map(member=>member.displayName).join(" + ").slice(0,120), currentHolderWoloAddress: policy.teamSize === 1 && !input.toDispute ? roster[0].walletAddress : null, guardianHolderUserId: null, guardianHolderDisplayName: null, guardianHolderWoloAddress: null, holderSince: input.toDispute ? null : now, currentBountyWolo: input.toDispute ? frozenBountyWolo : 0, forfeitureNeeded: false, eligibilityNote: input.note ?? `Championship ${input.reason} transition.` } });
  await syncChampionshipBeltHonorMirror(tx, {
    displayName: trophy.displayName,
    holderUserIds: input.toDispute ? [] : roster.map(member => member.userId),
    actorUserId: input.actorUserId,
    now,
  });
  if (!input.toDispute && policy.teamSize > 1 && exit.chainBackedTributePayoutIds.length === 0 && trophy.tributeAmountWolo > 0 && trophy.payoutFrequency === "daily") {
    const active = await tx.trophySetting.findUnique({where:{key:`championship_tribute_active:${trophy.trophyId}`}});
    if (active?.value === true) await createAllocatedPayout(tx,{trophy,roster,amountWolo:trophy.tributeAmountWolo,kind:"daily_tribute",requestKey:`tribute:${trophy.id}:reign:${reign!.id}:${now.toISOString().slice(0,10)}`,now,reason:input.reason});
  }
  const group = await tx.championshipTransferGroup.create({ data: { trophyId: trophy.id, requestKey: input.requestKey, fromEpoch: custody.epoch, toReignId: reign?.id ?? null, reason: input.reason, actorUserId: input.actorUserId, challengeId: input.challengeId, replayId: input.replayId, eligibilityOverride: input.eligibilityOverride ?? false, frozenBountyWolo, bountyPayoutId, appStatus: input.toDispute ? "disputed" : "changed", nftStatus: "blocked", reasonCode: "NFT_EXECUTOR_UNAVAILABLE", seats: { create: roster.map(member=>({ seat: member.seat, nftClassId: member.nftClassId, nftId: member.nftId!, expectedOwnerAddress: custody.roster[member.seat]?.walletAddress ?? trophy.chainOwnerAddress, recipientUserId: member.userId, recipientAddress: member.walletAddress, status: "blocked", errorCode: "NFT_EXECUTOR_UNAVAILABLE" })) } } });
  await tx.trophyEvent.create({ data: { trophyId: trophy.id, challengeId: input.challengeId, replayId: input.replayId, actorUserId: input.actorUserId, actorRole: input.actorUserId ? "admin" : "system", initiatedBy: input.actorUserId ? "admin" : "system", eventType: input.toDispute ? "TITLE_DISPUTE_CUSTODY_ENTERED" : "TITLE_APP_CUSTODY_CHANGED", amountWolo: frozenBountyWolo, status: input.toDispute ? "attention_required" : "recorded", fromHolderUserId: custody.roster.length === 1 ? custody.roster[0].userId : null, toHolderUserId: roster.length === 1 ? roster[0].userId : null, rawRequest: { groupId: group.id, requestKey: input.requestKey, requestTerms:custodyRequestTerms(input), fromEpoch: custody.epoch, fromRosterUserIds: custody.roster.map(member=>member.userId), toRosterUserIds: ids, transferAt: now.toISOString(), eligibilityOverride: input.eligibilityOverride ?? false, eligibilityOverrideReceipt: input.eligibilityOverrideReceipt ?? null, note: input.note ?? null, bountyPayoutId, frozenBountyWolo, supersededTributePayoutIds: exit.supersededTributePayoutIds, chainBackedTributePayoutIds: exit.chainBackedTributePayoutIds, nftReasonCode: "NFT_EXECUTOR_UNAVAILABLE", nftOwnershipProven: false } } });
  return { groupId: group.id, reignId: reign?.id ?? null, bountyPayoutId, frozenBountyWolo, idempotent: false, changed: true };
}

export const loadChampionshipCandidate = loadChampionshipCandidateAuthority;

export async function ensureChampionshipTeamTributePayouts(prisma: PrismaClient, now = new Date()) {
  const settings = await prisma.trophySetting.findMany({where:{key:{startsWith:"championship_tribute_active:"}}});
  const activeKeys = settings.filter(setting=>setting.value === true).map(setting=>setting.key.slice("championship_tribute_active:".length));
  if (!activeKeys.length) return;
  const trophies = await prisma.trophy.findMany({where:{trophyId:{in:activeKeys},status:{in:["held","active"]},tributeAmountWolo:{gt:0},payoutFrequency:"daily"}});
  for (const candidate of trophies) await prisma.$transaction(async tx=> {
    const trophy = await lockTrophyMoneyState(tx,candidate.id);
    if (!trophy || !["held","active"].includes(trophy.status) || championshipBeltPolicy(trophy).teamSize === 1) return;
    const custody = await getChampionshipCustody(tx,trophy);
    if (custody.roster.length !== custody.teamSize) return;
    const dayStart = new Date(now.toISOString().slice(0,10)+"T00:00:00.000Z"), dayEnd = new Date(dayStart.getTime()+86_400_000);
    const existing = await tx.trophyPayout.findMany({where:{trophyId:trophy.id,payoutKind:"daily_tribute",scheduledFor:{gte:dayStart,lt:dayEnd}},include:{allocations:true}});
    // Partial chain truth consumes this day's title total; never replace or multiply it.
    if (existing.some(row=>row.status === "paid" || row.status === "executing" || row.txHash || row.allocations.some(allocation=>allocation.txHash))) return;
    if (existing.some(row=>!["superseded"].includes(row.status))) return;
    await createAllocatedPayout(tx,{trophy,roster:custody.roster,amountWolo:trophy.tributeAmountWolo,kind:"daily_tribute",requestKey:`tribute:${trophy.id}:${custody.epoch}:${now.toISOString().slice(0,10)}`,now,reason:"active_team_reign"});
  });
}

export async function executeAllocatedTrophyPayout(prisma: PrismaClient, payoutId: number, options: {reconcileOnly?:boolean} = {}) {
  const { executeAllocatedFounderPayout, reconcileAllocatedFounderPayout, AllocatedFounderPayoutError } = await import("@/lib/trophies/allocatedFounderPayout");
  const claim = await prisma.$transaction(async tx=> {
    const initial = await tx.trophyPayout.findUnique({where:{id:payoutId},select:{trophyId:true}});
    if (!initial) return null;
    const trophy = await lockTrophyMoneyState(tx,initial.trophyId);
    const payout = await tx.trophyPayout.findUnique({where:{id:payoutId},include:{allocations:{orderBy:{seat:"asc"}}}});
    if (!trophy || !payout || !payout.allocations.length || (payout.payoutKind === "dethrone_bounty" && !["pending","retrying","failed","partial_paid",...(options.reconcileOnly ? ["executing"] : [])].includes(payout.status)) || ["cancelled","superseded","paid",...(!options.reconcileOnly ? ["executing"] : [])].includes(payout.status) || !payout.scheduledFor || payout.scheduledFor > new Date()) return null;
    if (payout.payoutKind === "daily_tribute") {
      const active = await tx.trophySetting.findUnique({where:{key:`championship_tribute_active:${trophy.trophyId}`}});
      const custody = await getChampionshipCustody(tx,trophy);
      const backedLiability = payout.allocations.some(row=>row.txHash || ["broadcasting","uncertain"].includes(row.status) || row.proof);
      if (!options.reconcileOnly && !backedLiability && (active?.value !== true || !["held","active"].includes(trophy.status) || !sameRoster(custody.roster.map(member=>member.userId),payout.allocations.map(row=>row.recipientUserId)))) {
        if (!backedLiability) await tx.trophyPayout.update({where:{id:payout.id},data:{status:"superseded"}});
        return null;
      }
    }
    for (const allocation of payout.allocations) {
      if (options.reconcileOnly) break;
      if (allocation.txHash || allocation.recipientAddress || ["paid","uncertain","broadcasting"].includes(allocation.status)) continue;
      const recipient = await tx.user.findUnique({where:{id:allocation.recipientUserId},select:{walletAddress:true}});
      if (!recipient?.walletAddress) continue;
      await tx.trophyPayoutAllocation.update({where:{id:allocation.id},data:{recipientAddress:recipient.walletAddress,status:"pending"}});
      allocation.recipientAddress = recipient.walletAddress;
    }
    if (options.reconcileOnly) return payout;
    const updated = await tx.trophyPayout.updateMany({where:{id:payout.id,status:payout.status},data:{status:"executing",errorState:null}});
    return updated.count === 1 ? payout : null;
  });
  if (!claim) return {paid:false,skipped:true,detail:"Allocated payout is unavailable, already executing, or no longer matches custody."};
  let error: string | null = null;
  for (const allocation of claim.allocations) {
    if (allocation.txHash || allocation.amountUwolo === BigInt(0)) continue;
    if (allocation.status === "paid") { error = "ALLOCATION_PROOF_MISSING"; continue; }
    if (!allocation.recipientAddress) { error = "WALLET_LINK_REQUIRED"; continue; }
    const previouslyUncertain = ["uncertain","broadcasting"].includes(allocation.status);
    const request = {requestId:allocation.requestKey,toAddress:allocation.recipientAddress,amountUwolo:allocation.amountUwolo,memo:`AoE2WAR ${allocation.requestKey} | title ${claim.trophyId} ${claim.payoutKind} seat ${allocation.seat+1}`};
    let confirmedProof: Awaited<ReturnType<typeof executeAllocatedFounderPayout>> | null = null;
    try {
      if (!previouslyUncertain && !options.reconcileOnly) await prisma.trophyPayoutAllocation.update({where:{id:allocation.id},data:{status:"broadcasting",errorCode:null}});
      confirmedProof = previouslyUncertain || options.reconcileOnly ? await reconcileAllocatedFounderPayout(request,allocation.proof) : await executeAllocatedFounderPayout(request);
      await prisma.trophyPayoutAllocation.update({where:{id:allocation.id},data:{status:"paid",txHash:confirmedProof.txHash,proof:confirmedProof as unknown as Prisma.InputJsonValue,paidAt:new Date(),errorCode:null}});
    } catch (failure) {
      error = failure instanceof Error ? failure.message : "PAYOUT_FAILED";
      // Even a confirmed response followed by a DB write failure is uncertain
      // to the ledger. Preserve evidence and stop automatic rebroadcast.
      const uncertain = previouslyUncertain || (failure instanceof AllocatedFounderPayoutError ? failure.uncertain : true);
      if (options.reconcileOnly && !previouslyUncertain && !allocation.proof) continue;
      const evidence = confirmedProof ?? (failure instanceof AllocatedFounderPayoutError ? failure.evidence : undefined);
      await prisma.trophyPayoutAllocation.updateMany({where:{id:allocation.id,txHash:null},data:{status:uncertain ? "uncertain" : "failed",errorCode:error.slice(0,255),...(evidence ? {proof:evidence as unknown as Prisma.InputJsonValue} : {})}});
    }
  }
  const allocations = await prisma.trophyPayoutAllocation.findMany({where:{payoutId}});
  const paid = allocations.every(row=> Boolean(row.txHash) || row.amountUwolo === BigInt(0));
  const partial = allocations.some(row=>Boolean(row.txHash));
  await prisma.trophyPayout.update({where:{id:payoutId},data:{status:paid ? "paid" : options.reconcileOnly && claim.status === "executing" ? "executing" : partial ? "partial_paid" : "failed",paidAt:paid ? new Date() : null,errorState:error?.slice(0,255) ?? null,rawResponse:{allocationProofs:allocations.map(row=>({seat:row.seat,status:row.status,txHash:row.txHash,amountUwolo:row.amountUwolo.toString()}))}}});
  await prisma.trophyEvent.create({data:{trophyId:claim.trophyId,eventType:paid ? "TITLE_PAYOUT_GROUP_PAID" : "TITLE_PAYOUT_GROUP_PENDING",status:paid ? "paid" : "attention_required",amountWolo:claim.amountWolo,rawRequest:{payoutId,confirmedSeats:allocations.filter(row=>row.txHash).map(row=>row.seat)},errorMessage:error}});
  return {paid,skipped:false,detail:error};
}
