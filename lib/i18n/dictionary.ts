import type { UniversalLanguageCode } from "@/lib/i18n/languages";

export type UniversalTranslatorStrings = {
  core: string;
  communityBeta: string;
  fallback: string;
  auto: string;
  browserDefault: string;
  resetAuto: string;
  selected: string;
};

const ENGLISH: UniversalTranslatorStrings = {
  core: "Core",
  communityBeta: "Community beta",
  fallback: "Fallback",
  auto: "Auto",
  browserDefault: "Browser default",
  resetAuto: "Reset to Auto",
  selected: "Selected",
};

const TRANSLATOR_DICTIONARY: Partial<
  Record<UniversalLanguageCode, Partial<UniversalTranslatorStrings>>
> = {
  "zh-CN": {
  },
  fr: {
  },
  de: {
  },
  es: {
  },
  "pt-BR": {
  },
  pl: {
  },
  ja: {
  },
  ko: {
  },
  "zh-TW": {
  },
  nl: {
  },
  ru: {
  },
  be: {
  },
  hi: {
  },
  si: {
  },
  ta: {
  },
};

export function getUniversalTranslatorStrings(
  code: UniversalLanguageCode | null
): UniversalTranslatorStrings {
  if (!code) return ENGLISH;
  return {
    ...ENGLISH,
    ...(TRANSLATOR_DICTIONARY[code] ?? {}),
  };
}
