import {
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";

export type PublicPlayerSearchIdentity = {
  name?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
  aliases?: Array<string | null | undefined>;
};

export type PublicPlayerSearchIndex = {
  substringKeys: Set<string>;
  exactHistoricalCompositeKeys: Set<string>;
};

export function normalizePublicPlayerSearch(
  value: string | null | undefined,
) {
  return normalizePublicPlayerName(
    value,
  )
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isCompositeObservedName(
  value: string | null | undefined,
) {
  return String(value ?? "").includes(",");
}

export function buildPublicPlayerSearchIndex(
  identity: PublicPlayerSearchIdentity,
): PublicPlayerSearchIndex {
  const substringKeys =
    new Set<string>();

  const exactHistoricalCompositeKeys =
    new Set<string>();

  const directValues = [
    identity.name,
    identity.inGameName,
    identity.steamPersonaName,
  ];  for (const value of directValues) {
    const key = normalizePublicPlayerSearch(value);
    if (!key) continue;

    if (isCompositeObservedName(value)) {
      exactHistoricalCompositeKeys.add(key);
      continue;
    }

    substringKeys.add(key);
  }

  for (
    const alias of identity.aliases ?? []
  ) {
    const normalized =
      normalizePublicPlayerSearch(
        alias,
      );

    if (!normalized) {
      continue;
    }

    if (
      isCompositeObservedName(alias)
    ) {
      exactHistoricalCompositeKeys.add(
        normalized,
      );
      continue;
    }

    substringKeys.add(normalized);
  }

  return {
    substringKeys,
    exactHistoricalCompositeKeys,
  };
}

export function matchesPublicPlayerSearch(
  identity: PublicPlayerSearchIdentity,
  query: string | null | undefined,
) {
  const normalizedQuery =
    normalizePublicPlayerSearch(query);

  if (!normalizedQuery) {
    return true;
  }

  const index =
    buildPublicPlayerSearchIndex(
      identity,
    );

  return (
    Array.from(
      index.substringKeys,
    ).some(
      (value) =>
        value.includes(
          normalizedQuery,
        ),
    ) ||
    index.exactHistoricalCompositeKeys.has(
      normalizedQuery,
    )
  );
}

export function matchesPublicPlayerSearchTerms(
  identity: PublicPlayerSearchIdentity,
  terms: string[],
) {
  const normalizedTerms =
    Array.from(
      new Set(
        terms
          .map(
            normalizePublicPlayerSearch,
          )
          .filter(Boolean),
      ),
    );

  if (normalizedTerms.length === 0) {
    return false;
  }

  return normalizedTerms.some(
    (term) =>
      matchesPublicPlayerSearch(
        identity,
        term,
      ),
  );
}
