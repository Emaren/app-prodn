/** Owner-specific Keplr signed War Satchel AUTO-WAGER mandate; OFF by default.
 * POST issue challenge, PUT verify+consume, DELETE revoke, GET current state.
 * No wallet sends, no token credit and no direct bet placement.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { Prisma } from "@/lib/generated/prisma";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";
import {
  satchelAutoSpendChallengeText, verifySatchelAutoSpendSignature,
  storedSatchelSpendChallenge, verifyDurableSatchelAutoSpendMandate,
  satchelAutoSpendAuthorizationEpochReleased,
} from "@/lib/warSatchelAutoSpendConsent";
import { satchelFinancialBridgeReady } from "@/lib/warSatchelFinancialBridgeHold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store" };
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function reply(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status, headers: HEADERS });
}
function enabled() {
  return satchelFinancialBridgeReady() && satchelAutoSpendAuthorizationEpochReleased() &&
    process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED === "true";
}
function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === "https://aoe2war.com" &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
async function viewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return null;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { id: true, uid: true, walletAddress: true,
      betAutoPreset: { select: {
        id: true, version: true, enabled: true, selfOnly: true,
        winnerStakeWolo: true, desyncSide: true, desyncStakeWolo: true,
        untilOut: true, gamesRemaining: true,
      } } },
  });
  return user ? { prisma, user } : null;
}
async function jsonBody(request: NextRequest) {
  const raw = await readWarSatchelBoundedUtf8(request.body, 3072);
  if (!raw) return null;
  try {
    const obj: unknown = JSON.parse(raw);
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? obj as Record<string, unknown> : null;
  } catch { return null; }
}
export async function GET(request: NextRequest) {
  const available = enabled();
  const actor = await viewer(request);
  if (!actor) return reply(200, { available, signed: false, canRevoke: false });
  const revocable = await actor.prisma.satchelAutoSpendConsent.findFirst({
    where: { ownerUserId: actor.user.id, revokedAt: null }, select: { id: true },
  });
  if (!available || !actor.user.betAutoPreset) {
    return reply(200, { available, signed: false, canRevoke: !!revocable });
  }
  const now = new Date();
  const plan = actor.user.betAutoPreset;
  const signed = await actor.prisma.satchelAutoSpendConsent.findFirst({
    where: { ownerUserId: actor.user.id, presetId: plan.id, presetVersion: plan.version,
      walletAddress: actor.user.walletAddress || "", signedAt: { not: null },
      revokedAt: null, spendExpiresAt: { gt: now } },
    orderBy: { signedAt: "desc" },
    include: { originalMandate: true },
  });
  let originalVerified = false;
  if (signed) try {
    verifyDurableSatchelAutoSpendMandate({consent:signed, originalMandate:signed.originalMandate,
      ownerUid:actor.user.uid, ownerWallet:actor.user.walletAddress || "", presetId:plan.id,
      presetVersion:plan.version, untilOut:plan.untilOut, gamesRemaining:plan.gamesRemaining, now});
    originalVerified = true;
  } catch { /* A historical signedAt flag alone never grants permission. */ }
  return reply(200, { available, signed: originalVerified, canRevoke: !!revocable,
    presetVersion: plan.version, perGameCapWolo: signed?.perGameCapWolo ?? null,
    dailyCapWolo: signed?.dailyCapWolo ?? null,
    expiresAtUtc: signed?.spendExpiresAt.toISOString() ?? null });
}
export async function POST(request: NextRequest) {
  if (!enabled()) return reply(503, { detail: "Signed Mecha mandate disabled." });
  if (!sameOrigin(request)) return reply(403, { detail: "Invalid origin." });
  const actor = await viewer(request);
  if (!actor?.user.walletAddress || !actor.user.betAutoPreset) {
    return reply(409, { detail: "Sign in and connect Keplr with a saved Mecha plan." });
  }
  const body = await jsonBody(request);
  if (!body || Object.keys(body).sort().join(",") !== "dailyCapWolo,expectedPresetVersion" ||
      !Number.isSafeInteger(body.dailyCapWolo) ||
      !Number.isSafeInteger(body.expectedPresetVersion)) {
    return reply(400, { detail: "Invalid spending authorization limits." });
  }
  const plan = actor.user.betAutoPreset;
  const stake = plan.winnerStakeWolo + plan.desyncStakeWolo;
  if (!plan.enabled || !plan.selfOnly || plan.version !== body.expectedPresetVersion ||
      !["none", "yes", "no"].includes(plan.desyncSide) ||
      stake < 1 || stake > 1000 ||
      (plan.desyncSide === "none" ? plan.desyncStakeWolo !== 0 : plan.desyncStakeWolo <= 0) ||
      (body.dailyCapWolo as number) < stake ||
      (body.dailyCapWolo as number) > 10000) {
    return reply(409, { detail: "Saved betting plan or daily allowance changed." });
  }
  try {
    const row = await actor.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724176, 47)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721005, ${actor.user.id})`;
      const current = await tx.betAutoPreset.findUnique({ where: {id:plan.id} });
      const linkedOwner = await tx.user.findUnique({where:{id:actor.user.id},select:{walletAddress:true}});
      if (!current || !current.enabled || !current.selfOnly || current.version !== plan.version ||
          current.winnerStakeWolo !== plan.winnerStakeWolo || current.desyncSide !== plan.desyncSide ||
          current.desyncStakeWolo !== plan.desyncStakeWolo || current.untilOut !== plan.untilOut ||
          current.gamesRemaining !== plan.gamesRemaining || linkedOwner?.walletAddress !== actor.user.walletAddress) {
        throw Error("plan or owner changed");
      }
      const now = new Date();
      const recent = await tx.satchelAutoSpendConsent.count({
        where: { ownerUserId: actor.user.id,
          issuedAt: { gte: new Date(now.getTime() - 60*60*1000) } },
      });
      if (recent >= 5) throw Error("consent request limit");
      const already = await tx.satchelAutoSpendConsent.findFirst({
        where: { ownerUserId: actor.user.id, presetId: plan.id, presetVersion: plan.version,
          signedAt: { not: null }, revokedAt: null, spendExpiresAt: { gt: now },
          originalMandate:{is:{signedAt:{not:null}}} },
      });
      if (already) throw Error("one active consent per plan");
      const created = await tx.satchelAutoSpendConsent.create({
        data: {
          id: randomUUID(), ownerUserId: actor.user.id, ownerUid: actor.user.uid,
          walletAddress: actor.user.walletAddress!, presetId: plan.id,
          presetVersion: plan.version, winnerStakeWolo: plan.winnerStakeWolo,
          desyncSide: plan.desyncSide, desyncStakeWolo: plan.desyncStakeWolo,
          perGameCapWolo: stake, dailyCapWolo: body.dailyCapWolo as number,
          nonce: randomBytes(16).toString("hex"),
          issuedAt: now, challengeExpiresAt: new Date(now.getTime()+5*60*1000),
          spendExpiresAt: new Date(now.getTime()+24*60*60*1000),
        },
      });
      const challenge = storedSatchelSpendChallenge(created, current);
      await tx.satchelAutoSpendMandate.create({data:{consentId:created.id,
        untilOut:current.untilOut, gamesRemaining:current.gamesRemaining,
        challengeText:satchelAutoSpendChallengeText(challenge)}});
      return {created,challenge};
    }, { maxWait: 4000, timeout: 7000 });
    const {created,challenge} = row;
    return reply(201, {
      challengeId: created.id, chainId: "wolo-1", walletAddress: created.walletAddress,
      message: satchelAutoSpendChallengeText(challenge),
      expiresAtUtc: challenge.challengeExpiresAtUtc,
      spendingExpiresAtUtc: challenge.spendExpiresAtUtc,
      creditAuthorized: false, withdrawalAuthorized: false,
    });
  } catch {
    return reply(409, { detail: "The plan has an active mandate, or signed consent issuance was refused." });
  }
}
export async function PUT(request: NextRequest) {
  if (!enabled()) return reply(503, { detail: "Signed Mecha mandate disabled." });
  if (!sameOrigin(request)) return reply(403, { detail: "Invalid origin." });
  const actor = await viewer(request);
  if (!actor?.user.walletAddress || !actor.user.betAutoPreset) return reply(401, { detail: "No linked owner." });
  const body = await jsonBody(request);
  if (!body || Object.keys(body).sort().join(",") !== "challengeId,keplrSignature" ||
      typeof body.challengeId !== "string" || !ID.test(body.challengeId)) {
    return reply(400, { detail: "Invalid signed mandate." });
  }
  const signature = body.keplrSignature;
  if (!signature || typeof signature !== "object" || Array.isArray(signature)) {
    return reply(400, { detail: "Invalid signing proof." });
  }
  const plan = actor.user.betAutoPreset;
  try {
    await actor.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724176, 47)`;
      const consent = await tx.satchelAutoSpendConsent.findFirst({
        where: { id: body.challengeId as string, ownerUserId: actor.user.id,
          presetId: plan.id, presetVersion: plan.version, walletAddress: actor.user.walletAddress! },
      });
      if (!consent || consent.signedAt || consent.revokedAt) throw Error("missing challenge");
      const mandate = await tx.satchelAutoSpendMandate.findUnique({where:{consentId:consent.id}});
      if (!mandate || mandate.signedAt || mandate.ownerSignatureJson) throw Error("missing original challenge");
      const original = await tx.betAutoPreset.findUnique({ where: { id: plan.id } });
      const linkedOwner = await tx.user.findUnique({where:{id:actor.user.id},select:{walletAddress:true}});
      if (!original || !original.enabled || !original.selfOnly ||
          original.version !== consent.presetVersion ||
          original.winnerStakeWolo !== consent.winnerStakeWolo ||
          original.desyncSide !== consent.desyncSide ||
          original.desyncStakeWolo !== consent.desyncStakeWolo ||
          original.untilOut !== mandate.untilOut || original.gamesRemaining !== mandate.gamesRemaining ||
          linkedOwner?.walletAddress !== consent.walletAddress) throw Error("plan drift");
      const challenge = storedSatchelSpendChallenge(consent,mandate);
      if (satchelAutoSpendChallengeText(challenge) !== mandate.challengeText) throw Error("challenge drift");
      const signedAt = new Date();
      verifySatchelAutoSpendSignature({
        challenge, ownerUid: actor.user.uid,
        ownerWallet: actor.user.walletAddress!, presetId: plan.id, presetVersion: plan.version,
        nowUtc: signedAt.toISOString(),
        keplrSignature: signature as { pub_key: { type: string; value: string }; signature: string },
      });
      const result = await tx.satchelAutoSpendConsent.updateMany({
        where: { id: consent.id, signedAt: null, revokedAt: null,
          challengeExpiresAt: { gt: new Date() } },
        data: { signedAt },
      });
      if (result.count !== 1) throw Error("challenge consumed");
      await tx.satchelAutoSpendMandate.update({where:{consentId:consent.id},
        data:{signedAt,ownerSignatureJson:signature as Prisma.InputJsonValue}});
    }, { isolationLevel: "Serializable", maxWait: 4000, timeout: 7000 });
    return reply(200, { signed: true, autoBetSpendConsent: true, creditAuthorized: false,
      withdrawalAuthorized: false });
  } catch {
    return reply(409, { detail: "Keplr mandate rejected, expired or already used." });
  }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return reply(403, { detail: "Invalid origin." });
  const actor = await viewer(request);
  if (!actor) return reply(401, { detail: "Sign in required." });
  try {
    // Serialize mandate revocation with the funding worker's FINAL check
    // immediately before an external chain send. Any send already fenced
    // before this revocation is in flight and must be reconciled; it cannot
    // be unsent or automatically refunded.
    await actor.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724176, 47)`;
      await tx.satchelAutoSpendConsent.updateMany({
        where: {
          ownerUserId: actor.user.id, revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 9000 });
    return reply(200, { revoked: true, newBetsAuthorized: false,
      inFlightTransfersMayStillSettle: true });
  } catch {
    return reply(503, { detail: "Could not certify revocation. Do not assume it succeeded." });
  }
}
