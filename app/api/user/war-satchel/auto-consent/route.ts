/** Owner-specific Keplr signed War Satchel AUTO-WAGER mandate; OFF by default.
 * POST issue challenge, PUT verify+consume, DELETE revoke, GET current state.
 * No wallet sends, no token credit and no direct bet placement.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";
import {
  satchelAutoSpendChallengeText, verifySatchelAutoSpendSignature,
  type SatchelSpendChallenge,
} from "@/lib/warSatchelAutoSpendConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store" };
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function reply(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status, headers: HEADERS });
}
function enabled() {
  return process.env.WAR_SATCHEL_AUTO_CONSENT_ENABLED === "true";
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
function witness(row: {
  ownerUid: string; walletAddress: string; presetId: number; presetVersion: number;
  winnerStakeWolo: number; desyncSide: string; desyncStakeWolo: number;
  perGameCapWolo: number; dailyCapWolo: number; nonce: string;
  issuedAt: Date; challengeExpiresAt: Date; spendExpiresAt: Date;
  signedAt: Date | null; revokedAt: Date | null;
}): SatchelSpendChallenge {
  if (!["none", "no", "yes"].includes(row.desyncSide)) throw Error("invalid stored plan");
  return {
    ownerUid: row.ownerUid, walletAddress: row.walletAddress,
    presetId: row.presetId, presetVersion: row.presetVersion,
    winnerStakeWolo: row.winnerStakeWolo,
    desyncSide: row.desyncSide as SatchelSpendChallenge["desyncSide"],
    desyncStakeWolo: row.desyncStakeWolo, perGameCapWolo: row.perGameCapWolo,
    dailyCapWolo: row.dailyCapWolo, nonce: row.nonce,
    issuedAtUtc: row.issuedAt.toISOString(),
    challengeExpiresAtUtc: row.challengeExpiresAt.toISOString(),
    spendExpiresAtUtc: row.spendExpiresAt.toISOString(),
    signedAtUtc: row.signedAt?.toISOString() ?? null,
    revokedAtUtc: row.revokedAt?.toISOString() ?? null,
  };
}
export async function GET(request: NextRequest) {
  if (!enabled()) return reply(200, { available: false, signed: false });
  const actor = await viewer(request);
  if (!actor?.user.betAutoPreset) return reply(200, { available: true, signed: false });
  const now = new Date();
  const plan = actor.user.betAutoPreset;
  const signed = await actor.prisma.satchelAutoSpendConsent.findFirst({
    where: { ownerUserId: actor.user.id, presetId: plan.id, presetVersion: plan.version,
      walletAddress: actor.user.walletAddress || "", signedAt: { not: null },
      revokedAt: null, spendExpiresAt: { gt: now } },
    orderBy: { signedAt: "desc" },
    select: { id: true, perGameCapWolo: true, dailyCapWolo: true, spendExpiresAt: true },
  });
  return reply(200, { available: true, signed: Boolean(signed),
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721005, ${actor.user.id})`;
      const now = new Date();
      const recent = await tx.satchelAutoSpendConsent.count({
        where: { ownerUserId: actor.user.id,
          issuedAt: { gte: new Date(now.getTime() - 60*60*1000) } },
      });
      if (recent >= 5) throw Error("consent request limit");
      const already = await tx.satchelAutoSpendConsent.findFirst({
        where: { ownerUserId: actor.user.id, presetId: plan.id, presetVersion: plan.version,
          signedAt: { not: null }, revokedAt: null, spendExpiresAt: { gt: now } },
      });
      if (already) throw Error("one active consent per plan");
      return tx.satchelAutoSpendConsent.create({
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
    }, { maxWait: 4000, timeout: 7000 });
    const challenge = witness(row);
    return reply(201, {
      challengeId: row.id, chainId: "wolo-1", walletAddress: row.walletAddress,
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
      const consent = await tx.satchelAutoSpendConsent.findFirst({
        where: { id: body.challengeId as string, ownerUserId: actor.user.id,
          presetId: plan.id, presetVersion: plan.version, walletAddress: actor.user.walletAddress! },
      });
      if (!consent || consent.signedAt || consent.revokedAt) throw Error("missing challenge");
      const original = await tx.betAutoPreset.findUnique({ where: { id: plan.id } });
      if (!original || !original.enabled || !original.selfOnly ||
          original.version !== consent.presetVersion ||
          original.winnerStakeWolo !== consent.winnerStakeWolo ||
          original.desyncSide !== consent.desyncSide ||
          original.desyncStakeWolo !== consent.desyncStakeWolo) throw Error("plan drift");
      verifySatchelAutoSpendSignature({
        challenge: witness(consent), ownerUid: actor.user.uid,
        ownerWallet: actor.user.walletAddress!, presetId: plan.id, presetVersion: plan.version,
        nowUtc: new Date().toISOString(),
        keplrSignature: signature as { pub_key: { type: string; value: string }; signature: string },
      });
      const result = await tx.satchelAutoSpendConsent.updateMany({
        where: { id: consent.id, signedAt: null, revokedAt: null,
          challengeExpiresAt: { gt: new Date() } },
        data: { signedAt: new Date() },
      });
      if (result.count !== 1) throw Error("challenge consumed");
    }, { isolationLevel: "Serializable", maxWait: 4000, timeout: 7000 });
    return reply(200, { signed: true, autoBetSpendConsent: true, creditAuthorized: false,
      withdrawalAuthorized: false });
  } catch {
    return reply(409, { detail: "Keplr mandate rejected, expired or already used." });
  }
}
export async function DELETE(request: NextRequest) {
  if (!enabled()) return reply(503, { detail: "Signed Mecha mandate disabled." });
  if (!sameOrigin(request)) return reply(403, { detail: "Invalid origin." });
  const actor = await viewer(request);
  if (!actor) return reply(401, { detail: "Sign in required." });
  await actor.prisma.satchelAutoSpendConsent.updateMany({
    where: { ownerUserId: actor.user.id, revokedAt: null, signedAt: { not: null } },
    data: { revokedAt: new Date() },
  });
  return reply(200, { revoked: true, newBetsAuthorized: false });
}
