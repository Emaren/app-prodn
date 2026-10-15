/**
 * C3 evidence-only: independently query canonical wolo-1 bank-send bytes for
 * a PREPARED_UNFUNDABLE, previously Keplr-bound server database intent.
 * No wallet destination returned, ledger writes, custody credits or wagers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { warSatchelVaultDistinctFromKnownWallets } from "@/lib/warSatchelVaultBoundary";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";
import { inspectCanonicalSatchelDeposit } from "@/lib/warSatchelCanonicalReceipt";
import { recordUncreditedWarSatchelReceipt } from "@/lib/warSatchelUncreditedProofRecorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADER = { "Cache-Control": "private, no-store" };
const HASH = /^[a-fA-F0-9]{64}$/;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ADDR = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const RPC = "https://rpc-mainnet.aoe2war.com";
const REST = "https://rest-mainnet.aoe2war.com";
const LIMIT = 256 * 1024;

function fail(status: number, detail: string) {
  return NextResponse.json({
    detail, depositAuthorized: false, creditAuthorized: false, wagerAuthorized: false,
  }, { status, headers: HEADER });
}
async function canonicalJson(url: string) {
  if (!(url === RPC + "/status" || /^https:\/\/rest-mainnet\.aoe2war\.com\/cosmos\/tx\/v1beta1\/txs\/[A-F0-9]{64}$/.test(url))) {
    throw new Error("UNTRUSTED_CHAIN_URL");
  }
  const response = await fetch(url, { method: "GET", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(6500), headers: { Accept: "application/json" } });
  if (!response.ok || response.status !== 200 ||
      Number(response.headers.get("content-length") || "0") > LIMIT) {
    throw new Error("CHAIN_NOT_AVAILABLE");
  }
  const text = await readWarSatchelBoundedUtf8(response.body, LIMIT);
  if (!text) throw new Error("CHAIN_EVIDENCE_UNREADABLE");
  return JSON.parse(text) as unknown;
}
function auditedVault() {
  const vault = (process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS || "").trim();
  const excluded = [
    process.env.WOLO_BET_ESCROW_ADDRESS,
    process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS,
    process.env.WOLO_CHALLENGE_ESCROW_ADDRESS,
    process.env.NEXT_PUBLIC_WOLO_CHALLENGE_ESCROW_ADDRESS,
    process.env.WOLO_BET_PAYOUT_ADDRESS,
    process.env.WOLO_STAKING_WALLET_ADDRESS,
    process.env.WOLO_COMMUNITY_TREASURY_ADDRESS,
  ].map(x => x?.trim()).filter(Boolean);
  if (!ADDR.test(vault) || excluded.length < 2 || !warSatchelVaultDistinctFromKnownWallets(vault, excluded)) return null;
  return vault;
}

export async function POST(request: NextRequest) {
  if (process.env.WAR_SATCHEL_CANONICAL_RECEIPT_AUDIT_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_OWNER_PROOF_ENABLED !== "true") {
    return fail(503, "War Satchel canonical proof audit is disabled.");
  }
  if (request.headers.get("origin") !== "https://aoe2war.com" ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "War Satchel proof audit origin refused.");
  }
  const vault = auditedVault();
  if (!vault) return fail(503, "An independent Wolo Satchel vault has not been certified.");
  const uid = await getSessionUid(request);
  if (!uid) return fail(401, "Sign in to review your own immutable receipt.");
  const raw = await readWarSatchelBoundedUtf8(request.body, 256);
  if (!raw) return fail(400, "Invalid bounded receipt request.");
  let id = "", hash = "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        Object.keys(parsed).sort().join(",") !== "intentId,txHash") return fail(400, "Invalid fields.");
    const body = parsed as { intentId?: unknown; txHash?: unknown };
    if (typeof body.intentId !== "string" || typeof body.txHash !== "string") return fail(400, "Invalid fields.");
    id = body.intentId;
    hash = body.txHash.toUpperCase();
  } catch { return fail(400, "Invalid JSON."); }
  if (!ID.test(id) || !HASH.test(hash)) return fail(400, "Invalid intent or chain hash.");
  const prisma = getPrisma();
  const owner = await prisma.user.findUnique({ where: { uid },
    select: { id: true, uid: true, walletAddress: true } });
  if (!owner?.walletAddress || !ADDR.test(owner.walletAddress)) return fail(409, "Wallet ownership unavailable.");
  const intent = await prisma.warSatchelDepositIntent.findFirst({
    where: { id, userId: owner.id, senderAddress: owner.walletAddress,
      chainId: "wolo-1", vaultAddress: vault, status: "prepared" },
    select: { id: true, chainId: true, senderAddress: true, vaultAddress: true,
      amountUwolo: true, memo: true, status: true, createdAt: true, expiresAt: true },
  });
  if (!intent) return fail(404, "No matching owned prepared intent.");
  try {
    const [chainStatus, txResponse] = await Promise.all([
      canonicalJson(RPC + "/status"),
      canonicalJson(REST + "/cosmos/tx/v1beta1/txs/" + hash),
    ]);
    const verified = inspectCanonicalSatchelDeposit({
      immutableIntent: {
        id: intent.id, chainId: intent.chainId, senderAddress: intent.senderAddress,
        vaultAddress: intent.vaultAddress, amountUwolo: intent.amountUwolo.toString(),
        memo: intent.memo, status: intent.status,
        createdAtUtc: intent.createdAt.toISOString(),
        expiresAtUtc: intent.expiresAt.toISOString(),
      },
      ownerUid: owner.uid, ownerWallet: owner.walletAddress,
      certifiedVault: vault, hash, chainStatus, txResponse,
      nowUtc: new Date().toISOString(),
    });
    // Additional opt-in: insert immutable, globally unique evidence under
    // owner/intent row locks. SQL categorically forbids live credits here.
    // Disabled by default and NEVER a wallet-deposit or spending authority.
    const recorded = process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED === "true"
      ? await recordUncreditedWarSatchelReceipt(prisma, {
          ownerUserId: owner.id, ownerUid: uid,
          ownerWallet: owner.walletAddress,
          storedIntent: {
            id: intent.id, chainId: intent.chainId, senderAddress: intent.senderAddress,
            vaultAddress: intent.vaultAddress, amountUwolo: intent.amountUwolo.toString(),
            memo: intent.memo, status: intent.status,
            createdAtUtc: intent.createdAt.toISOString(),
            expiresAtUtc: intent.expiresAt.toISOString(),
          },
          canonicalProof: verified,
        })
      : null;
    return NextResponse.json({
      state: recorded?.state || "CANONICAL_EVIDENCE_ONLY_UNCREDITED",
      receiptKey: verified.receiptKey,
      height: verified.height, confirmations: verified.confirmations,
      depositAuthorized: false, creditAuthorized: false, wagerAuthorized: false,
    }, { status: 200, headers: HEADER });
  } catch {
    return fail(409, "Canonical chain or exact intent evidence could not be verified.");
  }
}
