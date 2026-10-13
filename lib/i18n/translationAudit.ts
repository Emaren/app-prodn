/**
 * Translation Control Tower: catalog structural evidence, NEVER linguistic quality.
 *
 * This pure reducer is used only behind authenticated admin telemetry. It
 * never translates user content, requests AI, or grants a locale shipping status.
 */
export type CatalogAudit = {
  expected: number;
  translated: number;
  missing: number;
  extra: number;
  identicalToEnglish: number;
  coveragePercent: number;
  missingExamples: string[];
};

export type LanguageAudit = {
  code: string;
  nativeName: string;
  englishName: string;
  priority: number | null;
  shipped: boolean;
  shell: CatalogAudit;
  home: CatalogAudit;
  siteCopyEntries: number | null;
  siteCopyGeneratedAt: string | null;
  wholeSiteCoverage: null;
  chatTranslationQuality: "NOT_AUDITED";
  freshness: "NOT_ATTESTED";
};

export const TRANSLATION_EXPANSION_TARGETS = [
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", priority: 1 },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek", priority: 2 },
] as const;

export function catalogLeaves(value: unknown, path = ""): Map<string, string> {
  const result = new Map<string, string>();
  function walk(node: unknown, cursor: string) {
    if (typeof node === "string") {
      result.set(cursor, node);
    } else if (Array.isArray(node)) {
      node.forEach((entry, i) => walk(entry, cursor ? cursor + "." + i : String(i)));
    } else if (node && typeof node === "object") {
      for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
        walk(entry, cursor ? cursor + "." + key : key);
      }
    }
  }
  walk(value, path);
  return result;
}

export function auditCatalog(english: unknown, candidate: unknown): CatalogAudit {
  const source = catalogLeaves(english);
  const target = catalogLeaves(candidate);
  let translated = 0;
  let identicalToEnglish = 0;
  const missingExamples: string[] = [];
  for (const [key, original] of source) {
    const translation = target.get(key);
    if (typeof translation !== "string" || translation.trim().length === 0) {
      if (missingExamples.length < 8) missingExamples.push(key);
      continue;
    }
    translated += 1;
    if (translation === original) identicalToEnglish += 1;
  }
  const missing = source.size - translated;
  return {
    expected: source.size,
    translated,
    missing,
    extra: [...target.keys()].filter((key) => !source.has(key)).length,
    identicalToEnglish,
    coveragePercent: source.size === 0 ? 0 : Math.round(1000 * translated / source.size) / 10,
    missingExamples,
  };
}

export function buildTranslationAudit(input: {
  languages: Array<{ code: string; nativeName: string; englishName: string }>;
  shell: Record<string, unknown>;
  home: Record<string, unknown>;
  spanishSite?: { version?: number; locale?: string; generatedAt?: string; translations?: Record<string, string> };
}) {
  const englishShell = input.shell.en;
  const englishHome = input.home.en;
  if (!englishShell || !englishHome) throw new Error("Missing canonical English translation catalogs");
  const allLanguages = [
    ...input.languages.map((row) => ({ ...row, shipped: true, priority: row.code === "fr" ? 3 : null })),
    ...TRANSLATION_EXPANSION_TARGETS.map((row) => ({ ...row, shipped: false })),
  ];
  const seen = new Set<string>();
  const rows: LanguageAudit[] = allLanguages.map((row) => {
    if (seen.has(row.code)) throw new Error("Duplicate language registry code: " + row.code);
    seen.add(row.code);
    const shell = auditCatalog(englishShell, input.shell[row.code]);
    const home = auditCatalog(englishHome, input.home[row.code]);
    const siteCatalog = row.code === "es" && input.spanishSite?.locale === "es" &&
      input.spanishSite.version === 1 ? input.spanishSite : null;
    return {
      code: row.code,
      nativeName: row.nativeName,
      englishName: row.englishName,
      priority: row.priority,
      shipped: row.shipped,
      shell,
      home,
      siteCopyEntries: siteCatalog?.translations
        ? Object.values(siteCatalog.translations).filter((v) => typeof v === "string" && v.trim().length > 0).length
        : null,
      siteCopyGeneratedAt: siteCatalog?.generatedAt ?? null,
      wholeSiteCoverage: null,
      chatTranslationQuality: "NOT_AUDITED" as const,
      freshness: "NOT_ATTESTED" as const,
    };
  });
  rows.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) ||
    a.englishName.localeCompare(b.englishName, "en"));
  return {
    schema: 1,
    kind: "aoe2war-translation-control-tower",
    canonicalLocale: "en",
    shippingLocales: input.languages.length,
    monitoredLocales: rows.length,
    priorities: ["tr", "el", "fr"],
    rows,
    notes: {
      catalogCoverage: "Catalog key presence only; not verified linguistic quality, translated routes, or freshness",
      routeCoverage: "NOT_MEASURED: no audited whole-site source-string inventory",
      siteCopy: "Spanish DOM-copy catalog entries are not a site-wide coverage denominator",
      chat: "Dynamic chat/AI translation is independently permissioned and must be tested on demand",
      plannedLocales: "Turkish and Greek are not public until shell/home translations and release checks are complete",
    },
    mutationAllowed: false,
  };
}
