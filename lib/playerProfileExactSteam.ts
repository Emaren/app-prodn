export type ExactSteamProfileSnapshot = {
  gameStatsId: number;
  displayName: string;
};

/**
 * Keep historical aliases only when their exact-Steam snapshot also belongs
 * to the cleaned game corpus used by the profile. This prevents a rejected or
 * superseded projection from gaining name-keyed claim authority.
 */
export function selectVisibleExactSteamAliases(
  snapshots: ExactSteamProfileSnapshot[],
  visibleGameStatsIds: Iterable<number>,
) {
  const visibleIds = new Set(visibleGameStatsIds);
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const snapshot of snapshots) {
    if (!visibleIds.has(snapshot.gameStatsId)) continue;
    const alias = snapshot.displayName.trim();
    const key = alias.toLocaleLowerCase();
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }

  return aliases;
}
