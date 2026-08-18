export type MarketplaceKingdomBusiness = {
  slug: string;
  name: string;
  offer: string;
  proprietorLabel: string;
  streetKey:
    | "third-street"
    | "fourth-street"
    | "fifth-street"
    | "sixth-street";
  slot: 1 | 2 | 3;
  interiorHref: string;
  destinationHref: string | null;
  destinationLabel: string | null;
  secondaryHref?: string | null;
  secondaryLabel?: string | null;
  eyebrow: string;
  detail: string;
  priceLabel: string | null;
  statusNote: string | null;
};

export const MARKETPLACE_KINGDOM_BUSINESSES: readonly MarketplaceKingdomBusiness[] = [
  {
    slug: "chat-effects",
    name: "Chat Effects",
    offer:
      "Dramatic chat flourishes—flames, frost, sparks, and other effects. Effects start at 10 WOLO.",
    proprietorLabel: "Kingdom artificers",
    streetKey: "third-street",
    slot: 1,
    interiorHref: "/market/kingdom/chat-effects",
    destinationHref: "/lobby#lobby-chat",
    destinationLabel: "Open the chat halls",
    eyebrow: "Social artificery",
    detail:
      "A tiny effects economy for messages across the kingdom. The awning ships now; the 10-WOLO effect purchase rail is deliberately held for the next chat-specific release.",
    priceLabel: "Effects from 10 WOLO",
    statusNote: "Effect purchase rail · next activation",
  },
  {
    slug: "clan-insignias",
    name: "Clan Insignias",
    offer:
      "Commission clan crests, war standards, insignias, and visual identity for your house.",
    proprietorLabel: "Royal heralds",
    streetKey: "third-street",
    slot: 2,
    interiorHref: "/market/kingdom/clan-insignias",
    destinationHref: "/clans",
    destinationLabel: "Enter the clan halls",
    eyebrow: "Heraldry & identity",
    detail:
      "A dedicated crest-and-insignia shop for clans that want a recognizable standard across the kingdom.",
    priceLabel: null,
    statusNote: "Art commission rail · founding service",
  },
  {
    slug: "tournament-tent",
    name: "Tournament Tent",
    offer:
      "Join the current field, inspect brackets, and gather around the next tournament.",
    proprietorLabel: "Tournament marshal",
    streetKey: "third-street",
    slot: 3,
    interiorHref: "/market/kingdom/tournament-tent",
    destinationHref: "/lobby",
    destinationLabel: "Enter Tournament HQ",
    eyebrow: "Competition rail",
    detail:
      "The gathering point for entrants, brackets, live tournament chatter, and the next competitive field.",
    priceLabel: null,
    statusNote: "Join rail live · broader creation tools can follow",
  },
  {
    slug: "bank-tent",
    name: "The Bank Tent",
    offer:
      "Stake WOLO, inspect yield, and put idle coin to work inside the kingdom.",
    proprietorLabel: "Kingdom treasury",
    streetKey: "fourth-street",
    slot: 1,
    interiorHref: "/market/kingdom/bank-tent",
    destinationHref: "/staking",
    destinationLabel: "Enter the Bank",
    secondaryHref: "/kingdom-forge",
    secondaryLabel: "Visit the Kingdom Forge",
    eyebrow: "Capital & staking",
    detail:
      "The Marketplace doorway into the existing staking rail: custody remains where it already belongs, while the tent gives the economy a physical home.",
    priceLabel: null,
    statusNote: null,
  },
  {
    slug: "kingdom-forge-tent",
    name: "Kingdom Forge Tent",
    offer:
      "Back features, direct Build Fuel, and help finance the next pieces of the kingdom.",
    proprietorLabel: "The Forge",
    streetKey: "fourth-street",
    slot: 2,
    interiorHref: "/market/kingdom/kingdom-forge-tent",
    destinationHref: "/kingdom-forge",
    destinationLabel: "Enter the Kingdom Forge",
    eyebrow: "Capital formation",
    detail:
      "A Marketplace front door into the Kingdom Forge—where WOLO becomes backing, fuel, deeds, and visible construction.",
    priceLabel: null,
    statusNote: null,
  },
  {
    slug: "bounty-hall",
    name: "The Bounty Hall",
    offer:
      "Post, hunt, and collect bounties across the kingdom.",
    proprietorLabel: "Bounty keeper",
    streetKey: "fourth-street",
    slot: 3,
    interiorHref: "/market/kingdom/bounty-hall",
    destinationHref: "/bounties",
    destinationLabel: "Open the Bounty Board",
    eyebrow: "Work & reward",
    detail:
      "The obvious sixth founding awning: a place where useful work and competitive objectives can acquire an explicit WOLO reward.",
    priceLabel: null,
    statusNote: null,
  },
  {
    slug: "oracle-tent",
    name: "The Oracle",
    offer:
      "Choose the shape of the next battlefield and ask the Oracle what your coming matches may reveal.",
    proprietorLabel: "Oracle AI",
    streetKey: "fifth-street",
    slot: 1,
    interiorHref: "/market/kingdom/oracle-tent",
    destinationHref: null,
    destinationLabel: null,
    eyebrow: "Prediction & omen",
    detail:
      "The future AI prediction counter: choose a map type, bring recent match context, and receive a playful reading about what the next games may reveal. The tent ships now; the model-backed reading rail is a separate activation.",
    priceLabel: null,
    statusNote: "Oracle reading rail · next activation",
  },
  {
    slug: "radio-wolo",
    name: "Radio WOLO",
    offer:
      "Request music, pitch a radio spot, and help shape the sound of the kingdom.",
    proprietorLabel: "Kingdom broadcasters",
    streetKey: "fifth-street",
    slot: 2,
    interiorHref: "/market/kingdom/radio-wolo",
    destinationHref: null,
    destinationLabel: null,
    eyebrow: "Music & broadcast",
    detail:
      "A future request counter for tracks, station ideas, short WOLO ads, and community audio. The awning establishes the business now without pretending the broadcast-submission rail is already live.",
    priceLabel: null,
    statusNote: "Music + ad request rail · next activation",
  },
  {
    slug: "statistics-tent",
    name: "The Statistics Tent",
    offer:
      "Order deeper match statistics, packaged analysis, and player-performance reports.",
    proprietorLabel: "Royal statisticians",
    streetKey: "fifth-street",
    slot: 3,
    interiorHref: "/market/kingdom/statistics-tent",
    destinationHref: null,
    destinationLabel: null,
    eyebrow: "Numbers & analysis",
    detail:
      "A future package counter for match summaries, matchup profiles, map tendencies, and player statistics. It gives the War Engine's analytical work an economic storefront.",
    priceLabel: null,
    statusNote: "Statistics package rail · next activation",
  },
  {
    slug: "ai-tent",
    name: "The AI Tent",
    offer:
      "A strange machine-lit tent for future AI services, tools, counsel, and experiments.",
    proprietorLabel: "The machines",
    streetKey: "sixth-street",
    slot: 1,
    interiorHref: "/market/kingdom/ai-tent",
    destinationHref: null,
    destinationLabel: null,
    eyebrow: "Machine counsel",
    detail:
      "Its final trade is intentionally not fixed yet. The AI Tent reserves a physical home for future machine services without forcing a bad product definition before the right one emerges.",
    priceLabel: null,
    statusNote: "Purpose forming · awning reserved",
  },
  {
    slug: "champions-belt-forge",
    name: "Champion's Belt Forge",
    offer:
      "Commission championship belts, title hardware, and ceremonial pieces for proven champions.",
    proprietorLabel: "Master belt smith",
    streetKey: "sixth-street",
    slot: 2,
    interiorHref: "/market/kingdom/champions-belt-forge",
    destinationHref: null,
    destinationLabel: null,
    eyebrow: "Championship smithing",
    detail:
      "A blacksmith counter dedicated to belts and title hardware. The first release establishes the forge and commission concept; the generated-belt workflow can be activated separately.",
    priceLabel: null,
    statusNote: "Belt commission rail · next activation",
  },
  {
    slug: "wager-house",
    name: "The Wager House",
    offer:
      "Walk straight from the Marketplace into the kingdom's betting floor.",
    proprietorLabel: "The house",
    streetKey: "sixth-street",
    slot: 3,
    interiorHref: "/market/kingdom/wager-house",
    destinationHref: "/bets",
    destinationLabel: "Enter the Wager House",
    eyebrow: "Markets & wagers",
    detail:
      "The final awning for this founding pass: a physical Marketplace doorway into AoE2WAR's existing wager economy.",
    priceLabel: null,
    statusNote: "Betting rail already lives on /bets",
  },
] as const;

export function getMarketplaceKingdomBusiness(slug: string) {
  return MARKETPLACE_KINGDOM_BUSINESSES.find((business) => business.slug === slug) ?? null;
}
