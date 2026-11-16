// Editorial presentation fallback from the owner's verified public champion
// roll on Nov 16. This is NOT a financial custody projection or a title grant.
// The restricted production web role cannot currently read trophy-holder
// columns; never manufacture an arbitrary player's title. This fallback
// expires quickly and yields immediately to real public trophy honors.
const EDITORIAL_HONOR_SNAPSHOT_EXPIRES = Date.parse("2026-11-23T00:00:00.000Z");
const VERIFIED_FEATURED_HONORS: Record<string, { name: string; titles: readonly string[] }> = {
  "u_0df73bdbb64646c19e4a9bfd225b3285": {
    name: "jim",
    titles: ["American Champion", "Chaos Champion", "DM Veteran Championship", "RM Rising Championship"],
  },
  "u_3379d1d2360d4c05ac88796ba7eda15c": {
    name: "tekki",
    titles: ["French Champion", "RM Challenger Championship"],
  },
};

export function verifiedFeaturedHonorsFallback(
  uid: string | null | undefined,
  name: string,
  now: Date = new Date(),
): string[] {
  const at = now.getTime();
  if (!Number.isFinite(at) || at >= EDITORIAL_HONOR_SNAPSHOT_EXPIRES ||
      at < Date.parse("2026-11-16T00:00:00.000Z")) return [];
  const record = uid ? VERIFIED_FEATURED_HONORS[uid] : null;
  return record && record.name === name.trim().toLowerCase() ? [...record.titles] : [];
}

export function featuredWarriorVisibleHonors(titles: readonly string[]): {
  visible: string[];
  remaining: number;
} {
  // Five actual titles should be shown, not four plus a premature "+1".
  // At six or more, the fifth line becomes a true aggregate ("+2", etc.).
  const visible = titles.slice(0, titles.length <= 5 ? 5 : 4);
  return { visible, remaining: titles.length - visible.length };
}

export function featuredWarriorBestRank(
  ...ranks: Array<number | null | undefined>
) {
  const validRanks = ranks
    .filter(
      (rank): rank is number =>
        typeof rank === "number" &&
        Number.isFinite(rank) &&
        rank > 0
    )
    .map((rank) => Math.floor(rank));

  return validRanks.length > 0
    ? Math.min(...validRanks)
    : null;
}

export function featuredWarriorHonorLabel(
  trophyId: string | null | undefined,
  displayName: string | null | undefined
) {
  const normalizedId = String(trophyId || "")
    .trim()
    .toLowerCase();

  const cleanedDisplayName = String(displayName || "")
    .trim()
    .replace(/^AoE2WAR\s+/i, "")
    .replace(/\s+(?:Championship\s+)?Belt$/i, "")
    .trim();

  if (
    normalizedId === "usa_champion_belt" ||
    normalizedId === "american_champion" ||
    /^usa champion$/i.test(cleanedDisplayName) ||
    /^united states champion$/i.test(cleanedDisplayName)
  ) {
    return "American Champion";
  }

  if (
    normalizedId === "france_champion_belt" ||
    /^france champion$/i.test(cleanedDisplayName) ||
    /^french champion$/i.test(cleanedDisplayName)
  ) {
    return "French Champion";
  }

  if (
    normalizedId === "mexico_champion_belt" ||
    /^mexico champion$/i.test(cleanedDisplayName)
  ) {
    return "Mexican Champion";
  }

  return cleanedDisplayName || "Champion";
}
