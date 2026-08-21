import type { UniversalLanguageCode } from "@/lib/i18n/languages";

const CACHE_TTL_MS =
  6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

type CacheEntry = {
  text: string;
  expiresAt: number;
};

type GlobalWithClanTranslationCache =
  typeof globalThis & {
    __aoe2ClanMessageTranslations?: Map<
      string,
      CacheEntry
    >;
  };

const globalCache =
  globalThis as GlobalWithClanTranslationCache;

const cache =
  globalCache.__aoe2ClanMessageTranslations ??
  new Map<string, CacheEntry>();

globalCache.__aoe2ClanMessageTranslations =
  cache;

function cacheKey(
  messageId: number,
  updatedAt: string,
  language: UniversalLanguageCode,
) {
  return `${messageId}:${updatedAt}:${language}`;
}

function prune(now = Date.now()) {
  for (
    const [key, entry]
    of cache
  ) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  while (
    cache.size >
    CACHE_MAX_ENTRIES
  ) {
    const oldest =
      cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function getClanMessageTranslation(
  messageId: number,
  updatedAt: string,
  language: UniversalLanguageCode,
) {
  prune();

  const key =
    cacheKey(
      messageId,
      updatedAt,
      language,
    );
  const entry =
    cache.get(key);

  if (!entry) return null;

  if (
    entry.expiresAt <=
    Date.now()
  ) {
    cache.delete(key);
    return null;
  }

  return entry.text;
}

export function setClanMessageTranslation(
  messageId: number,
  updatedAt: string,
  language: UniversalLanguageCode,
  text: string,
) {
  prune();

  const key =
    cacheKey(
      messageId,
      updatedAt,
      language,
    );

  cache.delete(key);
  cache.set(key, {
    text,
    expiresAt:
      Date.now() +
      CACHE_TTL_MS,
  });

  prune();
}
