"use client";

import { NextIntlClientProvider } from "next-intl";
import { useMemo, type ReactNode } from "react";

import { useUniversalLanguage } from "@/context/UniversalLanguageContext";
import englishMessages from "@/messages/en.json";
import spanishMessages from "@/messages/es.json";

type SupportedCatalogLocale =
  | "en"
  | "es";

function browserCatalogLocale(): SupportedCatalogLocale {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const browserLanguages =
    navigator.languages?.length
      ? navigator.languages
      : [navigator.language];

  for (const browserLanguage of browserLanguages) {
    const normalized =
      browserLanguage
        .trim()
        .toLowerCase();

    if (
      normalized === "es" ||
      normalized.startsWith("es-")
    ) {
      return "es";
    }
  }

  return "en";
}

export default function AoE2WarIntlProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    selectedLanguage,
    languageLoaded,
  } = useUniversalLanguage();

  const locale = useMemo<SupportedCatalogLocale>(() => {
    if (selectedLanguage === "es") {
      return "es";
    }

    if (selectedLanguage) {
      return "en";
    }

    return languageLoaded
      ? browserCatalogLocale()
      : "en";
  }, [
    languageLoaded,
    selectedLanguage,
  ]);

  const messages =
    locale === "es"
      ? spanishMessages
      : englishMessages;

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}
