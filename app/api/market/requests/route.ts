import { NextRequest, NextResponse } from "next/server";

import {
  getOrCreateConversationByUsers,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import { verifyWoloTransfer } from "@/lib/woloBetSettlement";
import { buildWoloRestTxLookupUrl } from "@/lib/woloChain";
import {
  MARKETPLACE_CONFIG,
  marketplaceLabelForArchetype,
  marketplaceLabelForBelt,
  normalizeAvatarArchetypes,
  normalizeBeltPlacement,
  normalizeMarketplaceBrief,
  normalizeMarketplaceLine,
  marketplacePaymentMemo,
  type MarketplaceRequestKind,
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
  txHash?: unknown;
  fromAddress?: unknown;
};

function normalizeTxHash(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(normalized) ? normalized : null;
}

function normalizeWoloAddress(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(normalized) ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

async function verifyMarketplaceMemo(txHash: string, expectedMemo: string) {
  const lookupUrl = buildWoloRestTxLookupUrl(txHash);
  if (!lookupUrl) return false;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(lookupUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
    }).catch(() => null);

    if (response?.ok) {
      const payload = asRecord(await response.json().catch(() => null));
      const tx = asRecord(payload?.tx);
      const body = asRecord(tx?.body);
      if (body?.memo === expectedMemo) return true;
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  return false;
}

async function getMarketKeeperWallet(
  prisma: ReturnType<typeof getPrisma>,
  userId: number
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true },
  });
  return normalizeWoloAddress(user?.walletAddress);
}

function avatarCommissionMessage(body: MarketRequestBody) {
  const brief = normalizeMarketplaceBrief(body.brief);
  const archetypes = normalizeAvatarArchetypes(body.archetypes);
  const beltPlacement = normalizeBeltPlacement(body.beltPlacement);
  const palette = normalizeMarketplaceLine(body.palette, 100);

  if (!brief) {
    throw new Error("Write a few words for the Visagewright.");
  }

  return {
    eventType: "market_avatar_commission",
    label: "visage-forge",
    message: [
      "MARKET COMMISSION · THE VISAGE FORGE",
      "",
      `Craft: Custom profile avatar · ${MARKETPLACE_CONFIG.avatarPriceWolo} WOLO`,
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
      `${MARKETPLACE_CONFIG.avatarPriceWolo} WOLO payment verified on WoloChain.`,
      `Payment tx: ${normalizeTxHash(body.txHash) || "pending"}.`,
    ].join("\n"),
    metadata: {
      shop: MARKETPLACE_CONFIG.avatarShopName,
      craft: MARKETPLACE_CONFIG.avatarCraftName,
      priceWolo: MARKETPLACE_CONFIG.avatarPriceWolo,
      archetypes,
      beltPlacement,
      palette: palette || null,
      brief,
      paymentState: "verified",
      txHash: normalizeTxHash(body.txHash),
      fromAddress: normalizeWoloAddress(body.fromAddress),
      delivery: MARKETPLACE_CONFIG.avatarDeliveryLabel,
    },
  };
}

function shopProposalMessage(body: MarketRequestBody) {
  const shopName = normalizeMarketplaceLine(body.shopName, 100);
  const offer = normalizeMarketplaceBrief(body.offer, 900);

  if (!shopName) {
    throw new Error("Give the proposed shop a name.");
  }
  if (!offer) {
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
      `${MARKETPLACE_CONFIG.avatarPriceWolo} WOLO payment verified on WoloChain.`,
      `Payment tx: ${normalizeTxHash(body.txHash) || "pending"}.`,
      "State: Proposal submitted for review; no shop is live yet.",
    ].join("\n"),
    metadata: {
      shopName,
      offer,
      state: "proposal",
      priceWolo: MARKETPLACE_CONFIG.avatarPriceWolo,
      paymentState: "verified",
      txHash: normalizeTxHash(body.txHash),
      fromAddress: normalizeWoloAddress(body.fromAddress),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json(
        { detail: "Sign in before sending a market request." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const kind = normalizeMarketplaceLine(
      request.nextUrl.searchParams.get("kind"),
      40
    ) as MarketplaceRequestKind;

    if (kind !== "avatar_commission" && kind !== "shop_proposal") {
      return NextResponse.json(
        { detail: "That market request is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const prisma = getPrisma();
    const marketKeeper = await resolvePrimaryAdminContact(prisma);
    if (!marketKeeper) {
      return NextResponse.json(
        { detail: "The market keeper is away. Try again shortly." },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const recipientAddress = await getMarketKeeperWallet(
      prisma,
      marketKeeper.id
    );

    if (!recipientAddress) {
      return NextResponse.json(
        { detail: "Emaren has not linked a marketplace payout wallet yet." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        kind,
        amountWolo: MARKETPLACE_CONFIG.avatarPriceWolo,
        recipientAddress,
        recipientUid: marketKeeper.uid,
        memo: marketplacePaymentMemo(kind),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to load marketplace payment quote:", error);
    return NextResponse.json(
      { detail: "The marketplace payment quote is unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
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

    const requestKind = kind as MarketplaceRequestKind;
    const txHash = normalizeTxHash(body.txHash);
    const fromAddress = normalizeWoloAddress(body.fromAddress);

    if (!txHash || !fromAddress) {
      return NextResponse.json(
        { detail: "A verified 100 WOLO marketplace payment is required before submitting." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const marketKeeperWallet = await getMarketKeeperWallet(
      prisma,
      marketKeeper.id
    );

    if (!marketKeeperWallet) {
      return NextResponse.json(
        { detail: "Emaren has not linked a marketplace payout wallet yet." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const duplicatePayment = await prisma.userActivityEvent.findFirst({
      where: {
        type: { in: ["market_avatar_commission", "market_shop_proposal"] },
        label: txHash,
      },
      select: { id: true, userId: true },
    });

    if (duplicatePayment) {
      return NextResponse.json(
        { detail: "That WOLO payment proof has already been used." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const amountWolo = MARKETPLACE_CONFIG.avatarPriceWolo;
    const verification = await verifyWoloTransfer({
      txHash,
      fromAddress,
      toAddress: marketKeeperWallet,
      expectedAmountWolo: amountWolo,
    });

    if (!verification.verified) {
      return NextResponse.json(
        {
          detail:
            verification.detail ||
            "The 100 WOLO marketplace payment has not appeared on WoloChain yet.",
          txHash,
          proofUrl: verification.proofUrl || null,
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    const expectedMemo = marketplacePaymentMemo(requestKind);
    if (!(await verifyMarketplaceMemo(txHash, expectedMemo))) {
      return NextResponse.json(
        {
          detail:
            "The WOLO transfer is real, but it does not carry the marketplace request memo.",
          txHash,
          proofUrl: verification.proofUrl || null,
        },
        { status: 422, headers: NO_STORE_HEADERS }
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
        label: txHash,
        metadata: {
          ...requestDetails.metadata,
          messageId: createdMessage.id,
          marketRequestLabel: requestDetails.label,
          marketKeeperUid: marketKeeper.uid,
          amountWolo,
          fromAddress,
          toAddress: marketKeeperWallet,
          txHash: verification.txHash || txHash,
          proofUrl: verification.proofUrl || null,
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
        amountWolo,
        txHash: verification.txHash || txHash,
        proofUrl: verification.proofUrl || null,
        contactHref: `/contact-emaren?user=${encodeURIComponent(
          marketKeeper.uid
        )}&marketTx=${encodeURIComponent(verification.txHash || txHash)}`,
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
