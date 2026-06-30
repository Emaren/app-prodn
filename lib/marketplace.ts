export const MARKETPLACE_CONFIG = {
  avatarShopName: "The Visage Forge",
  avatarCraftName: "Visagewright",
  avatarPriceUsd: 100,
  avatarDeliveryLabel: "AoE2WAR profile avatar vault",
} as const;

export const AVATAR_ARCHETYPES = [
  { id: "arena-champion", label: "Arena champion" },
  { id: "warlord", label: "Warlord" },
  { id: "strategist", label: "Strategist" },
  { id: "royal", label: "Royal" },
  { id: "shadow", label: "Shadow" },
  { id: "wild-card", label: "Wild card" },
] as const;

export const BELT_PLACEMENTS = [
  { id: "shoulder", label: "Over the shoulder" },
  { id: "waist", label: "Around the waist" },
  { id: "hand", label: "Held in hand" },
  { id: "none", label: "No belt" },
] as const;

export type AvatarArchetypeId = (typeof AVATAR_ARCHETYPES)[number]["id"];
export type BeltPlacementId = (typeof BELT_PLACEMENTS)[number]["id"];

const ARCHETYPE_IDS = new Set<string>(
  AVATAR_ARCHETYPES.map((archetype) => archetype.id)
);
const BELT_PLACEMENT_IDS = new Set<string>(
  BELT_PLACEMENTS.map((placement) => placement.id)
);

export function normalizeMarketplaceLine(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeMarketplaceBrief(value: unknown, maxLength = 1200) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function normalizeAvatarArchetypes(
  value: unknown
): AvatarArchetypeId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeMarketplaceLine(entry, 40))
        .filter((entry): entry is AvatarArchetypeId =>
          ARCHETYPE_IDS.has(entry)
        )
    )
  ).slice(0, 3);
}

export function normalizeBeltPlacement(
  value: unknown
): BeltPlacementId {
  const normalized = normalizeMarketplaceLine(value, 40);
  return BELT_PLACEMENT_IDS.has(normalized)
    ? (normalized as BeltPlacementId)
    : "none";
}

export function marketplaceLabelForArchetype(id: AvatarArchetypeId) {
  return (
    AVATAR_ARCHETYPES.find((archetype) => archetype.id === id)?.label || id
  );
}

export function marketplaceLabelForBelt(id: BeltPlacementId) {
  return (
    BELT_PLACEMENTS.find((placement) => placement.id === id)?.label || id
  );
}
