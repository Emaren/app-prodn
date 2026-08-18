import { NextRequest, NextResponse } from "next/server";

import {
  MARKETPLACE_STANDARD_WOLO,
  buildMarketplaceDevelopmentMessage,
  buildMarketplacePaymentMemo,
  marketplaceDisplayName,
  newMarketplacePublicId,
  normalizeMarketplaceText,
  normalizeWoloAddress,
  postMarketplaceProtocolMessage,
  resolveMarketplaceKeeper,
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
        { detail: "Link your WOLO wallet before requesting business development." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      requestText?: unknown;
      requestId?: unknown;
      txHash?: unknown;
      fromAddress?: unknown;
    };
    const action = String(body.action ?? "quote").trim().toLowerCase();
    const keeper = await resolveMarketplaceKeeper(resolved.prisma);

    if (keeper.id === resolved.user.id) {
      return NextResponse.json(
        { detail: "Use the operator workflow for your own Marketplace development notes." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (action === "quote") {
      const requestText = normalizeMarketplaceText(body.requestText, 1200);
      if (!requestText) {
        return NextResponse.json(
          { detail: "Describe what you want developed for your business." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const publicId = newMarketplacePublicId();
      const memo = buildMarketplacePaymentMemo({
        kind: "development",
        shopSlug: resolved.shop.slug,
        publicId,
        amountWolo: MARKETPLACE_STANDARD_WOLO,
      });

      const development = await resolved.prisma.marketplaceInquiry.create({
        data: {
          publicId,
          shopId: resolved.shop.id,
          kind: "development_request",
          requesterUserId: resolved.user.id,
          recipientUserId: keeper.id,
          requesterUidSnapshot: resolved.user.uid,
          requesterDisplayNameSnapshot: marketplaceDisplayName(resolved.user),
          recipientUidSnapshot: keeper.uid,
          recipientDisplayNameSnapshot: keeper.displayName,
          requestText,
          amountWolo: MARKETPLACE_STANDARD_WOLO,
          taxRateBps: 0,
          taxAmountWolo: 0,
          recipientAddressSnapshot: keeper.walletAddress,
          memo,
          status: "awaiting_payment",
        },
      });

      return NextResponse.json(
        {
          ok: true,
          state: "awaiting_payment",
          requestId: development.publicId,
          amountWolo: development.amountWolo,
          recipientAddress: development.recipientAddressSnapshot,
          memo: development.memo,
          fallbackWalletAddress: ownerWallet,
        },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    }

    if (action !== "confirm") {
      return NextResponse.json(
        { detail: "That development action is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const requestId = String(body.requestId ?? "").trim();
    const development = await resolved.prisma.marketplaceInquiry.findUnique({
      where: { publicId: requestId },
    });

    if (
      !development ||
      development.shopId !== resolved.shop.id ||
      development.kind !== "development_request" ||
      development.requesterUserId !== resolved.user.id
    ) {
      return NextResponse.json(
        { detail: "That Marketplace development request could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (development.status === "paid") {
      return NextResponse.json(
        {
          ok: true,
          state: "paid",
          requestId: development.publicId,
          contactHref: `/contact-emaren?user=${encodeURIComponent(keeper.uid)}`,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const proof = await verifyMarketplaceBusinessPayment(resolved.prisma, {
      txHash: body.txHash,
      fromAddress: body.fromAddress,
      expectedFromAddress: ownerWallet,
      toAddress: development.recipientAddressSnapshot,
      amountWolo: development.amountWolo,
      memo: development.memo,
    });

    const now = new Date();
    const result = await resolved.prisma.$transaction(async (tx) => {
      const payment = await tx.marketplacePayment.create({
        data: {
          publicId: newMarketplacePublicId(),
          kind: "development",
          shopId: resolved.shop.id,
          inquiryId: development.id,
          payerUserId: resolved.user.id,
          payeeUserId: keeper.id,
          payerUidSnapshot: resolved.user.uid,
          payerDisplayNameSnapshot: marketplaceDisplayName(resolved.user),
          payeeUidSnapshot: keeper.uid,
          payeeDisplayNameSnapshot: keeper.displayName,
          amountWolo: development.amountWolo,
          taxRateBps: 0,
          taxAmountWolo: 0,
          senderAddressSnapshot: proof.fromAddress,
          recipientAddressSnapshot: proof.toAddress,
          memo: development.memo,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
          verifiedAt: now,
        },
      });

      const protocol = await postMarketplaceProtocolMessage(tx, {
        senderUserId: resolved.user.id,
        targetUserId: keeper.id,
        body: buildMarketplaceDevelopmentMessage({
          shop: resolved.shop.name,
          actor: marketplaceDisplayName(resolved.user),
          amountWolo: development.amountWolo,
          recordId: development.publicId,
          txHash: proof.txHash,
          requestText: development.requestText,
        }),
        now,
      });

      await tx.marketplaceInquiry.update({
        where: { id: development.id },
        data: {
          status: "paid",
          directMessageId: protocol.message.id,
          paidAt: now,
        },
      });

      await recordUserActivity(tx, {
        userId: resolved.user.id,
        type: "market_business_development_paid",
        path: "/profile",
        label: proof.txHash,
        metadata: {
          shopPublicId: resolved.shop.publicId,
          shopSlug: resolved.shop.slug,
          requestPublicId: development.publicId,
          amountWolo: development.amountWolo,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
          messageId: protocol.message.id,
          marketKeeperUid: keeper.uid,
        },
        dedupeWithinSeconds: 0,
      });

      return payment;
    });

    return NextResponse.json(
      {
        ok: true,
        state: "paid",
        requestId: development.publicId,
        amountWolo: result.amountWolo,
        txHash: result.txHash,
        proofUrl: result.proofUrl,
        contactHref: `/contact-emaren?user=${encodeURIComponent(keeper.uid)}`,
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Development request failed.";
    const status = detail.includes("already been used") ? 409 : 500;
    console.error("Marketplace development request failed:", error);
    return NextResponse.json(
      { detail },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
