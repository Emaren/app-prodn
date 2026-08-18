import { NextRequest, NextResponse } from "next/server";

import {
  MARKETPLACE_BUSINESS_TAX_BPS,
  marketplaceDisplayName,
  normalizeMarketplaceLine,
  normalizeMarketplaceText,
} from "@/lib/marketplaceBusiness";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
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

async function loadSummary(prisma: ReturnType<typeof getPrisma>, userId: number) {
  const shop = await prisma.marketplaceShop.findFirst({
    where: {
      ownerUserId: userId,
      status: "active",
    },
    orderBy: { id: "asc" },
  });

  if (!shop) return null;

  const [payments, paidInquiries, invoices] = await Promise.all([
    prisma.marketplacePayment.findMany({
      where: { shopId: shop.id },
      orderBy: { verifiedAt: "desc" },
      take: 80,
      include: {
        inquiry: {
          select: {
            publicId: true,
            kind: true,
            requesterDisplayNameSnapshot: true,
            requestText: true,
          },
        },
        invoice: {
          select: {
            publicId: true,
            customerDisplayNameSnapshot: true,
            description: true,
          },
        },
      },
    }),
    prisma.marketplaceInquiry.findMany({
      where: {
        shopId: shop.id,
        kind: "customer_request",
        status: "paid",
      },
      orderBy: { paidAt: "desc" },
      take: 30,
    }),
    prisma.marketplaceInvoice.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const revenue = payments.filter(
    (payment) => payment.kind === "inquiry" || payment.kind === "invoice"
  );
  const taxPayments = payments.filter((payment) => payment.kind === "tax");
  const developmentPayments = payments.filter(
    (payment) => payment.kind === "development"
  );

  const grossRevenueWolo = revenue.reduce(
    (sum, payment) => sum + payment.amountWolo,
    0
  );
  const taxAccruedWolo = revenue.reduce(
    (sum, payment) => sum + payment.taxAmountWolo,
    0
  );
  const taxPaidWolo = taxPayments.reduce(
    (sum, payment) => sum + payment.amountWolo,
    0
  );
  const taxDueWolo = Math.max(0, taxAccruedWolo - taxPaidWolo);
  const developmentSpentWolo = developmentPayments.reduce(
    (sum, payment) => sum + payment.amountWolo,
    0
  );

  const activity = payments.slice(0, 30).map((payment) => {
    if (payment.kind === "inquiry") {
      return {
        id: `payment-${payment.id}`,
        kind: "inquiry" as const,
        amountWolo: payment.amountWolo,
        direction: "in" as const,
        label: `${payment.inquiry?.requesterDisplayNameSnapshot || "Customer"} · paid inquiry`,
        detail: payment.inquiry?.requestText || null,
        createdAt: payment.verifiedAt.toISOString(),
      };
    }
    if (payment.kind === "invoice") {
      return {
        id: `payment-${payment.id}`,
        kind: "invoice" as const,
        amountWolo: payment.amountWolo,
        direction: "in" as const,
        label: `${payment.invoice?.customerDisplayNameSnapshot || "Customer"} · invoice paid`,
        detail: payment.invoice?.description || null,
        createdAt: payment.verifiedAt.toISOString(),
      };
    }
    if (payment.kind === "tax") {
      return {
        id: `payment-${payment.id}`,
        kind: "tax" as const,
        amountWolo: payment.amountWolo,
        direction: "out" as const,
        label: "Kingdom tax paid",
        detail: "Community Treasury",
        createdAt: payment.verifiedAt.toISOString(),
      };
    }
    return {
      id: `payment-${payment.id}`,
      kind: "development" as const,
      amountWolo: payment.amountWolo,
      direction: "out" as const,
      label: "Business development request",
      detail: payment.inquiry?.requestText || null,
      createdAt: payment.verifiedAt.toISOString(),
    };
  });

  const customers = Array.from(
    new Map(
      paidInquiries.map((inquiry) => [
        inquiry.requesterUserId,
        {
          inquiryPublicId: inquiry.publicId,
          userId: inquiry.requesterUserId,
          uid: inquiry.requesterUidSnapshot,
          displayName: inquiry.requesterDisplayNameSnapshot,
          requestText: inquiry.requestText,
          paidAt: inquiry.paidAt?.toISOString() || null,
        },
      ])
    ).values()
  );

  return {
    shop: {
      publicId: shop.publicId,
      slug: shop.slug,
      name: shop.name,
      offer: shop.offer,
      proprietorLabel: shop.proprietorLabel,
      streetKey: shop.streetKey,
      slot: shop.slot,
      displayEnabled: shop.displayEnabled,
      heroImageUrl: shop.heroImageUrl,
      href: shop.href,
      charterAmountWolo: shop.charterAmountWolo,
      charterState: shop.charterState,
      charterTxHash: shop.charterTxHash,
    },
    taxRateBps: MARKETPLACE_BUSINESS_TAX_BPS,
    grossRevenueWolo,
    taxAccruedWolo,
    taxPaidWolo,
    taxDueWolo,
    developmentSpentWolo,
    paidInquiryCount: paidInquiries.length,
    openInvoiceCount: invoices.filter((invoice) => invoice.status === "awaiting_payment").length,
    customers,
    invoices: invoices.map((invoice) => ({
      publicId: invoice.publicId,
      customerDisplayName: invoice.customerDisplayNameSnapshot,
      amountWolo: invoice.amountWolo,
      description: invoice.description,
      status: invoice.status,
      createdAt: invoice.createdAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() || null,
    })),
    activity,
  };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveViewer(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "Sign in to manage a Marketplace business." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const summary = await loadSummary(resolved.prisma, resolved.user.id);
    return NextResponse.json(
      {
        ok: true,
        viewerWalletAddress: resolved.user.walletAddress,
        viewerDisplayName: marketplaceDisplayName(resolved.user),
        business: summary,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Marketplace business summary failed:", error);
    return NextResponse.json(
      { detail: "The Marketplace business ledger is unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await resolveViewer(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "Sign in to manage a Marketplace business." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const shop = await resolved.prisma.marketplaceShop.findFirst({
      where: {
        ownerUserId: resolved.user.id,
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

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      displayEnabled?: unknown;
      name?: unknown;
      offer?: unknown;
    };
    const action = normalizeMarketplaceLine(body.action, 40);

    if (action === "display") {
      const displayEnabled = body.displayEnabled === true;
      if (displayEnabled && !resolved.user.walletAddress) {
        return NextResponse.json(
          { detail: "Link a WOLO wallet before opening your business." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      await resolved.prisma.marketplaceShop.update({
        where: { id: shop.id },
        data: { displayEnabled },
      });
    } else if (action === "details") {
      const name = normalizeMarketplaceLine(body.name, 100);
      const offer = normalizeMarketplaceText(body.offer, 900);
      if (!name || !offer) {
        return NextResponse.json(
          { detail: "Business name and offer are required." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      await resolved.prisma.marketplaceShop.update({
        where: { id: shop.id },
        data: { name, offer },
      });
    } else {
      return NextResponse.json(
        { detail: "That business action is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const summary = await loadSummary(resolved.prisma, resolved.user.id);
    return NextResponse.json(
      { ok: true, business: summary },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Marketplace business update failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Business update failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
