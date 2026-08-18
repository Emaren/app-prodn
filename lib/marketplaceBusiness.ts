import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  getOrCreateConversationByUsers,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import { buildMarketplaceInboxMessage } from "@/lib/marketplaceInboxMessage";
import { MARKETPLACE_KINGDOM_BUSINESSES } from "@/lib/marketplaceKingdomBusinesses";
import { buildWoloRestTxLookupUrl } from "@/lib/woloChain";
import { resolveCommunityTreasuryAddressConfig } from "@/lib/woloCommunityTreasury";
import { WOLO_MAINNET_NETWORK_ACCOUNTS } from "@/lib/woloMainnetNetworkAccounts";
import { verifyWoloTransfer } from "@/lib/woloBetSettlement";

export const MARKETPLACE_STANDARD_WOLO = 100;
export const MARKETPLACE_BUSINESS_TAX_BPS = 1000;
export const BPS_DENOMINATOR = 10_000;

export type MarketplaceDbClient = PrismaClient | Prisma.TransactionClient;

export type PublicMarketplaceShop = {
  publicId: string;
  slug: string;
  kind: string;
  ownerUserId: number | null;
  ownerUid: string | null;
  name: string;
  offer: string;
  proprietorLabel: string;
  streetKey: string;
  slot: number;
  displayEnabled: boolean;
  heroImageUrl: string | null;
  href: string;
};

export const FALLBACK_KINGDOM_SHOPS: PublicMarketplaceShop[] = [
  {
    publicId: "kingdom-chronicle",
    slug: "aoe2war-chronicle",
    kind: "kingdom",
    ownerUserId: null,
    ownerUid: null,
    name: "The AoE2WAR Chronicle",
    offer: "Dispatches, reports, arguments, and the written record of the kingdom.",
    proprietorLabel: "Kingdom press",
    streetKey: "second-street",
    slot: 2,
    displayEnabled: true,
    heroImageUrl: null,
    href: "/forum",
  },
  {
    publicId: "kingdom-workshop",
    slug: "workshop",
    kind: "kingdom",
    ownerUserId: null,
    ownerUid: null,
    name: "The Workshop",
    offer: "Request features, back useful work, and help build the kingdom.",
    proprietorLabel: "AoE2WAR builders",
    streetKey: "second-street",
    slot: 3,
    displayEnabled: true,
    heroImageUrl: null,
    href: "/workshop",
  },
  ...MARKETPLACE_KINGDOM_BUSINESSES.map((business) => ({
    publicId: `kingdom-${business.slug}`,
    slug: business.slug,
    kind: "kingdom",
    ownerUserId: null,
    ownerUid: null,
    name: business.name,
    offer: business.offer,
    proprietorLabel: business.proprietorLabel,
    streetKey: business.streetKey,
    slot: business.slot,
    displayEnabled: true,
    heroImageUrl: null,
    href: business.interiorHref,
  })),
];

export function normalizeMarketplaceText(value: unknown, maxLength = 1200) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function normalizeMarketplaceLine(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeWoloAddress(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(normalized) ? normalized : null;
}

export function normalizeTxHash(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(normalized) ? normalized : null;
}

export function marketplaceTaxAmount(amountWolo: number, taxRateBps = MARKETPLACE_BUSINESS_TAX_BPS) {
  return Math.floor((amountWolo * taxRateBps) / BPS_DENOMINATOR);
}

export function normalizeInvoiceAmount(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < MARKETPLACE_STANDARD_WOLO || parsed > 100_000) {
    return null;
  }
  return parsed % MARKETPLACE_STANDARD_WOLO === 0 ? parsed : null;
}

export function buildMarketplacePaymentMemo(input: {
  kind: "inquiry" | "invoice" | "development" | "tax";
  shopSlug: string;
  publicId: string;
  amountWolo: number;
}) {
  return `AoE2WAR Market · ${input.shopSlug} · ${input.kind} · ${input.publicId} · ${input.amountWolo} WOLO`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

async function readWoloTxMemo(txHash: string) {
  const lookupUrl = buildWoloRestTxLookupUrl(txHash);
  if (!lookupUrl) return null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(lookupUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
    }).catch(() => null);

    if (response?.ok) {
      const payload = asRecord(await response.json().catch(() => null));
      const tx = asRecord(payload?.tx);
      const body = asRecord(tx?.body);
      if (typeof body?.memo === "string") return body.memo;
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  return null;
}

export async function verifyMarketplaceBusinessPayment(
  prisma: MarketplaceDbClient,
  input: {
    txHash: unknown;
    fromAddress: unknown;
    expectedFromAddress: string;
    toAddress: string;
    amountWolo: number;
    memo: string;
  }
) {
  const txHash = normalizeTxHash(input.txHash);
  const fromAddress = normalizeWoloAddress(input.fromAddress);
  const expectedFromAddress = normalizeWoloAddress(input.expectedFromAddress);
  const toAddress = normalizeWoloAddress(input.toAddress);

  if (!txHash || !fromAddress || !expectedFromAddress || !toAddress) {
    throw new Error("A valid linked WOLO wallet and transaction proof are required.");
  }

  if (fromAddress !== expectedFromAddress) {
    throw new Error("The payment must come from your linked WOLO wallet.");
  }

  const [existingPayment, foundingProof] = await Promise.all([
    prisma.marketplacePayment.findUnique({
      where: { txHash },
      select: { id: true },
    }),
    prisma.userActivityEvent.findFirst({
      where: {
        type: { in: ["market_avatar_commission", "market_shop_proposal"] },
        label: txHash,
      },
      select: { id: true },
    }),
  ]);

  if (existingPayment || foundingProof) {
    throw new Error("That WOLO payment proof has already been used.");
  }

  const verification = await verifyWoloTransfer({
    txHash,
    fromAddress,
    toAddress,
    expectedAmountWolo: input.amountWolo,
  });

  if (!verification.verified) {
    throw new Error(
      verification.detail || "The WOLO payment has not appeared on WoloChain yet."
    );
  }

  const memo = await readWoloTxMemo(txHash);
  if (memo !== input.memo) {
    throw new Error("The WOLO transfer is real, but its Marketplace memo does not match this request.");
  }

  return {
    txHash: verification.txHash || txHash,
    proofUrl: verification.proofUrl || buildWoloRestTxLookupUrl(txHash),
    fromAddress,
    toAddress,
  };
}

export async function postMarketplaceProtocolMessage(
  prisma: MarketplaceDbClient,
  input: {
    senderUserId: number;
    targetUserId: number;
    body: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const conversation = await getOrCreateConversationByUsers(
    prisma,
    input.senderUserId,
    input.targetUserId
  );

  const message = await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: input.senderUserId,
      body: input.body,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  await prisma.directConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: now },
  });

  await prisma.directConversationParticipant.updateMany({
    where: {
      conversationId: conversation.id,
      userId: input.senderUserId,
    },
    data: {
      lastReadAt: now,
      typingUpdatedAt: null,
    },
  });

  return {
    conversationId: conversation.id,
    message,
  };
}

export async function resolveMarketplaceKeeper(prisma: PrismaClient) {
  const keeper = await resolvePrimaryAdminContact(prisma);
  if (!keeper) {
    throw new Error("The market keeper is away. Try again shortly.");
  }

  const user = await prisma.user.findUnique({
    where: { id: keeper.id },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      walletAddress: true,
    },
  });

  const walletAddress = normalizeWoloAddress(user?.walletAddress);
  if (!user || !walletAddress) {
    throw new Error("The market keeper does not have a linked WOLO wallet.");
  }

  return {
    ...user,
    walletAddress,
    displayName: user.inGameName || user.steamPersonaName || user.uid,
  };
}

export function resolveMarketplaceTreasuryAddress() {
  const configured = normalizeWoloAddress(
    resolveCommunityTreasuryAddressConfig().address
  );
  if (configured) return configured;

  const canonical = WOLO_MAINNET_NETWORK_ACCOUNTS.find(
    (account) => account.label === "Community Treasury"
  );
  const fallback = normalizeWoloAddress(canonical?.address);
  if (!fallback) {
    throw new Error("Community Treasury is not configured.");
  }
  return fallback;
}

export async function loadPublicMarketplaceAwningListings(
  prisma: PrismaClient
): Promise<PublicMarketplaceShop[]> {
  try {
    const rows = await prisma.marketplaceShop.findMany({
      where: {
        status: "active",
        displayEnabled: true,
      },
      orderBy: [{ streetKey: "asc" }, { slot: "asc" }],
      include: {
        owner: {
          select: { uid: true },
        },
      },
    });

    return rows.map((row) => ({
      publicId: row.publicId,
      slug: row.slug,
      kind: row.kind,
      ownerUserId: row.ownerUserId,
      ownerUid: row.owner?.uid ?? null,
      name: row.name,
      offer: row.offer,
      proprietorLabel: row.proprietorLabel,
      streetKey: row.streetKey,
      slot: row.slot,
      displayEnabled: row.displayEnabled,
      heroImageUrl: row.heroImageUrl,
      href: row.href,
    }));
  } catch (error) {
    console.error("Marketplace awning projection failed; using safe kingdom fallback:", error);
    return FALLBACK_KINGDOM_SHOPS;
  }
}

export async function loadMarketplaceShopBySlug(
  prisma: PrismaClient,
  slug: string
) {
  return prisma.marketplaceShop.findUnique({
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
}

export function buildMarketplaceInquiryMessage(input: {
  shop: string;
  actor: string;
  amountWolo: number;
  recordId: string;
  txHash: string;
  requestText: string;
}) {
  return buildMarketplaceInboxMessage({
    kind: "inquiry",
    shop: input.shop,
    actor: input.actor,
    amountWolo: input.amountWolo,
    recordId: input.recordId,
    payment: `${input.txHash} · verified on WoloChain`,
    requestText: input.requestText,
  });
}

export function buildMarketplaceDevelopmentMessage(input: {
  shop: string;
  actor: string;
  amountWolo: number;
  recordId: string;
  txHash: string;
  requestText: string;
}) {
  return buildMarketplaceInboxMessage({
    kind: "development",
    shop: input.shop,
    actor: input.actor,
    amountWolo: input.amountWolo,
    recordId: input.recordId,
    payment: `${input.txHash} · verified on WoloChain`,
    requestText: input.requestText,
  });
}

export function buildMarketplaceInvoiceMessage(input: {
  shop: string;
  actor: string;
  amountWolo: number;
  recordId: string;
  requestText: string;
}) {
  return buildMarketplaceInboxMessage({
    kind: "invoice",
    shop: input.shop,
    actor: input.actor,
    amountWolo: input.amountWolo,
    recordId: input.recordId,
    payment: "Awaiting customer payment",
    requestText: input.requestText,
  });
}

export function buildMarketplaceInvoicePaidMessage(input: {
  shop: string;
  actor: string;
  amountWolo: number;
  recordId: string;
  txHash: string;
  requestText: string;
}) {
  return buildMarketplaceInboxMessage({
    kind: "invoice_paid",
    shop: input.shop,
    actor: input.actor,
    amountWolo: input.amountWolo,
    recordId: input.recordId,
    payment: `${input.txHash} · verified on WoloChain`,
    requestText: input.requestText,
  });
}

export function marketplaceDisplayName(user: {
  uid: string;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

export function newMarketplacePublicId() {
  return randomUUID();
}
