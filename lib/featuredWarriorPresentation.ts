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
    normalizedId === "mexico_champion_belt" ||
    /^mexico champion$/i.test(cleanedDisplayName)
  ) {
    return "Mexican Champion";
  }

  return cleanedDisplayName || "Champion";
}
