export const UNIVERSAL_LANGUAGE_STORAGE_KEY =
  "aoe2war.universalLanguage.v1";
export const UNIVERSAL_LANGUAGE_COOKIE_NAME = "aoe2war_language";

export const SACRED_AOE2WAR_TERMS = [
  "AoE2WAR",
  "WOLO",
  "WoloChain",
  "Wolomania",
  "Clan Hall",
  "Mystikal Zodiac",
  "ELO",
  "Belts",
  "Artifacts",
  "Emaren",
] as const;

export type UniversalLanguageGroup = "core" | "community";
export type UniversalLanguageCode =
  | "en"
  | "zh-CN"
  | "fr"
  | "de"
  | "es"
  | "pt-BR"
  | "pl"
  | "ja"
  | "ko"
  | "zh-TW"
  | "nl"
  | "ru"
  | "be"
  | "hi"
  | "si"
  | "ta";

export type UniversalLanguage = {
  code: UniversalLanguageCode;
  htmlLang: string;
  nativeName: string;
  englishName: string;
  mark: string;
  group: UniversalLanguageGroup;
};

export const UNIVERSAL_LANGUAGES = [
  {
    code: "en",
    htmlLang: "en",
    nativeName: "English",
    englishName: "English",
    mark: "EN",
    group: "core",
  },
  {
    code: "zh-CN",
    htmlLang: "zh-Hans",
    nativeName: "中文",
    englishName: "Chinese Simplified",
    mark: "中文",
    group: "core",
  },
  {
    code: "fr",
    htmlLang: "fr",
    nativeName: "Français",
    englishName: "French",
    mark: "FRA",
    group: "core",
  },
  {
    code: "es",
    htmlLang: "es",
    nativeName: "Español",
    englishName: "Spanish",
    mark: "ESP",
    group: "core",
  },
  {
    code: "pt-BR",
    htmlLang: "pt-BR",
    nativeName: "Português BR",
    englishName: "Portuguese Brazil",
    mark: "POR",
    group: "core",
  },
  {
    code: "pl",
    htmlLang: "pl",
    nativeName: "Polski",
    englishName: "Polish",
    mark: "POL",
    group: "core",
  },
  {
    code: "ja",
    htmlLang: "ja",
    nativeName: "日本語",
    englishName: "Japanese",
    mark: "JPN",
    group: "core",
  },
  {
    code: "ko",
    htmlLang: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    mark: "한국어",
    group: "core",
  },
  {
    code: "zh-TW",
    htmlLang: "zh-Hant",
    nativeName: "繁體中文",
    englishName: "Traditional Chinese",
    mark: "繁中",
    group: "core",
  },
  {
    code: "de",
    htmlLang: "de",
    nativeName: "Deutsch",
    englishName: "German",
    mark: "DEU",
    group: "core",
  },
  {
    code: "nl",
    htmlLang: "nl",
    nativeName: "Nederlands",
    englishName: "Dutch",
    mark: "NLD",
    group: "community",
  },
  {
    code: "ru",
    htmlLang: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    mark: "Рус",
    group: "community",
  },
  {
    code: "be",
    htmlLang: "be",
    nativeName: "Беларуская",
    englishName: "Belarusian",
    mark: "БЕЛ",
    group: "community",
  },
  {
    code: "hi",
    htmlLang: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    mark: "हिन्दी",
    group: "community",
  },
  {
    code: "si",
    htmlLang: "si",
    nativeName: "සිංහල",
    englishName: "Sinhala",
    mark: "සිංහල",
    group: "community",
  },
  {
    code: "ta",
    htmlLang: "ta",
    nativeName: "தமிழ்",
    englishName: "Tamil",
    mark: "தமிழ்",
    group: "community",
  },
] as const satisfies readonly UniversalLanguage[];

export const UNIVERSAL_LANGUAGE_CYCLE_MARKS = [
  "中文",
  "ESP",
  "FRA",
  "DEU",
  "POR",
  "POL",
  "JPN",
  "한국어",
  "繁中",
  "NLD",
  "हिन्दी",
  "தமிழ்",
  "Рус",
  "සිංහල",
] as const;

const LANGUAGE_CODE_SET = new Set<string>(
  UNIVERSAL_LANGUAGES.map((language) => language.code)
);

export function isUniversalLanguageCode(
  value: unknown
): value is UniversalLanguageCode {
  return typeof value === "string" && LANGUAGE_CODE_SET.has(value);
}

export function findUniversalLanguage(
  code: UniversalLanguageCode | null
): UniversalLanguage | null {
  if (!code) return null;
  return (
    UNIVERSAL_LANGUAGES.find((language) => language.code === code) ?? null
  );
}

export function normalizeUniversalLanguage(
  value: unknown
): UniversalLanguageCode | null {
  return isUniversalLanguageCode(value) ? value : null;
}
