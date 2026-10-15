/**
 * Server-side, ONE-USE wallet-control proof gate for the future War Satchel.
 * The funding/crediting/payment executor is deliberately absent.
 *
 * Default disabled until the protected C1/C2 migrations and release gate pass.
 * No caller-supplied nonce, wallet, UID, amount or custody vault is trusted.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";
import {
  satchelWalletOwnerChallengeText,
  verifyWarSatchelWalletOwnerProof,
  type KeplrArbitrarySignature,
  type SatchelWalletOwnerChallenge,
} from "@/lib/warSatchelWalletOwnerProof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store" };
const CHALLENGE_TTL_MS = 5 * 60_000;
const CHALLENGE_HOURLY_LIMIT = 5;
const RECENT_WINDOW_MS = 60 * 60_000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(status: number, detail: string) {
  return NextResponse.json({ detail }, { status, headers: HEADERS });
}
function permitted(request: NextRequest): boolean {
  if (process.env.WAR_SATCHEL_OWNER_PROOF_ENABLED !== "true") return false;
  const origin = request.headers.get("origin");
  // Explicit production-origin authority, never rely on forwarded Host headers.
  return origin === "https://aoe2war.com" &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
async function viewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return null;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { id: true, uid: true, walletAddress: true },
  });
  return user ? { prisma, user } : null;
}
async function bodyWithin(request: NextRequest) {
  const n = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(n) || n < 0 || n > 3072) return null;
  // Content-Length is only advisory: chunked callers may omit or forge it.
  // Enforce the limit while streaming, before allocating the full body.
  const raw = await readWarSatchelBoundedUtf8(request.body, 3072);
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!permitted(request)) return respond(503, "Wallet proof is not enabled for public use.");
  const actor = await viewer(request).catch(() => null);
  if (!actor) return respond(401, "Signed-in account required.");
  if (!actor.user.walletAddress) return respond(409, "Link a Wolo wallet first.");
  try {
    // Serialize all issuance for this owner through its existing User row:
    // concurrent requests must not both observe the old hourly count.
    const challenge = await actor.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM users WHERE id = ${actor.user.id} FOR UPDATE
      `;
      if (locked.length !== 1 || locked[0]?.id !== actor.user.id) {
        throw new Error("SATCHEL_WALLET_OWNER_LOCK_UNAVAILABLE");
      }
      const now = new Date();
      const recentlyIssued = await tx.warSatchelWalletChallenge.count({
        where: {
          userId: actor.user.id,
          issuedAt: { gt: new Date(now.getTime() - RECENT_WINDOW_MS) },
        },
      });
      if (recentlyIssued >= CHALLENGE_HOURLY_LIMIT) return null;
      return tx.warSatchelWalletChallenge.create({
        data: {
          id: randomUUID(),
          nonce: randomBytes(16).toString("hex"),
          userId: actor.user.id,
          ownerUid: actor.user.uid,
          walletAddress: actor.user.walletAddress!,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
        },
      });
    }, { maxWait: 4000, timeout: 7000 });
    if (!challenge) {
      return respond(429, "Too many wallet verification requests; try again later.");
    }
    const witness: SatchelWalletOwnerChallenge = {
      purpose: "satchel-v1:owner-proof",
      ownerUid: challenge.ownerUid,
      walletAddress: challenge.walletAddress,
      nonce: challenge.nonce,
      issuedAtUtc: challenge.issuedAt.toISOString(),
      expiresAtUtc: challenge.expiresAt.toISOString(),
      consumedAtUtc: null,
    };
    return NextResponse.json({
      challengeId: challenge.id,
      chainId: "wolo-1",
      walletAddress: witness.walletAddress,
      message: satchelWalletOwnerChallengeText(witness),
      expiresAtUtc: witness.expiresAtUtc,
      custodyApproved: false,
      creditAuthorized: false,
    }, { status: 201, headers: HEADERS });
  } catch {
    return respond(503, "Wallet verification is temporarily unavailable.");
  }
}

export async function PUT(request: NextRequest) {
  if (!permitted(request)) return respond(503, "Wallet proof is not enabled for public use.");
  const actor = await viewer(request).catch(() => null);
  if (!actor) return respond(401, "Signed-in account required.");
  const data = await bodyWithin(request);
  if (!data || typeof data.challengeId !== "string" || !ID.test(data.challengeId)) {
    return respond(400, "Invalid wallet challenge identifier.");
  }
  const inputSig = data.keplrSignature;
  if (!inputSig || typeof inputSig !== "object" || Array.isArray(inputSig)) {
    return respond(400, "Invalid wallet signature.");
  }
  const sig = inputSig as Record<string, unknown>;
  const pub = sig.pub_key;
  if (typeof sig.signature !== "string" || !pub || typeof pub !== "object" || Array.isArray(pub)) {
    return respond(400, "Invalid wallet signature.");
  }
  const pubRecord = pub as Record<string, unknown>;
  if (typeof pubRecord.type !== "string" || typeof pubRecord.value !== "string") {
    return respond(400, "Invalid wallet signature.");
  }
  const keplrSignature = {
    pub_key: { type: pubRecord.type, value: pubRecord.value },
    signature: sig.signature,
  } satisfies KeplrArbitrarySignature;
  try {
    const { prisma, user } = actor;
    const row = await prisma.warSatchelWalletChallenge.findUnique({
      where: { id: data.challengeId },
    });
    if (!row || row.userId !== user.id || row.ownerUid !== user.uid ||
      row.walletAddress !== user.walletAddress ||
      row.consumedAt !== null || row.expiresAt <= new Date()) {
      return respond(409, "Wallet challenge unavailable or expired.");
    }
    // Limit cryptographic verification attempts with a database atomic CAS.
    const claimAttempt = await prisma.warSatchelWalletChallenge.updateMany({
      where: {
        id: row.id, userId: user.id, consumedAt: null,
        attempts: { lt: 5 }, expiresAt: { gt: new Date() },
      },
      data: { attempts: { increment: 1 } },
    });
    if (claimAttempt.count !== 1) return respond(429, "Wallet challenge attempt limit reached.");

    const witness: SatchelWalletOwnerChallenge = {
      purpose: "satchel-v1:owner-proof",
      ownerUid: row.ownerUid,
      walletAddress: row.walletAddress,
      nonce: row.nonce,
      issuedAtUtc: row.issuedAt.toISOString(),
      expiresAtUtc: row.expiresAt.toISOString(),
      consumedAtUtc: null,
    };
    await verifyWarSatchelWalletOwnerProof({
      challenge: witness,
      authenticatedUid: user.uid,
      authenticatedWalletAddress: user.walletAddress ?? "",
      nowUtc: new Date().toISOString(),
      keplrSignature,
    });
    const consumed = await prisma.warSatchelWalletChallenge.updateMany({
      where: {
        id: row.id, userId: user.id,
        consumedAt: null, expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) return respond(409, "Wallet challenge already used.");
    return NextResponse.json({
      walletControlVerified: true,
      walletAddress: row.walletAddress,
      custodyApproved: false,
      creditAuthorized: false,
      wagerAuthorized: false,
      detail: "Wallet control verified. War Satchel funding is not enabled yet.",
    }, { headers: HEADERS });
  } catch {
    return respond(422, "Wallet signature could not be verified.");
  }
}
