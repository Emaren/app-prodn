import { NextRequest, NextResponse } from "next/server";

import {
  MARKETPLACE_BUSINESS_TAX_BPS,
  buildMarketplaceInvoiceMessage,
  buildMarketplacePaymentMemo,
  marketplaceDisplayName,
  marketplaceTaxAmount,
  newMarketplacePublicId,
  normalizeInvoiceAmount,
  normalizeMarketplaceText,
  normalizeWoloAddress,
  postMarketplaceProtocolMessage,
} from "@/lib/marketplaceBusiness";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function POST(request: NextRequest) {
  try {
    const uid = await getSessionUid(request);
    if (!uid) {
      return NextResponse.json(
        { detail: "Sign in to issue a Marketplace invoice." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const prisma = getPrisma();
    const owner = await prisma.user.findUnique({
      where: { uid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
      },
    });
    if (!owner) {
      return NextResponse.json(
        { detail: "Your profile could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const shop = await prisma.marketplaceShop.findFirst({
      where: {
        ownerUserId: owner.id,
        status: "active",
      },
      orderBy: { id: "asc" },
    });
    if (!shop) {
      return NextResponse.json(
        { detail: "You do not own an active Marketplace business." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const ownerWallet = normalizeWoloAddress(owner.walletAddress);
    if (!ownerWallet) {
      return NextResponse.json(
        { detail: "Link your WOLO wallet before issuing invoices." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      inquiryId?: unknown;
      amountWolo?: unknown;
      description?: unknown;
    };
    const inquiryId = String(body.inquiryId ?? "").trim();
    const amountWolo = normalizeInvoiceAmount(body.amountWolo);
    const description = normalizeMarketplaceText(body.description, 1200);

    if (!amountWolo) {
      return NextResponse.json(
        { detail: "Invoices must be at least 100 WOLO and use 100-WOLO increments." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!description) {
      return NextResponse.json(
        { detail: "Describe the work or goods being invoiced." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const inquiry = await prisma.marketplaceInquiry.findUnique({
      where: { publicId: inquiryId },
    });
    if (
      !inquiry ||
      inquiry.shopId !== shop.id ||
      inquiry.kind !== "customer_request" ||
      inquiry.status !== "paid"
    ) {
      return NextResponse.json(
        { detail: "Invoices can only be issued to a customer with a paid inquiry." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const publicId = newMarketplacePublicId();
    const memo = buildMarketplacePaymentMemo({
      kind: "invoice",
      shopSlug: shop.slug,
      publicId,
      amountWolo,
    });
    const taxAmountWolo = marketplaceTaxAmount(amountWolo);
    const now = new Date();

    const invoice = await prisma.$transaction(async (tx) => {
      const row = await tx.marketplaceInvoice.create({
        data: {
          publicId,
          shopId: shop.id,
          inquiryId: inquiry.id,
          issuerUserId: owner.id,
          customerUserId: inquiry.requesterUserId,
          issuerUidSnapshot: owner.uid,
          issuerDisplayNameSnapshot: marketplaceDisplayName(owner),
          customerUidSnapshot: inquiry.requesterUidSnapshot,
          customerDisplayNameSnapshot: inquiry.requesterDisplayNameSnapshot,
          description,
          amountWolo,
          taxRateBps: MARKETPLACE_BUSINESS_TAX_BPS,
          taxAmountWolo,
          recipientAddressSnapshot: ownerWallet,
          memo,
          status: "awaiting_payment",
        },
      });

      const protocol = await postMarketplaceProtocolMessage(tx, {
        senderUserId: owner.id,
        targetUserId: inquiry.requesterUserId,
        body: buildMarketplaceInvoiceMessage({
          shop: shop.name,
          actor: marketplaceDisplayName(owner),
          amountWolo,
          recordId: publicId,
          requestText: description,
        }),
        now,
      });

      const updated = await tx.marketplaceInvoice.update({
        where: { id: row.id },
        data: { directMessageId: protocol.message.id },
      });

      await recordUserActivity(tx, {
        userId: owner.id,
        type: "market_business_invoice_issued",
        path: "/profile",
        label: publicId,
        metadata: {
          shopPublicId: shop.publicId,
          shopSlug: shop.slug,
          invoicePublicId: publicId,
          inquiryPublicId: inquiry.publicId,
          customerUid: inquiry.requesterUidSnapshot,
          amountWolo,
          taxRateBps: MARKETPLACE_BUSINESS_TAX_BPS,
          taxAmountWolo,
          messageId: protocol.message.id,
        },
        dedupeWithinSeconds: 0,
      });

      return updated;
    });

    return NextResponse.json(
      {
        ok: true,
        invoice: {
          publicId: invoice.publicId,
          customerDisplayName: invoice.customerDisplayNameSnapshot,
          amountWolo: invoice.amountWolo,
          description: invoice.description,
          status: invoice.status,
          paymentHref: `/market/invoices/${encodeURIComponent(invoice.publicId)}`,
        },
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Marketplace invoice creation failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Invoice creation failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
