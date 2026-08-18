"use client";

import { NextIntlClientProvider } from "next-intl";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  HomeCatalogProvider,
} from "@/components/i18n/HomeCatalogContext";
import SiteTranslationLayer from "@/components/i18n/SiteTranslationLayer";
import {
  useUniversalLanguage,
} from "@/context/UniversalLanguageContext";
import {
  assertHomeCatalog,
  type HomeCatalog,
} from "@/lib/i18n/homeCopy";
import {
  type UniversalLanguageCode,
} from "@/lib/i18n/languages";
import englishMessages from "@/messages/en.json";
import englishHome from "@/messages/home/en.json";

type ShellMessages = typeof englishMessages;

type CatalogBundle = {
  locale: UniversalLanguageCode;
  messages: ShellMessages;
  home: HomeCatalog;
};

type NonEnglishLocale = Exclude<UniversalLanguageCode, "en">;

function createCatalogBundle(
  locale: UniversalLanguageCode,
  messages: unknown,
  home: unknown,
): CatalogBundle {
  assertHomeCatalog(home);

  return {
    locale,
    messages: messages as ShellMessages,
    home,
  };
}

const ENGLISH_BUNDLE = createCatalogBundle(
  "en",
  englishMessages,
  englishHome,
);

const CATALOG_LOADERS: Record<
  NonEnglishLocale,
  () => Promise<CatalogBundle>
> = {
  "zh-CN": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/zh-CN.json"),
      import("@/messages/home/zh-CN.json"),
    ]);

    return createCatalogBundle(
      "zh-CN",
      messages.default,
      home.default,
    );
  },
  "fr": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/fr.json"),
      import("@/messages/home/fr.json"),
    ]);

    return createCatalogBundle(
      "fr",
      messages.default,
      home.default,
    );
  },
  "de": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/de.json"),
      import("@/messages/home/de.json"),
    ]);

    return createCatalogBundle(
      "de",
      messages.default,
      home.default,
    );
  },
  "es": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/es.json"),
      import("@/messages/home/es.json"),
    ]);

    return createCatalogBundle(
      "es",
      messages.default,
      home.default,
    );
  },
  "pt-BR": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/pt-BR.json"),
      import("@/messages/home/pt-BR.json"),
    ]);

    return createCatalogBundle(
      "pt-BR",
      messages.default,
      home.default,
    );
  },
  "pl": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/pl.json"),
      import("@/messages/home/pl.json"),
    ]);

    return createCatalogBundle(
      "pl",
      messages.default,
      home.default,
    );
  },
  "ja": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/ja.json"),
      import("@/messages/home/ja.json"),
    ]);

    return createCatalogBundle(
      "ja",
      messages.default,
      home.default,
    );
  },
  "ko": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/ko.json"),
      import("@/messages/home/ko.json"),
    ]);

    return createCatalogBundle(
      "ko",
      messages.default,
      home.default,
    );
  },
  "zh-TW": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/zh-TW.json"),
      import("@/messages/home/zh-TW.json"),
    ]);

    return createCatalogBundle(
      "zh-TW",
      messages.default,
      home.default,
    );
  },
  "nl": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/nl.json"),
      import("@/messages/home/nl.json"),
    ]);

    return createCatalogBundle(
      "nl",
      messages.default,
      home.default,
    );
  },
  "ru": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/ru.json"),
      import("@/messages/home/ru.json"),
    ]);

    return createCatalogBundle(
      "ru",
      messages.default,
      home.default,
    );
  },
  "be": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/be.json"),
      import("@/messages/home/be.json"),
    ]);

    return createCatalogBundle(
      "be",
      messages.default,
      home.default,
    );
  },
  "hi": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/hi.json"),
      import("@/messages/home/hi.json"),
    ]);

    return createCatalogBundle(
      "hi",
      messages.default,
      home.default,
    );
  },
  "si": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/si.json"),
      import("@/messages/home/si.json"),
    ]);

    return createCatalogBundle(
      "si",
      messages.default,
      home.default,
    );
  },
  "ta": async () => {
    const [messages, home] = await Promise.all([
      import("@/messages/ta.json"),
      import("@/messages/home/ta.json"),
    ]);

    return createCatalogBundle(
      "ta",
      messages.default,
      home.default,
    );
  },
};

const CATALOG_CACHE = new Map<
  UniversalLanguageCode,
  CatalogBundle
>([["en", ENGLISH_BUNDLE]]);

function browserCatalogLocale(): UniversalLanguageCode {
  if (typeof navigator === "undefined") return "en";

  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const browserLanguage of browserLanguages) {
    const normalized = browserLanguage.trim().toLowerCase();

    if (
      normalized.startsWith("zh-hant") ||
      normalized.startsWith("zh-tw") ||
      normalized.startsWith("zh-hk") ||
      normalized.startsWith("zh-mo")
    ) {
      return "zh-TW";
    }

    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("pt")) return "pt-BR";

    for (
      const code of [
        "en", "fr", "de", "es", "pl", "ja", "ko",
        "nl", "ru", "be", "hi", "si", "ta",
      ] as const
    ) {
      if (
        normalized === code ||
        normalized.startsWith(`${code}-`)
      ) {
        return code;
      }
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

  const requestedLocale = useMemo<UniversalLanguageCode>(() => {
    if (selectedLanguage) return selectedLanguage;
    return languageLoaded ? browserCatalogLocale() : "en";
  }, [languageLoaded, selectedLanguage]);

  const [activeBundle, setActiveBundle] = useState<CatalogBundle>(
    ENGLISH_BUNDLE,
  );

  useEffect(() => {
    let cancelled = false;
    const cached = CATALOG_CACHE.get(requestedLocale);

    if (cached) {
      setActiveBundle(cached);
      return () => {
        cancelled = true;
      };
    }

    const loader = CATALOG_LOADERS[
      requestedLocale as NonEnglishLocale
    ];

    void loader()
      .then((bundle) => {
        if (cancelled) return;
        CATALOG_CACHE.set(requestedLocale, bundle);
        setActiveBundle(bundle);
      })
      .catch((error: unknown) => {
        console.error(
          "AoE2WAR translation catalog failed to load.",
          error,
        );
        if (!cancelled) setActiveBundle(ENGLISH_BUNDLE);
      });

    return () => {
      cancelled = true;
    };
  }, [requestedLocale]);

  useEffect(() => {
    document.documentElement.dataset.aoe2warCatalog =
      activeBundle.locale;
  }, [activeBundle.locale]);

  return (
    <NextIntlClientProvider
      locale={activeBundle.locale}
      messages={activeBundle.messages}
      timeZone="UTC"
    >
      <HomeCatalogProvider catalog={activeBundle.home}>
        <SiteTranslationLayer locale={activeBundle.locale}>
          {children}
        </SiteTranslationLayer>
      </HomeCatalogProvider>
    </NextIntlClientProvider>
  );
}
