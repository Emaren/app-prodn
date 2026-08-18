import { NextRequest, NextResponse } from "next/server";

import {
  buildMarketplacePaymentMemo,
  marketplaceDisplayName,
  newMarketplacePublicId,
  normalizeWoloAddress,
  resolveMarketplaceTreasuryAddress,
  verifyMarketplaceBusinessPayment,
} from "@/lib/marketplaceBusiness";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

async function resolveOwner(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      walletAddress: true,
    },
  });
  if (!user) return null;

  const shop = await prisma.marketplaceShop.findFirst({
    where: {
      ownerUserId: user.id,
      status: "active",
    },
    orderBy: { id: "asc" },
  });

  return shop ? { prisma, user, shop } : null;
}

async function taxDue(prisma: ReturnType<typeof getPrisma>, shopId: number) {
  const payments = await prisma.marketplacePayment.findMany({
    where: { shopId },
    select: {
      kind: true,
      amountWolo: true,
      taxAmountWolo: true,
    },
  });

  const accrued = payments
    .filter((payment) => payment.kind === "inquiry" || payment.kind === "invoice")
    .reduce((sum, payment) => sum + payment.taxAmountWolo, 0);
  const paid = payments
    .filter((payment) => payment.kind === "tax")
    .reduce((sum, payment) => sum + payment.amountWolo, 0);

  return Math.max(0, accrued - paid);
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveOwner(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "Sign in as an active Marketplace proprietor." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const ownerWallet = normalizeWoloAddress(resolved.user.walletAddress);
    if (!ownerWallet) {
      return NextResponse.json(
        { detail: "Link your WOLO wallet before paying Kingdom tax." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      taxPaymentId?: unknown;
      txHash?: unknown;
      fromAddress?: unknown;
    };
    const action = String(body.action ?? "quote").trim().toLowerCase();

    if (action === "quote") {
      const amountWolo = await taxDue(resolved.prisma, resolved.shop.id);
      if (amountWolo <= 0) {
        return NextResponse.json(
          { detail: "This business has no Kingdom tax due." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      const publicId = newMarketplacePublicId();
      const treasuryAddress = resolveMarketplaceTreasuryAddress();
      const memo = buildMarketplacePaymentMemo({
        kind: "tax",
        shopSlug: resolved.shop.slug,
        publicId,
        amountWolo,
      });

      const taxPayment = await resolved.prisma.marketplaceTaxPayment.create({
        data: {
          publicId,
          shopId: resolved.shop.id,
          amountWolo,
          treasuryAddressSnapshot: treasuryAddress,
          memo,
          status: "awaiting_payment",
        },
      });

      return NextResponse.json(
        {
          ok: true,
          state: "awaiting_payment",
          taxPaymentId: taxPayment.publicId,
          amountWolo: taxPayment.amountWolo,
          recipientAddress: taxPayment.treasuryAddressSnapshot,
          memo: taxPayment.memo,
          fallbackWalletAddress: ownerWallet,
        },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    }

    if (action !== "confirm") {
      return NextResponse.json(
        { detail: "That tax action is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const taxPaymentId = String(body.taxPaymentId ?? "").trim();
    const taxPayment = await resolved.prisma.marketplaceTaxPayment.findUnique({
      where: { publicId: taxPaymentId },
      include: { payment: true },
    });

    if (!taxPayment || taxPayment.shopId !== resolved.shop.id) {
      return NextResponse.json(
        { detail: "That Marketplace tax payment could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (taxPayment.status === "paid" && taxPayment.payment) {
      return NextResponse.json(
        {
          ok: true,
          state: "paid",
          taxPaymentId: taxPayment.publicId,
          txHash: taxPayment.payment.txHash,
          proofUrl: taxPayment.payment.proofUrl,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const currentDue = await taxDue(resolved.prisma, resolved.shop.id);
    if (taxPayment.amountWolo > currentDue) {
      return NextResponse.json(
        { detail: "The tax ledger changed. Request a fresh tax quote before paying." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const proof = await verifyMarketplaceBusinessPayment(resolved.prisma, {
      txHash: body.txHash,
      fromAddress: body.fromAddress,
      expectedFromAddress: ownerWallet,
      toAddress: taxPayment.treasuryAddressSnapshot,
      amountWolo: taxPayment.amountWolo,
      memo: taxPayment.memo,
    });

    const now = new Date();
    const payment = await resolved.prisma.$transaction(async (tx) => {
      const row = await tx.marketplacePayment.create({
        data: {
          publicId: newMarketplacePublicId(),
          kind: "tax",
          shopId: resolved.shop.id,
          payerUserId: resolved.user.id,
          payeeUserId: null,
          payerUidSnapshot: resolved.user.uid,
          payerDisplayNameSnapshot: marketplaceDisplayName(resolved.user),
          payeeUidSnapshot: null,
          payeeDisplayNameSnapshot: "Community Treasury",
          amountWolo: taxPayment.amountWolo,
          taxRateBps: 0,
          taxAmountWolo: 0,
          senderAddressSnapshot: proof.fromAddress,
          recipientAddressSnapshot: proof.toAddress,
          memo: taxPayment.memo,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
          verifiedAt: now,
        },
      });

      await tx.marketplaceTaxPayment.update({
        where: { id: taxPayment.id },
        data: {
          status: "paid",
          paymentId: row.id,
          paidAt: now,
        },
      });

      await recordUserActivity(tx, {
        userId: resolved.user.id,
        type: "market_business_tax_paid",
        path: "/profile",
        label: proof.txHash,
        metadata: {
          shopPublicId: resolved.shop.publicId,
          shopSlug: resolved.shop.slug,
          taxPaymentPublicId: taxPayment.publicId,
          amountWolo: taxPayment.amountWolo,
          treasuryAddress: proof.toAddress,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
        },
        dedupeWithinSeconds: 0,
      });

      return row;
    });

    return NextResponse.json(
      {
        ok: true,
        state: "paid",
        taxPaymentId: taxPayment.publicId,
        amountWolo: payment.amountWolo,
        txHash: payment.txHash,
        proofUrl: payment.proofUrl,
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Tax payment failed.";
    const status = detail.includes("already been used") ? 409 : 500;
    console.error("Marketplace tax payment failed:", error);
    return NextResponse.json(
      { detail },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
