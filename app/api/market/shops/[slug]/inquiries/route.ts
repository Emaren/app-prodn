import { NextRequest, NextResponse } from "next/server";

import {
  MARKETPLACE_BUSINESS_TAX_BPS,
  MARKETPLACE_STANDARD_WOLO,
  buildMarketplaceInquiryMessage,
  buildMarketplacePaymentMemo,
  marketplaceDisplayName,
  marketplaceTaxAmount,
  newMarketplacePublicId,
  normalizeMarketplaceText,
  normalizeWoloAddress,
  postMarketplaceProtocolMessage,
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

type RouteContext = {
  params: Promise<{ slug: string }>;
};

async function resolveViewer(request: NextRequest) {
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

  return user ? { prisma, user } : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const resolved = await resolveViewer(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "Sign in before approaching a Marketplace business." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
    const shop = await resolved.prisma.marketplaceShop.findUnique({
      where: { slug },
      include: {
        owner: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
      },
    });

    if (!shop || shop.status !== "active" || shop.kind !== "player") {
      return NextResponse.json(
        { detail: "That player business is not available." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (!shop.displayEnabled) {
      return NextResponse.json(
        { detail: "The merchant has closed this awning for now." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    const owner = shop.owner;
    const ownerUserId = shop.ownerUserId;
    if (!owner || ownerUserId === null) {
      return NextResponse.json(
        { detail: "This business has no active proprietor." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    if (ownerUserId === resolved.user.id) {
      return NextResponse.json(
        { detail: "You cannot submit a paid inquiry to your own business." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const viewerWallet = normalizeWoloAddress(resolved.user.walletAddress);
    const ownerWallet = normalizeWoloAddress(owner.walletAddress);
    if (!viewerWallet) {
      return NextResponse.json(
        { detail: "Link your WOLO wallet before making a paid inquiry." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    if (!ownerWallet) {
      return NextResponse.json(
        { detail: "The merchant has not linked a WOLO receiving wallet." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      requestText?: unknown;
      inquiryId?: unknown;
      txHash?: unknown;
      fromAddress?: unknown;
    };
    const action = String(body.action ?? "quote").trim().toLowerCase();

    if (action === "quote") {
      const requestText = normalizeMarketplaceText(body.requestText, 1200);
      if (!requestText) {
        return NextResponse.json(
          { detail: "Tell the merchant what you want to buy or have made." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const publicId = newMarketplacePublicId();
      const memo = buildMarketplacePaymentMemo({
        kind: "inquiry",
        shopSlug: shop.slug,
        publicId,
        amountWolo: MARKETPLACE_STANDARD_WOLO,
      });
      const taxAmountWolo = marketplaceTaxAmount(MARKETPLACE_STANDARD_WOLO);

      const inquiry = await resolved.prisma.marketplaceInquiry.create({
        data: {
          publicId,
          shopId: shop.id,
          kind: "customer_request",
          requesterUserId: resolved.user.id,
          recipientUserId: ownerUserId,
          requesterUidSnapshot: resolved.user.uid,
          requesterDisplayNameSnapshot: marketplaceDisplayName(resolved.user),
          recipientUidSnapshot: owner.uid,
          recipientDisplayNameSnapshot: marketplaceDisplayName(owner),
          requestText,
          amountWolo: MARKETPLACE_STANDARD_WOLO,
          taxRateBps: MARKETPLACE_BUSINESS_TAX_BPS,
          taxAmountWolo,
          recipientAddressSnapshot: ownerWallet,
          memo,
          status: "awaiting_payment",
        },
      });

      return NextResponse.json(
        {
          ok: true,
          state: "awaiting_payment",
          inquiryId: inquiry.publicId,
          amountWolo: inquiry.amountWolo,
          recipientAddress: inquiry.recipientAddressSnapshot,
          memo: inquiry.memo,
          fallbackWalletAddress: viewerWallet,
        },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    }

    if (action !== "confirm") {
      return NextResponse.json(
        { detail: "That inquiry action is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const inquiryId = String(body.inquiryId ?? "").trim();
    const inquiry = await resolved.prisma.marketplaceInquiry.findUnique({
      where: { publicId: inquiryId },
    });

    if (
      !inquiry ||
      inquiry.shopId !== shop.id ||
      inquiry.kind !== "customer_request" ||
      inquiry.requesterUserId !== resolved.user.id
    ) {
      return NextResponse.json(
        { detail: "That Marketplace inquiry could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (inquiry.status === "paid") {
      return NextResponse.json(
        {
          ok: true,
          state: "paid",
          inquiryId: inquiry.publicId,
          contactHref: `/contact-emaren?user=${encodeURIComponent(owner.uid)}`,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const proof = await verifyMarketplaceBusinessPayment(resolved.prisma, {
      txHash: body.txHash,
      fromAddress: body.fromAddress,
      expectedFromAddress: viewerWallet,
      toAddress: inquiry.recipientAddressSnapshot,
      amountWolo: inquiry.amountWolo,
      memo: inquiry.memo,
    });

    const now = new Date();
    const result = await resolved.prisma.$transaction(async (tx) => {
      const payment = await tx.marketplacePayment.create({
        data: {
          publicId: newMarketplacePublicId(),
          kind: "inquiry",
          shopId: shop.id,
          inquiryId: inquiry.id,
          payerUserId: resolved.user.id,
          payeeUserId: ownerUserId,
          payerUidSnapshot: resolved.user.uid,
          payerDisplayNameSnapshot: marketplaceDisplayName(resolved.user),
          payeeUidSnapshot: owner.uid,
          payeeDisplayNameSnapshot: marketplaceDisplayName(owner),
          amountWolo: inquiry.amountWolo,
          taxRateBps: inquiry.taxRateBps,
          taxAmountWolo: inquiry.taxAmountWolo,
          senderAddressSnapshot: proof.fromAddress,
          recipientAddressSnapshot: proof.toAddress,
          memo: inquiry.memo,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
          verifiedAt: now,
        },
      });

      const protocol = await postMarketplaceProtocolMessage(tx, {
        senderUserId: resolved.user.id,
        targetUserId: ownerUserId,
        body: buildMarketplaceInquiryMessage({
          shop: shop.name,
          actor: marketplaceDisplayName(resolved.user),
          amountWolo: inquiry.amountWolo,
          recordId: inquiry.publicId,
          txHash: proof.txHash,
          requestText: inquiry.requestText,
        }),
        now,
      });

      const updated = await tx.marketplaceInquiry.update({
        where: { id: inquiry.id },
        data: {
          status: "paid",
          directMessageId: protocol.message.id,
          paidAt: now,
        },
      });

      await recordUserActivity(tx, {
        userId: resolved.user.id,
        type: "market_business_inquiry_paid",
        path: shop.href,
        label: proof.txHash,
        metadata: {
          shopPublicId: shop.publicId,
          shopSlug: shop.slug,
          inquiryPublicId: inquiry.publicId,
          amountWolo: inquiry.amountWolo,
          taxRateBps: inquiry.taxRateBps,
          taxAmountWolo: inquiry.taxAmountWolo,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
          messageId: protocol.message.id,
        },
        dedupeWithinSeconds: 0,
      });

      return { payment, updated };
    });

    return NextResponse.json(
      {
        ok: true,
        state: "paid",
        inquiryId: result.updated.publicId,
        amountWolo: result.payment.amountWolo,
        txHash: result.payment.txHash,
        proofUrl: result.payment.proofUrl,
        contactHref: `/contact-emaren?user=${encodeURIComponent(owner.uid)}`,
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Marketplace inquiry failed.";
    const status = detail.includes("already been used") ? 409 : 500;
    console.error("Marketplace inquiry failed:", error);
    return NextResponse.json(
      { detail },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
