export const MARKETPLACE_STANDARD_CHARTER_WOLO = 100;

export type MarketplaceShopListing = {
  slug: string;
  name: string;
  offer: string;
  proprietorLabel: string;
  ownerUid: string | null;
  streetKey: "second-street" | "third-street" | "fourth-street";
  slot: 1 | 2 | 3;
  displayEnabled: boolean;
  charterWolo: number;
  charterState: "verified" | "kingdom_founding";
  charterTxHash: string | null;
  sourceProposalEventId: number | null;
  sourceMessageId: number | null;
  href: string;
  counterHref: string;
  counterLabel: string;
  actionLabel: string;
  heroImage: string | null;
};

const JIM_UID = "u_0df73bdbb64646c19e4a9bfd225b3285";

export const FOUNDING_MARKETPLACE_SHOPS: MarketplaceShopListing[] = [
  {
    slug: "onager-repair",
    name: "Onager Repair",
    offer: "Make and repair siege onagers.",
    proprietorLabel: "Jim",
    ownerUid: JIM_UID,
    streetKey: "second-street",
    slot: 1,
    displayEnabled: true,
    charterWolo: MARKETPLACE_STANDARD_CHARTER_WOLO,
    charterState: "verified",
    charterTxHash:
      "EF4CB5EBAE05EA0710679455A482A9CE082C6D43134CA94F57B16758C0F99D6A",
    sourceProposalEventId: 49185,
    sourceMessageId: 3670,
    href: "/market/shops/onager-repair",
    counterHref: `/contact-emaren?user=${JIM_UID}`,
    counterLabel: "Talk to Jim",
    actionLabel: "Enter the repair works",
    heroImage: "/market/shops/onager-repair.png",
  },
  {
    slug: "aoe2war-chronicle",
    name: "The AoE2WAR Chronicle",
    offer: "Dispatches, reports, arguments, and the written record of the kingdom.",
    proprietorLabel: "Kingdom press",
    ownerUid: null,
    streetKey: "second-street",
    slot: 2,
    displayEnabled: true,
    charterWolo: MARKETPLACE_STANDARD_CHARTER_WOLO,
    charterState: "kingdom_founding",
    charterTxHash: null,
    sourceProposalEventId: null,
    sourceMessageId: null,
    href: "/forum",
    counterHref: "/forum",
    counterLabel: "Read the Chronicle",
    actionLabel: "Enter the press room",
    heroImage: null,
  },
  {
    slug: "workshop",
    name: "The Workshop",
    offer: "Request features, back useful work, and help build the kingdom.",
    proprietorLabel: "AoE2WAR builders",
    ownerUid: null,
    streetKey: "second-street",
    slot: 3,
    displayEnabled: true,
    charterWolo: MARKETPLACE_STANDARD_CHARTER_WOLO,
    charterState: "kingdom_founding",
    charterTxHash: null,
    sourceProposalEventId: null,
    sourceMessageId: null,
    href: "/workshop",
    counterHref: "/workshop",
    counterLabel: "Visit the counter",
    actionLabel: "Enter the Workshop",
    heroImage: null,
  },
];

export function findMarketplaceShopBySlug(slug: string) {
  return (
    FOUNDING_MARKETPLACE_SHOPS.find(
      (shop) => shop.slug === slug && shop.displayEnabled
    ) ?? null
  );
}

export function findMarketplaceShopForAwning(
  streetKey: MarketplaceShopListing["streetKey"],
  slot: MarketplaceShopListing["slot"]
) {
  const shop =
    FOUNDING_MARKETPLACE_SHOPS.find(
      (candidate) =>
        candidate.streetKey === streetKey &&
        candidate.slot === slot
    ) ?? null;

  return shop?.displayEnabled ? shop : null;
}
