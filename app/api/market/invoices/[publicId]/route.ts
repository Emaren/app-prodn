import { NextRequest, NextResponse } from "next/server";

import {
  buildMarketplaceInvoicePaidMessage,
  marketplaceDisplayName,
  newMarketplacePublicId,
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
  params: Promise<{ publicId: string }>;
};

async function loadViewerAndInvoice(request: NextRequest, publicId: string) {
  const uid = await getSessionUid(request);
  if (!uid) return null;

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      walletAddress: true,
    },
  });
  if (!viewer) return null;

  const invoice = await prisma.marketplaceInvoice.findUnique({
    where: { publicId },
    include: {
      shop: true,
      payment: true,
    },
  });
  if (!invoice) return { prisma, viewer, invoice: null };

  if (
    viewer.id !== invoice.customerUserId &&
    viewer.id !== invoice.issuerUserId
  ) {
    return { prisma, viewer, invoice: null };
  }

  return { prisma, viewer, invoice };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { publicId: rawPublicId } = await context.params;
    const publicId = decodeURIComponent(rawPublicId).trim();
    const resolved = await loadViewerAndInvoice(request, publicId);

    if (!resolved) {
      return NextResponse.json(
        { detail: "Sign in to view this Marketplace invoice." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!resolved.invoice) {
      return NextResponse.json(
        { detail: "That Marketplace invoice could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { invoice, viewer } = resolved;
    return NextResponse.json(
      {
        ok: true,
        invoice: {
          publicId: invoice.publicId,
          shopSlug: invoice.shop.slug,
          shopName: invoice.shop.name,
          issuerDisplayName: invoice.issuerDisplayNameSnapshot,
          customerDisplayName: invoice.customerDisplayNameSnapshot,
          description: invoice.description,
          amountWolo: invoice.amountWolo,
          status: invoice.status,
          memo: invoice.memo,
          recipientAddress: invoice.recipientAddressSnapshot,
          createdAt: invoice.createdAt.toISOString(),
          paidAt: invoice.paidAt?.toISOString() || null,
          txHash: invoice.payment?.txHash || null,
          proofUrl: invoice.payment?.proofUrl || null,
          viewerIsCustomer: viewer.id === invoice.customerUserId,
          fallbackWalletAddress: viewer.walletAddress,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Marketplace invoice load failed:", error);
    return NextResponse.json(
      { detail: "The Marketplace invoice is unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { publicId: rawPublicId } = await context.params;
    const publicId = decodeURIComponent(rawPublicId).trim();
    const resolved = await loadViewerAndInvoice(request, publicId);

    if (!resolved) {
      return NextResponse.json(
        { detail: "Sign in to pay this Marketplace invoice." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!resolved.invoice) {
      return NextResponse.json(
        { detail: "That Marketplace invoice could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { prisma, viewer, invoice } = resolved;
    if (viewer.id !== invoice.customerUserId) {
      return NextResponse.json(
        { detail: "Only the invoiced customer can pay this bill." },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        {
          ok: true,
          state: "paid",
          invoiceId: invoice.publicId,
          txHash: invoice.payment?.txHash || null,
          proofUrl: invoice.payment?.proofUrl || null,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const viewerWallet = normalizeWoloAddress(viewer.walletAddress);
    if (!viewerWallet) {
      return NextResponse.json(
        { detail: "Link your WOLO wallet before paying a Marketplace invoice." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      txHash?: unknown;
      fromAddress?: unknown;
    };
    const proof = await verifyMarketplaceBusinessPayment(prisma, {
      txHash: body.txHash,
      fromAddress: body.fromAddress,
      expectedFromAddress: viewerWallet,
      toAddress: invoice.recipientAddressSnapshot,
      amountWolo: invoice.amountWolo,
      memo: invoice.memo,
    });

    const issuer = await prisma.user.findUnique({
      where: { id: invoice.issuerUserId },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });
    if (!issuer) {
      return NextResponse.json(
        { detail: "The issuing merchant could not be found." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    const payment = await prisma.$transaction(async (tx) => {
      const row = await tx.marketplacePayment.create({
        data: {
          publicId: newMarketplacePublicId(),
          kind: "invoice",
          shopId: invoice.shopId,
          invoiceId: invoice.id,
          payerUserId: viewer.id,
          payeeUserId: invoice.issuerUserId,
          payerUidSnapshot: viewer.uid,
          payerDisplayNameSnapshot: marketplaceDisplayName(viewer),
          payeeUidSnapshot: issuer.uid,
          payeeDisplayNameSnapshot: marketplaceDisplayName(issuer),
          amountWolo: invoice.amountWolo,
          taxRateBps: invoice.taxRateBps,
          taxAmountWolo: invoice.taxAmountWolo,
          senderAddressSnapshot: proof.fromAddress,
          recipientAddressSnapshot: proof.toAddress,
          memo: invoice.memo,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
          verifiedAt: now,
        },
      });

      await tx.marketplaceInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "paid",
          paidAt: now,
        },
      });

      const protocol = await postMarketplaceProtocolMessage(tx, {
        senderUserId: viewer.id,
        targetUserId: invoice.issuerUserId,
        body: buildMarketplaceInvoicePaidMessage({
          shop: invoice.shop.name,
          actor: marketplaceDisplayName(viewer),
          amountWolo: invoice.amountWolo,
          recordId: invoice.publicId,
          txHash: proof.txHash,
          requestText: invoice.description,
        }),
        now,
      });

      await recordUserActivity(tx, {
        userId: viewer.id,
        type: "market_business_invoice_paid",
        path: `/market/invoices/${invoice.publicId}`,
        label: proof.txHash,
        metadata: {
          shopPublicId: invoice.shop.publicId,
          shopSlug: invoice.shop.slug,
          invoicePublicId: invoice.publicId,
          amountWolo: invoice.amountWolo,
          taxRateBps: invoice.taxRateBps,
          taxAmountWolo: invoice.taxAmountWolo,
          txHash: proof.txHash,
          proofUrl: proof.proofUrl,
          messageId: protocol.message.id,
        },
        dedupeWithinSeconds: 0,
      });

      return row;
    });

    return NextResponse.json(
      {
        ok: true,
        state: "paid",
        invoiceId: invoice.publicId,
        amountWolo: payment.amountWolo,
        txHash: payment.txHash,
        proofUrl: payment.proofUrl,
        contactHref: `/contact-emaren?user=${encodeURIComponent(issuer.uid)}`,
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invoice payment failed.";
    const status = detail.includes("already been used") ? 409 : 500;
    console.error("Marketplace invoice payment failed:", error);
    return NextResponse.json(
      { detail },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
