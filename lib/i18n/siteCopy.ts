export type SiteTranslationCatalog = {
  version: 1;
  locale: "es";
  generatedAt: string;
  translations: Record<string, string>;
};

const PROTECTED_EXACT = new Set([
  "AoE2WAR",
  "WOLO",
  "$WOLO",
  "WoloChain",
  "Wolomania",
  "Clan Hall",
  "Mystikal Zodiac",
  "ELO",
  "Belts",
  "Artifacts",
  "Emaren",
  "Watcher",
  "Steam",
  "Osmosis",
  "RM",
  "DM",
  "HD",
  "API",
  "RPC",
  "PWA",
]);

export function shouldProtectSiteCopy(source: string) {
  const value = source.trim();
  if (!value) return true;
  if (PROTECTED_EXACT.has(value)) return true;
  if (/^wolo1[0-9a-z]+$/i.test(value)) return true;
  if (/^(?:0x)?[0-9a-f]{16,}$/i.test(value)) return true;
  if (/^https?:\/\//i.test(value)) return true;
  return false;
}

export function translateSiteCopy(
  catalog: SiteTranslationCatalog | null,
  source: string,
) {
  if (!catalog || shouldProtectSiteCopy(source)) return source;
  return catalog.translations[source] ?? source;
}
