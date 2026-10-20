/** Private, owner-scoped Wolo Satchel accounting read. No synthetic balances. */
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { satchelFinancialBridgeReady } from "@/lib/warSatchelFinancialBridgeHold";
import { observeFundedMechaPublicReadiness } from "@/lib/warSatchelLiveModeReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const H = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  // Even a read-only balance must not claim a certified ledger when the
  // immutable custody release interlock is active.
  const activated = satchelFinancialBridgeReady() &&
    process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED === "true" &&
    process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED === "true";
  // New financial tables are not installed in production until the explicit
  // seven-file migration frontier is approved. Do not query a missing table.
  if (!activated) return NextResponse.json({
    available: false, depositEnabled: false, wageringEnabled: false,
    availableUwolo: "0", reservedUwolo: "0",
    committedHistoricalUwolo: "0", withdrawalPendingUwolo: "0",
    source: "not_installed_or_not_certified",
  }, { headers: H });

  const uid = await getSessionUid(request);
  if (!uid) return NextResponse.json({ detail: "Sign in required." },
    { status: 401, headers: H });
  try {
    const prisma = getPrisma();
    const owner = await prisma.user.findUnique({ where: { uid }, select: { id: true } });
    if (!owner) return NextResponse.json({ detail: "Not found." },
      { status: 404, headers: H });

    const [account, recent] = await Promise.all([
      prisma.satchelFundedBalance.findUnique({ where: { ownerUserId: owner.id } }),
      prisma.satchelFundedReceipt.findMany({
        where: { ownerUserId: owner.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { txHash: true, amountUwolo: true, canonicalHeight: true, createdAt: true },
      }),
    ]);
    return NextResponse.json({
      available: true,
      chainId: "wolo-1", denom: "uwolo",
      availableUwolo: String(account?.availableUwolo ?? BigInt(0)),
      reservedUwolo: String(account?.reservedUwolo ?? BigInt(0)),
      committedHistoricalUwolo: String(account?.committedUwolo ?? BigInt(0)),
      withdrawalPendingUwolo: String(account?.withdrawalPendingUwolo ?? BigInt(0)),
      version: String(account?.version ?? BigInt(0)),
      depositEnabled: process.env.WAR_SATCHEL_DEPOSIT_INSTRUCTIONS_ENABLED === "true" &&
        process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED === "true" &&
        process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED === "true",
      // This is a read-only display hint. The independent worker separately
      // validates real bank, mandate, signer, market and Watcher authority.
      wageringEnabled: observeFundedMechaPublicReadiness().ready,
      latestDeposits: recent.map(x => ({
        txHash: x.txHash, amountUwolo: String(x.amountUwolo),
        canonicalHeight: String(x.canonicalHeight),
        createdAtUtc: x.createdAt.toISOString(),
      })),
    }, { headers: H });
  } catch {
    return NextResponse.json({ detail: "Satchel ledger unavailable, no inferred credit." },
      { status: 503, headers: H });
  }
}
