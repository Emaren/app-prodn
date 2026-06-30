import { NextRequest, NextResponse } from "next/server";

import {
  getOrCreateConversationByUsers,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import {
  MARKETPLACE_CONFIG,
  marketplaceLabelForArchetype,
  marketplaceLabelForBelt,
  normalizeAvatarArchetypes,
  normalizeBeltPlacement,
  normalizeMarketplaceBrief,
  normalizeMarketplaceLine,
} from "@/lib/marketplace";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

type MarketRequestBody = {
  kind?: unknown;
  brief?: unknown;
  archetypes?: unknown;
  beltPlacement?: unknown;
  palette?: unknown;
  shopName?: unknown;
  offer?: unknown;
};

function avatarCommissionMessage(body: MarketRequestBody) {
  const brief = normalizeMarketplaceBrief(body.brief);
  const archetypes = normalizeAvatarArchetypes(body.archetypes);
  const beltPlacement = normalizeBeltPlacement(body.beltPlacement);
  const palette = normalizeMarketplaceLine(body.palette, 100);

  if (brief.length < 24) {
    throw new Error(
      "Give the Visagewright at least a few clear details about the identity you want."
    );
  }

  return {
    eventType: "market_avatar_commission",
    label: "visage-forge",
    message: [
      "MARKET COMMISSION · THE VISAGE FORGE",
      "",
      `Craft: Custom profile avatar · $${MARKETPLACE_CONFIG.avatarPriceUsd} USD`,
      `Identity: ${
        archetypes.length > 0
          ? archetypes.map(marketplaceLabelForArchetype).join(", ")
          : "Visagewright's judgment"
      }`,
      `Championship belt: ${marketplaceLabelForBelt(beltPlacement)}`,
      `Palette: ${palette || "Visagewright's judgment"}`,
      "",
      "COMMISSION SCROLL",
      brief,
      "",
      `Delivery: ${MARKETPLACE_CONFIG.avatarDeliveryLabel}`,
      "Payment state: Request submitted; payment not collected on this screen.",
    ].join("\n"),
    metadata: {
      shop: MARKETPLACE_CONFIG.avatarShopName,
      craft: MARKETPLACE_CONFIG.avatarCraftName,
      priceUsd: MARKETPLACE_CONFIG.avatarPriceUsd,
      archetypes,
      beltPlacement,
      palette: palette || null,
      brief,
      paymentState: "not_collected",
      delivery: MARKETPLACE_CONFIG.avatarDeliveryLabel,
    },
  };
}

function shopProposalMessage(body: MarketRequestBody) {
  const shopName = normalizeMarketplaceLine(body.shopName, 100);
  const offer = normalizeMarketplaceBrief(body.offer, 900);

  if (shopName.length < 2) {
    throw new Error("Give the proposed shop a name.");
  }
  if (offer.length < 20) {
    throw new Error("Tell the Agora what your shop would make or do.");
  }

  return {
    eventType: "market_shop_proposal",
    label: "open-an-awning",
    message: [
      "MARKET SHOP PROPOSAL · THE AOE2WAR AGORA",
      "",
      `Proposed shop: ${shopName}`,
      "",
      "THE OFFER",
      offer,
      "",
      "State: Proposal submitted for review; no shop is live yet.",
    ].join("\n"),
    metadata: {
      shopName,
      offer,
      state: "proposal",
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json(
        { detail: "Sign in before sending a market request." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as MarketRequestBody;
    const kind = normalizeMarketplaceLine(body.kind, 40);
    const requestDetails =
      kind === "avatar_commission"
        ? avatarCommissionMessage(body)
        : kind === "shop_proposal"
          ? shopProposalMessage(body)
          : null;

    if (!requestDetails) {
      return NextResponse.json(
        { detail: "That market request is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

    if (!viewer) {
      return NextResponse.json(
        { detail: "Your AoE2WAR profile could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const marketKeeper = await resolvePrimaryAdminContact(prisma);
    if (!marketKeeper) {
      return NextResponse.json(
        { detail: "The market keeper is away. Try again shortly." },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    if (marketKeeper.id === viewer.id) {
      return NextResponse.json(
        { detail: "Use the operator inbox to create an internal market note." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const conversation = await getOrCreateConversationByUsers(
      prisma,
      viewer.id,
      marketKeeper.id
    );
    const now = new Date();
    const message = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: viewer.id,
          body: requestDetails.message,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      await tx.directConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: now },
      });
      await tx.directConversationParticipant.updateMany({
        where: {
          conversationId: conversation.id,
          userId: viewer.id,
        },
        data: {
          lastReadAt: now,
          typingUpdatedAt: null,
        },
      });
      await recordUserActivity(tx, {
        userId: viewer.id,
        type: requestDetails.eventType,
        path: "/market",
        label: requestDetails.label,
        metadata: {
          ...requestDetails.metadata,
          messageId: createdMessage.id,
          marketKeeperUid: marketKeeper.uid,
        },
        dedupeWithinSeconds: 0,
      });

      return createdMessage;
    });

    return NextResponse.json(
      {
        ok: true,
        requestId: message.id,
        createdAt: message.createdAt.toISOString(),
        contactHref: `/contact-emaren?user=${encodeURIComponent(
          marketKeeper.uid
        )}`,
        profileHref: "/profile",
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "The market request failed.";
    const status =
      detail.includes("Give") ||
      detail.includes("Tell") ||
      detail.includes("name")
        ? 400
        : 500;

    console.error("Market request failed:", error);
    return NextResponse.json(
      { detail },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
