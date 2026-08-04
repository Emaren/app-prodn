import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const LANGUAGE_CODES = [
  "en", "zh-CN", "fr", "de", "es", "pt-BR", "pl", "ja",
  "ko", "zh-TW", "nl", "ru", "be", "hi", "si", "ta",
] as const;

function readJson(path: string) {
  return JSON.parse(
    readFileSync(new URL(path, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { [prefix]: String(value) };
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nested]) =>
        Object.entries(flatten(nested, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

test("all sixteen shell catalogs have identical keys", () => {
  const english = flatten(readJson("../messages/en.json"));
  const expectedKeys = Object.keys(english).sort();

  for (const locale of LANGUAGE_CODES) {
    const catalog = flatten(readJson(`../messages/${locale}.json`));
    assert.deepEqual(Object.keys(catalog).sort(), expectedKeys, locale);
    assert.ok(Object.values(catalog).every((value) => value.trim()), locale);
  }
});

test("non-English shell catalogs are substantially translated", () => {
  const english = flatten(readJson("../messages/en.json"));

  for (const locale of LANGUAGE_CODES) {
    if (locale === "en") continue;
    const catalog = flatten(readJson(`../messages/${locale}.json`));
    const changed = Object.keys(english).filter(
      (key) => catalog[key] !== english[key],
    ).length;
    assert.ok(changed >= Object.keys(english).length * 0.5, locale);
  }
});

test("Spanish global shell retains reviewed campaign copy", () => {
  const spanish = readJson("../messages/es.json") as {
    Translator: { title: string; tagline: string };
    Shell: {
      currentPage: string;
      nav: { bets: string; players: string };
      pages: { bountyBoard: string; commandInbox: string };
    };
  };

  assert.equal(spanish.Translator.title, "Universal Translator");
  assert.equal(spanish.Translator.tagline, "War to the World.");
  assert.equal(spanish.Shell.currentPage, "Página actual");
  assert.equal(spanish.Shell.nav.bets, "Apuestas");
  assert.equal(spanish.Shell.nav.players, "Jugadores");
  assert.equal(spanish.Shell.pages.bountyBoard, "Tablón de Recompensas");
  assert.equal(spanish.Shell.pages.commandInbox, "Bandeja de Mando");
});

test("translator retains the approved amber title and blue campaign line", () => {
  const source = readFileSync(
    new URL("../components/i18n/UniversalTranslator.tsx", import.meta.url),
    "utf8",
  );
  const dictionary = readFileSync(
    new URL("../lib/i18n/dictionary.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /t\("title"\)/);
  assert.match(source, /t\("tagline"\)/);
  assert.match(source, /text-amber-100\/55/);
  assert.match(source, /text-slate-400/);
  assert.match(source, /<Languages/);
  assert.doesNotMatch(source, /t\("brand"\)/);
  assert.doesNotMatch(source, /Every banner heard/);
  assert.doesNotMatch(source, /Choose your tongue/);
  assert.doesNotMatch(source, /<h2 className="font-serif/);
  assert.doesNotMatch(dictionary, /^\s*(?:title|subtitle):/m);
});

test("global provider lazy-loads every non-English catalog", () => {
  const provider = readFileSync(
    new URL("../components/i18n/AoE2WarIntlProvider.tsx", import.meta.url),
    "utf8",
  );

  assert.match(provider, /NextIntlClientProvider/);
  assert.match(provider, /HomeCatalogProvider/);
  assert.match(provider, /CATALOG_LOADERS/);
  assert.match(provider, /aoe2warCatalog/);
  assert.doesNotMatch(provider, /selectedLanguage === "es"/);

  for (const locale of LANGUAGE_CODES) {
    if (locale === "en") continue;
    assert.ok(provider.includes(`import("@/messages/${locale}.json")`), locale);
    assert.ok(provider.includes(`import("@/messages/home/${locale}.json")`), locale);
  }

  assert.match(provider, /timeZone="UTC"/);
});

test("next-intl remains pinned", () => {
  const pkg = readJson("../package.json") as {
    dependencies?: Record<string, string>;
  };
  assert.equal(pkg.dependencies?.["next-intl"], "4.13.4");
});
