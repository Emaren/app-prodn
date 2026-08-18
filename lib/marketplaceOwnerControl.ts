import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { resolvePrimaryAdminContact } from "@/lib/contactInbox";
import { buildMarketplaceInboxMessage } from "@/lib/marketplaceInboxMessage";
import {
  MARKETPLACE_STANDARD_WOLO,
  normalizeMarketplaceLine,
  normalizeMarketplaceText,
  postMarketplaceProtocolMessage,
} from "@/lib/marketplaceBusiness";

type Db = PrismaClient | Prisma.TransactionClient;

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "market-shop"
  );
}

export async function requireMarketplaceKingdomOwner(
  prisma: PrismaClient,
  viewerUid: string
) {
  const [viewer, keeper] = await Promise.all([
    prisma.user.findUnique({
      where: { uid: viewerUid },
      select: {
        id: true,
        uid: true,
        isAdmin: true,
        inGameName: true,
        steamPersonaName: true,
      },
    }),
    resolvePrimaryAdminContact(prisma),
  ]);

  if (!viewer || !keeper || viewer.id !== keeper.id) return null;
  return viewer;
}

export async function loadMarketplaceOwnerConsole(prisma: PrismaClient) {
  const [proposalEvents, shops] = await Promise.all([
    prisma.userActivityEvent.findMany({
      where: { type: "market_shop_proposal" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
      },
    }),
    prisma.marketplaceShop.findMany({
      orderBy: [{ streetKey: "asc" }, { slot: "asc" }, { id: "asc" }],
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
    }),
  ]);

  const shopByProposal = new Map(
    shops
      .filter((shop) => shop.sourceProposalEventId)
      .map((shop) => [shop.sourceProposalEventId as number, shop])
  );

  return {
    proposals: proposalEvents.map((event) => {
      const metadata = asRecord(event.metadata);
      const shop = shopByProposal.get(event.id) || null;
      return {
        eventId: event.id,
        createdAt: event.createdAt.toISOString(),
        proposerUid: event.user.uid,
        proposerName:
          event.user.inGameName ||
          event.user.steamPersonaName ||
          event.user.uid,
        shopName: normalizeMarketplaceLine(metadata.shopName, 100),
        offer: normalizeMarketplaceText(metadata.offer, 900),
        paymentState: normalizeMarketplaceLine(metadata.paymentState, 32),
        txHash: normalizeMarketplaceLine(metadata.txHash, 128),
        shopPublicId: shop?.publicId ?? null,
        shopStatus: shop?.status ?? null,
        approvedAt: shop?.approvedAt?.toISOString() ?? null,
        displayEnabled: shop?.displayEnabled ?? false,
      };
    }),
    shops: shops.map((shop) => ({
      publicId: shop.publicId,
      slug: shop.slug,
      kind: shop.kind,
      name: shop.name,
      offer: shop.offer,
      proprietorLabel: shop.proprietorLabel,
      ownerUid: shop.owner?.uid ?? null,
      ownerName:
        shop.owner?.inGameName ||
        shop.owner?.steamPersonaName ||
        shop.proprietorLabel,
      ownerWalletAddress: shop.owner?.walletAddress ?? null,
      streetKey: shop.streetKey,
      slot: shop.slot,
      displayEnabled: shop.displayEnabled,
      status: shop.status,
      heroImageUrl: shop.heroImageUrl,
      href: shop.href,
      charterAmountWolo: shop.charterAmountWolo,
      charterState: shop.charterState,
      charterTxHash: shop.charterTxHash,
      sourceProposalEventId: shop.sourceProposalEventId,
      approvedAt: shop.approvedAt?.toISOString() ?? null,
      approvedByUserId: shop.approvedByUserId,
    })),
  };
}

async function nextVacantAwning(prisma: Db) {
  const occupied = await prisma.marketplaceShop.findMany({
    select: { streetKey: true, slot: true },
  });
  const used = new Set(occupied.map((row) => `${row.streetKey}:${row.slot}`));

  for (const streetKey of [
    "second-street",
    "third-street",
    "fourth-street",
    "fifth-street",
    "sixth-street",
  ]) {
    for (const slot of [1, 2, 3]) {
      if (!used.has(`${streetKey}:${slot}`)) return { streetKey, slot };
    }
  }

  throw new Error(
    "Every current Marketplace awning is occupied. Add another street before approving this proposal."
  );
}

export async function approveMarketplaceProposal(
  prisma: PrismaClient,
  input: { proposalEventId: number; approvedByUserId: number }
) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.userActivityEvent.findFirst({
      where: {
        id: input.proposalEventId,
        type: "market_shop_proposal",
      },
      include: {
        user: {
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

    if (!event) throw new Error("That Marketplace proposal no longer exists.");

    const metadata = asRecord(event.metadata);
    const shopName = normalizeMarketplaceLine(metadata.shopName, 100);
    const offer = normalizeMarketplaceText(metadata.offer, 900);
    const txHash = normalizeMarketplaceLine(metadata.txHash, 128);
    const paymentState = normalizeMarketplaceLine(metadata.paymentState, 32);

    if (!shopName || !offer || paymentState !== "verified" || !txHash) {
      throw new Error(
        "The proposal is missing verified Marketplace charter truth."
      );
    }

    let shop = await tx.marketplaceShop.findFirst({
      where: { sourceProposalEventId: event.id },
    });

    if (shop?.approvedAt && shop.status === "active") return shop;

    const now = new Date();

    if (shop) {
      shop = await tx.marketplaceShop.update({
        where: { id: shop.id },
        data: {
          status: "active",
          displayEnabled: false,
          approvedAt: now,
          approvedByUserId: input.approvedByUserId,
        },
      });
    } else {
      const awning = await nextVacantAwning(tx);
      const baseSlug = cleanSlug(shopName);
      const collision = await tx.marketplaceShop.findUnique({
        where: { slug: baseSlug },
        select: { id: true },
      });
      const slug = collision ? `${baseSlug}-${event.id}` : baseSlug;
      const proprietorLabel =
        event.user.inGameName ||
        event.user.steamPersonaName ||
        event.user.uid;

      shop = await tx.marketplaceShop.create({
        data: {
          kind: "player",
          ownerUserId: event.user.id,
          slug,
          name: shopName,
          offer,
          proprietorLabel,
          streetKey: awning.streetKey,
          slot: awning.slot,
          displayEnabled: false,
          status: "active",
          charterAmountWolo: MARKETPLACE_STANDARD_WOLO,
          charterState: "verified",
          charterTxHash: txHash,
          charterPaidAt: event.createdAt,
          sourceProposalEventId: event.id,
          heroImageUrl: null,
          href: `/market/shops/${slug}`,
          approvedAt: now,
          approvedByUserId: input.approvedByUserId,
        },
      });
    }

    if (!shop.approvalMessageId) {
      const ownerName =
        event.user.inGameName ||
        event.user.steamPersonaName ||
        event.user.uid;
      const profileHref =
        `/profile?marketplaceApproved=${encodeURIComponent(shop.publicId)}` +
        "#my-business";

      const body = buildMarketplaceInboxMessage({
        kind: "approval",
        shop: shop.name,
        actor: "The Kingdom",
        amountWolo: 0,
        recordId: shop.publicId,
        payment: "Kingdom approved",
        profileHref,
        requestText: [
          `Congratulations, ${ownerName}.`,
          "Your business has been approved by the Kingdom.",
          "Activate it from your profile.",
        ].join("\n"),
      });

      const protocol = await postMarketplaceProtocolMessage(tx, {
        senderUserId: input.approvedByUserId,
        targetUserId: event.user.id,
        body,
        now,
      });

      shop = await tx.marketplaceShop.update({
        where: { id: shop.id },
        data: { approvalMessageId: protocol.message.id },
      });
    }

    return shop;
  });
}
