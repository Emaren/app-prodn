import type {
  HeroLanguageCode,
  HeroPlaylistItemView,
  HeroScreenConfig,
} from "@/lib/hero/types";

export const HERO_LANGUAGE_CODES = ["en", "fr", "es"] as const;
export const HERO_TRANSLATED_LANGUAGE_CODES = ["fr", "es"] as const;

export const HERO_LANGUAGE_LABELS: Record<HeroLanguageCode, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
};

type HeroLanguageItem = Pick<HeroPlaylistItemView, "screen">;

export function heroScreenLanguage(config: HeroScreenConfig): HeroLanguageCode {
  return HERO_LANGUAGE_CODES.includes(config.languageCode as HeroLanguageCode)
    ? (config.languageCode as HeroLanguageCode)
    : "en";
}

export function heroScreenLanguageGroup(item: HeroLanguageItem) {
  const configured = item.screen.config.languageGroupKey?.trim();
  if (configured) return configured;
  return item.screen.key;
}

export function isTranslatedHeroLanguage(
  language: string | null | undefined
): language is (typeof HERO_TRANSLATED_LANGUAGE_CODES)[number] {
  return HERO_TRANSLATED_LANGUAGE_CODES.includes(
    language as (typeof HERO_TRANSLATED_LANGUAGE_CODES)[number]
  );
}

/**
 * Public language variants never disturb the editor's canonical chain order.
 * English owns the chain slot. An explicitly selected French/Spanish variant
 * is inserted directly after its English counterpart for that viewer only.
 * Auto/browser mode deliberately remains English-only.
 */
export function arrangeHeroItemsForLanguage<T extends HeroPlaylistItemView>(
  items: readonly T[],
  selectedLanguage: string | null | undefined
): T[] {
  const targetLanguage = isTranslatedHeroLanguage(selectedLanguage)
    ? selectedLanguage
    : null;

  const englishByGroup = new Map<string, T>();
  const variantsByGroup = new Map<string, Map<HeroLanguageCode, T>>();
  for (const item of items) {
    const language = heroScreenLanguage(item.screen.config);
    const group = heroScreenLanguageGroup(item);
    if (language === "en") {
      if (!englishByGroup.has(group)) englishByGroup.set(group, item);
      continue;
    }
    const variants = variantsByGroup.get(group) ?? new Map<HeroLanguageCode, T>();
    if (!variants.has(language)) variants.set(language, item);
    variantsByGroup.set(group, variants);
  }

  const emitted = new Set<number>();
  const result: T[] = [];

  for (const item of items) {
    if (emitted.has(item.screen.id)) continue;
    const language = heroScreenLanguage(item.screen.config);
    const group = heroScreenLanguageGroup(item);

    if (language !== "en") {
      if (!englishByGroup.has(group) && targetLanguage === language) {
        result.push(item);
        emitted.add(item.screen.id);
      }
      continue;
    }

    result.push(item);
    emitted.add(item.screen.id);

    if (!targetLanguage) continue;
    const variant = variantsByGroup.get(group)?.get(targetLanguage);
    if (variant && !emitted.has(variant.screen.id)) {
      result.push(variant);
      emitted.add(variant.screen.id);
    }
  }

  return result;
}

export type HeroHiddenLanguageByGroup = Record<string, HeroLanguageCode | undefined>;

export function filterHeroItemsByVisibility<T extends HeroPlaylistItemView>(
  items: readonly T[],
  hiddenByGroup: HeroHiddenLanguageByGroup
): T[] {
  return items.filter((item) => {
    const group = heroScreenLanguageGroup(item);
    return hiddenByGroup[group] !== heroScreenLanguage(item.screen.config);
  });
}

export function heroVariantPairForItem<T extends HeroPlaylistItemView>(
  arrangedItems: readonly T[],
  current: T,
  selectedLanguage: string | null | undefined
) {
  if (!isTranslatedHeroLanguage(selectedLanguage)) return null;
  const group = heroScreenLanguageGroup(current);
  const pair = arrangedItems.filter(
    (item) =>
      heroScreenLanguageGroup(item) === group &&
      ["en", selectedLanguage].includes(heroScreenLanguage(item.screen.config))
  );
  const english = pair.find(
    (item) => heroScreenLanguage(item.screen.config) === "en"
  );
  const translated = pair.find(
    (item) => heroScreenLanguage(item.screen.config) === selectedLanguage
  );
  if (!english || !translated) return null;
  return {
    group,
    english,
    translated,
    translatedLanguage: selectedLanguage,
  };
}

export function normalizeHeroHiddenLanguageByGroup(
  value: unknown
): HeroHiddenLanguageByGroup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const hiddenByGroup =
    raw.hiddenByGroup &&
    typeof raw.hiddenByGroup === "object" &&
    !Array.isArray(raw.hiddenByGroup)
      ? (raw.hiddenByGroup as Record<string, unknown>)
      : raw;

  const normalized: HeroHiddenLanguageByGroup = {};
  for (const [rawGroup, rawLanguage] of Object.entries(hiddenByGroup)) {
    const group = rawGroup.trim().slice(0, 120);
    if (!group || !HERO_LANGUAGE_CODES.includes(rawLanguage as HeroLanguageCode)) {
      continue;
    }
    normalized[group] = rawLanguage as HeroLanguageCode;
    if (Object.keys(normalized).length >= 100) break;
  }
  return normalized;
}

export function serializeHeroHiddenLanguageByGroup(
  hiddenByGroup: HeroHiddenLanguageByGroup
) {
  return {
    version: 1,
    hiddenByGroup: normalizeHeroHiddenLanguageByGroup(hiddenByGroup),
  };
}
