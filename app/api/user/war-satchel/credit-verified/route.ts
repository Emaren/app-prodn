/**
 * Finalize ONLY an independently verified owner-bound Keplr deposit into
 * a genuinely audited Satchel ledger. Disabled until the vault signer,
 * withdrawals and full refund recovery are independently certified.
 *
 * Untrusted caller supplies ONLY an owned prepared intent ID and tx hash;
 * never amount, owner, chain evidence, vault address, or a fake balance.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { satchelFinancialBridgeReady } from "@/lib/warSatchelFinancialBridgeHold";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";
import { authenticateOwnerDeposit } from "@/lib/warSatchelAuthenticatedDeposit";
import { recordUncreditedWarSatchelReceipt } from "@/lib/warSatchelUncreditedProofRecorder";
import { readIndependentSatchelBank, creditRecordedSatchelProof } from "@/lib/warSatchelFundedLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const H = { "Cache-Control": "private, no-store" };
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[A-F0-9]{64}$/;

function fail(status: number, detail: string) {
  return NextResponse.json({ detail, credited: false }, { status, headers: H });
}
function enabled() {
  // Source-level interlock precedes any REST lookup or preliminary ledger write.
  return satchelFinancialBridgeReady() &&
    process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED === "true" &&
    process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED === "true" &&
    process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED === "true" &&
    process.env.WAR_SATCHEL_OWNER_PROOF_ENABLED === "true" &&
    process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED === "true" &&
    process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED === "true" &&
    process.env.WAR_SATCHEL_FUNDED_CREDIT_ENABLED === "true";
}
export async function POST(request: NextRequest) {
  if (!enabled()) return fail(503, "War Satchel funded credit is not yet authorized.");
  if (request.headers.get("origin") !== "https://aoe2war.com" ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "Origin forbidden.");
  }
  const uid = await getSessionUid(request);
  if (!uid) return fail(401, "Sign in to credit your own deposit.");

  const raw = await readWarSatchelBoundedUtf8(request.body, 256);
  let intentId = "", txHash = "";
  try {
    const input: unknown = JSON.parse(raw || "");
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).sort().join(",") !== "intentId,txHash") return fail(400, "Invalid credit fields.");
    const body = input as Record<string, unknown>;
    if (typeof body.intentId === "string") intentId = body.intentId;
    if (typeof body.txHash === "string") txHash = body.txHash.toUpperCase();
  } catch { return fail(400, "Invalid credit JSON."); }
  if (!ID.test(intentId) || !HASH.test(txHash)) return fail(400, "Invalid intent or transaction identity.");

  try {
    const prisma = getPrisma();
    const owner = await prisma.user.findUnique({
      where: { uid }, select: { id: true, uid: true, walletAddress: true },
    });
    if (!owner?.walletAddress) return fail(409, "Linked Keplr wallet required.");
    const vault = (process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS || "").trim();
    const intent = await prisma.warSatchelDepositIntent.findFirst({
      where: {
        id: intentId, userId: owner.id, senderAddress: owner.walletAddress,
        chainId: "wolo-1", status: "prepared", vaultAddress: vault,
      },
      select: {
        id: true, chainId: true, senderAddress: true, vaultAddress: true,
        amountUwolo: true, memo: true, status: true, createdAt: true, expiresAt: true,
      },
    });
    if (!intent) return fail(404, "No matching owned immutable intent.");

    // Physical execution must be authenticated by the independently pinned
    // WoloChain Comet verifier. The old REST-only canonical JSON cannot give
    // this route custody authority, even when two gateways agree.
    const immutable = {
      id: intent.id, chainId: intent.chainId,
      senderAddress: intent.senderAddress, vaultAddress: intent.vaultAddress,
      amountUwolo: intent.amountUwolo.toString(), memo: intent.memo,
      status: intent.status,
      createdAtUtc: intent.createdAt.toISOString(),
      expiresAtUtc: intent.expiresAt.toISOString(),
    };
    const [verified, bank] = await Promise.all([
      authenticateOwnerDeposit({
        intentId: intent.id, ownerUid: owner.uid,
        sender: owner.walletAddress, vault,
        amountUwolo: intent.amountUwolo.toString(), memo: intent.memo,
        createdAtUtc: immutable.createdAtUtc,
        expiresAtUtc: immutable.expiresAtUtc, txHash,
      }),
      readIndependentSatchelBank(),
    ]);
    // Persist an UNCredited candidate first. The durable single-owner vault
    // transaction below, never this evidence row, decides financial posting.
    await recordUncreditedWarSatchelReceipt(prisma, {
      ownerUserId: owner.id, ownerUid: owner.uid,
      ownerWallet: owner.walletAddress, storedIntent: immutable,
      canonicalProof: {
        kind: "canonical_chain_candidate_uncredited",
        receiptKey: verified.receiptId, txHash: verified.txHash,
        height: verified.height.toString(), confirmations: "3",
        intentId: intent.id, ownerUid: owner.uid,
        canonicalSendCount: 1, chainId: "wolo-1", denom: "uwolo",
        creditAuthorized: false, depositAuthorized: false,
        wagerAuthorized: false,
      },
    });
    const storedProof = await prisma.warSatchelProofCandidate.findUnique({
      where: { intentId: intent.id },
      select: { id: true, txHash: true, userId: true },
    });
    if (!storedProof || storedProof.userId !== owner.id ||
        storedProof.txHash !== txHash) throw Error("receipt id mismatch");
    const credited = await creditRecordedSatchelProof(prisma, {
      ownerUserId: owner.id, ownerUid: owner.uid,
      proofCandidateId: storedProof.id, expectedTxHash: txHash,
      authenticatedDeposit: verified, bank,
    });
    return NextResponse.json({
      credited: true, state: credited.status,
      receiptId: credited.receiptId,
      availableUwolo: credited.availableUwolo,
      chainId: "wolo-1", denom: "uwolo",
    }, { headers: H });
  } catch {
    // No retry-side synthetic credits, no "pending" balance on network errors.
    return fail(409, "Deposit proof, canonical chain or physical vault liabilities did not pass verification.");
  }
}
