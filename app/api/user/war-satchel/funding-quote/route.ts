/**
 * C4 owner-bound Keplr bank-send QUOTE. By default FAIL CLOSED.
 * The presence of these source files does NOT provision a real vault or
 * authorize funds to be transferred. An independent key custody certificate,
 * signed operator rollout and live chain/ledger proof are required.
 *
 * POST body is ONLY { intentId }; never accepts destination, amount or memo.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";
import { readIndependentSatchelBank } from "@/lib/warSatchelFundedLedger";
import { satchelFinancialBridgeReady } from "@/lib/warSatchelFinancialBridgeHold";
import { warSatchelVaultDistinctFromKnownWallets } from "@/lib/warSatchelVaultBoundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store" };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function disabled() {
  return NextResponse.json({ enabled: false, detail: "War Satchel deposits are not enabled yet." },
    { status: 503, headers: HEADERS });
}
function isEnabled() {
  return satchelFinancialBridgeReady() &&
    process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED === "true" &&
    process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED === "true" &&
    process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED === "true" &&
    process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED === "true" &&
    process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED === "true" &&
    process.env.WAR_SATCHEL_DEPOSIT_INSTRUCTIONS_ENABLED === "true" &&
    process.env.WAR_SATCHEL_FUNDED_CREDIT_ENABLED === "true" &&
    process.env.WAR_SATCHEL_NONCREDITING_INTENTS_ENABLED === "true" &&
    process.env.WAR_SATCHEL_CANONICAL_RECEIPT_AUDIT_ENABLED === "true" &&
    process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED === "true" &&
    process.env.WAR_SATCHEL_OWNER_PROOF_ENABLED === "true";
}
export async function POST(request: NextRequest) {
  if (!isEnabled()) return disabled();
  if (request.headers.get("origin") !== "https://aoe2war.com" ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ detail: "Unauthorized request origin." },
      { status: 403, headers: HEADERS });
  }
  const uid = await getSessionUid(request);
  if (!uid) return NextResponse.json({ detail: "Sign in required." },
    { status: 401, headers: HEADERS });

  const text = await readWarSatchelBoundedUtf8(request.body, 128);
  let intentId: string | null = null;
  try {
    const body: unknown = JSON.parse(text ?? "");
    if (body && typeof body === "object" && !Array.isArray(body) &&
        Object.keys(body).length === 1) {
      const value = (body as Record<string, unknown>).intentId;
      if (typeof value === "string" && UUID.test(value)) intentId = value;
    }
  } catch { /* malformed bodies stay invalid */ }
  if (!intentId) return NextResponse.json({ detail: "Invalid intent." },
    { status: 400, headers: HEADERS });

  try {
    const prisma = getPrisma();
    const owner = await prisma.user.findUnique({
      where: { uid }, select: { id: true, walletAddress: true },
    });
    if (!owner?.walletAddress) throw Error("no linked wallet");
    const control = await prisma.warSatchelWalletChallenge.findFirst({
      where: {
        userId: owner.id, walletAddress: owner.walletAddress,
        consumedAt: { not: null },
      },
      orderBy: { consumedAt: "desc" },
      select: { consumedAt: true },
    });
    if (!control?.consumedAt) throw Error("missing signed control proof");

    const intent = await prisma.warSatchelDepositIntent.findFirst({
      where: {
        id: intentId, userId: owner.id,
        senderAddress: owner.walletAddress,
        chainId: "wolo-1", status: "prepared",
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true, senderAddress: true, vaultAddress: true,
        amountUwolo: true, memo: true, expiresAt: true,
      },
    });
    if (!intent || intent.amountUwolo <= BigInt(0) ||
        intent.amountUwolo > BigInt(10000) * BigInt(1000000)) throw Error("missing current intent");

    const vault = (process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS || "").trim();
    const excluded = [
      process.env.WOLO_BET_ESCROW_ADDRESS,
      process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS,
      process.env.WOLO_BET_PAYOUT_ADDRESS,
      process.env.WOLO_STAKING_WALLET_ADDRESS,
      process.env.WOLO_CHALLENGE_ESCROW_ADDRESS,
    ];
    const candidate = (process.env.WAR_SATCHEL_VAULT_CANDIDATE_ADDRESS || "").trim();
    // The C2 intent compiler and the C4 signing quote must refer to the
    // SAME independently certified wallet. Otherwise no bank send is safe.
    if (intent.vaultAddress !== vault || candidate !== vault ||
        !warSatchelVaultDistinctFromKnownWallets(vault, excluded)) throw Error("uncertified vault");
    const chain = await readIndependentSatchelBank();
    if (chain.vaultAddress !== vault) throw Error("bank authority mismatch");

    return NextResponse.json({
      enabled: true,
      ownerWalletAddress: intent.senderAddress,
      chainId: "wolo-1",
      denom: "uwolo",
      recipientAddress: vault,
      amountUwolo: intent.amountUwolo.toString(),
      memo: intent.memo,
      intentId: intent.id,
      expiresAtUtc: intent.expiresAt.toISOString(),
      bankHeightAtQuote: chain.height.toString(),
      // This is a user-initiated Keplr signing quote, NOT a credit.
      credited: false,
      wagerPlaced: false,
    }, { headers: HEADERS });
  } catch {
    return disabled();
  }
}
