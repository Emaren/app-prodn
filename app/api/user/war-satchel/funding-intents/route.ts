/**
 * C2 PREPARATION ONLY: an immutable owner-bound candidate intent.
 *
 * Never returns a transfer destination/memo. No wallet transaction, custody
 * credit, spendable balance, or auto-bet permission is implemented here.
 * A later separately reviewed C3/C4 release owns real deposit instructions.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { warSatchelVaultDistinctFromKnownWallets } from "@/lib/warSatchelVaultBoundary";
import { resolveCommunityTreasuryAddressConfig } from "@/lib/woloCommunityTreasury";
import { satchelDepositMemo } from "@/lib/warSatchelCustodyEvidence";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store" };
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const MAX_WOLO = BigInt(10_000);
const MAX_BODY = 512;
const WINDOW_MS = 60 * 60_000;
const PROOF_FRESH_MS = 5 * 60_000;
const INTENT_TTL_MS = 30 * 60_000;

function response(status: number, detail: string) {
  return NextResponse.json({ detail, depositAuthorized: false, creditAuthorized: false,
    wagerAuthorized: false }, { status, headers: HEADERS });
}
function permitted(request: NextRequest) {
  return process.env.WAR_SATCHEL_NONCREDITING_INTENTS_ENABLED === "true" &&
    process.env.WAR_SATCHEL_OWNER_PROOF_ENABLED === "true" &&
    request.headers.get("origin") === "https://aoe2war.com" &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
function candidateVault() {
  const vault = process.env.WAR_SATCHEL_VAULT_CANDIDATE_ADDRESS?.trim() || "";
  const excluded = [
    process.env.WOLO_BET_ESCROW_ADDRESS,
    process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS,
    process.env.WOLO_CHALLENGE_ESCROW_ADDRESS,
    process.env.NEXT_PUBLIC_WOLO_CHALLENGE_ESCROW_ADDRESS,
    process.env.WOLO_STAKING_WALLET_ADDRESS,
    process.env.WOLO_BET_PAYOUT_ADDRESS,
    process.env.WOLO_COMMUNITY_TREASURY_ADDRESS,
    resolveCommunityTreasuryAddressConfig().address,
  ].map(value => value?.trim() || "").filter(Boolean);
  if (!ADDRESS.test(vault) || excluded.length < 2 || !warSatchelVaultDistinctFromKnownWallets(vault, excluded)) return null;
  return vault;
}
function amountFromBody(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,4}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > BigInt(0) && parsed <= MAX_WOLO ? parsed : null;
}

export async function POST(request: NextRequest) {
  if (!permitted(request)) return response(503, "Non-crediting preparation is disabled.");
  const vault = candidateVault();
  if (!vault) return response(503, "Independent Satchel vault candidate not configured.");

  const uid = await getSessionUid(request);
  if (!uid) return response(401, "Sign in before preparing a Satchel intent.");
  const bodyText = await readWarSatchelBoundedUtf8(request.body, MAX_BODY);
  if (!bodyText) return response(400, "Invalid bounded intent request.");
  let amountWolo: bigint | null = null;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
        Object.keys(parsed).length === 1) {
      amountWolo = amountFromBody((parsed as { amountWolo?: unknown }).amountWolo);
    }
  } catch {
    return response(400, "Invalid intent JSON.");
  }
  if (amountWolo === null) return response(400, "Amount must be 1–10,000 whole WOLO.");

  const prisma = getPrisma();
  const actor = await prisma.user.findUnique({
    where: { uid }, select: { id: true, uid: true, walletAddress: true },
  });
  if (!actor?.walletAddress || !ADDRESS.test(actor.walletAddress)) {
    return response(409, "Link and verify your Keplr wallet first.");
  }
  try {
    const prepared = await prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<{
        id: number; uid: string; wallet_address: string | null;
      }[]>`SELECT id, uid, wallet_address FROM users WHERE id = ${actor.id} FOR UPDATE`;
      if (locked.length !== 1 || locked[0].uid !== uid ||
          locked[0].wallet_address !== actor.walletAddress) {
        throw new Error("OWNER_BINDING_CHANGED");
      }

      const now = new Date();
      const recentProof = await tx.warSatchelWalletChallenge.findFirst({
        where: {
          userId: actor.id, ownerUid: uid, walletAddress: actor.walletAddress!,
          consumedAt: { gte: new Date(now.getTime() - PROOF_FRESH_MS), lte: now },
        },
        orderBy: { consumedAt: "desc" },
        select: { id: true },
      });
      if (!recentProof) throw new Error("RECENT_SIGNED_OWNER_PROOF_REQUIRED");
      const recentIntents = await tx.warSatchelDepositIntent.count({
        where: { userId: actor.id,
          createdAt: { gte: new Date(now.getTime() - WINDOW_MS) } },
      });
      if (recentIntents >= 3) throw new Error("INTENT_RATE_LIMIT");
      const proofWindowIntents = await tx.warSatchelDepositIntent.count({
        where: { userId: actor.id,
          createdAt: { gte: new Date(now.getTime() - PROOF_FRESH_MS) } },
      });
      if (proofWindowIntents > 0) throw new Error("OWNER_PROOF_ALREADY_USED_FOR_PREPARATION");
      const outstanding = await tx.warSatchelDepositIntent.count({
        where: { userId: actor.id, status: { in: ["prepared", "submitted"] },
          expiresAt: { gt: now } },
      });
      if (outstanding > 0) throw new Error("ONE_ACTIVE_INTENT_PER_OWNER");

      const nonce = randomBytes(24).toString("base64url");
      const memo = satchelDepositMemo(uid, nonce);
      return tx.warSatchelDepositIntent.create({
        data: {
          id: randomUUID(), userId: actor.id, chainId: "wolo-1",
          senderAddress: actor.walletAddress!, vaultAddress: vault,
          amountUwolo: amountWolo! * BigInt(1_000_000),
          memo, nonce, status: "prepared",
          expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
        },
        select: { id: true, amountUwolo: true, createdAt: true, expiresAt: true },
      });
    }, { isolationLevel: "Serializable", maxWait: 4000, timeout: 7000 });
    return NextResponse.json({
      id: prepared.id, amountUwolo: prepared.amountUwolo.toString(),
      createdAtUtc: prepared.createdAt.toISOString(),
      expiresAtUtc: prepared.expiresAt.toISOString(),
      state: "PREPARED_UNFUNDABLE",
      vaultAddress: null, transferMemo: null,
      depositAuthorized: false, creditAuthorized: false, wagerAuthorized: false,
    }, { status: 201, headers: HEADERS });
  } catch {
    return response(409, "Preparation refused: signed owner proof, owner lock, rate, or exclusive intent unavailable.");
  }
}
