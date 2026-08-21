import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import MarketplaceShopClient from "@/components/market/MarketplaceShopClient";
import { loadMarketplaceShopBySlug } from "@/lib/marketplaceBusiness";
import { getPrisma } from "@/lib/prisma";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
  const shop = await loadMarketplaceShopBySlug(getPrisma(), slug).catch(() => null);

  return {
    title: shop?.name ?? "Marketplace Shop",
    description: shop?.offer ?? "A merchant awning inside the AoE2WAR Marketplace.",
  };
}

export default async function MarketplaceShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
  const shop = await loadMarketplaceShopBySlug(getPrisma(), slug).catch(() => null);

  if (!shop || shop.status !== "active") notFound();
  if (shop.kind === "kingdom") redirect(shop.href);

  return (
    <MarketplaceShopClient
      shop={{
        slug: shop.slug,
        name: shop.name,
        offer: shop.offer,
        proprietorLabel: shop.proprietorLabel,
        ownerUid: shop.owner?.uid ?? null,
        displayEnabled: shop.displayEnabled,
        heroImageUrl: shop.heroImageUrl,
        sourceProposalEventId:
          shop.sourceProposalEventId,
      }}
    />
  );
}
