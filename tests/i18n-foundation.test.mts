import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

function readJson(path: string) {
  return JSON.parse(
    readFileSync(
      new URL(
        path,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function flattenKeys(
  value: unknown,
  prefix = "",
): string[] {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return [prefix];
  }

  return Object.entries(
    value as Record<string, unknown>,
  ).flatMap(
    ([key, nested]) =>
      flattenKeys(
        nested,
        prefix
          ? `${prefix}.${key}`
          : key,
      ),
  );
}

test(
  "English and Spanish catalogs have identical keys",
  () => {
    const english =
      readJson("../messages/en.json");

    const spanish =
      readJson("../messages/es.json");

    assert.deepEqual(
      flattenKeys(spanish).sort(),
      flattenKeys(english).sort(),
    );
  },
);

test(
  "Spanish global shell contains reviewed copy",
  () => {
    const spanish =
      readJson("../messages/es.json") as {
        Translator: {
          title: string;
          tagline: string;
        };
        Shell: {
          currentPage: string;
          nav: {
            bets: string;
            players: string;
          };
          pages: {
            bountyBoard: string;
            commandInbox: string;
          };
        };
      };

    assert.equal(
      spanish.Translator.title,
      "Universal Translator",
    );

    assert.equal(
      spanish.Translator.tagline,
      "War to the World.",
    );

    assert.equal(
      spanish.Shell.currentPage,
      "Página actual",
    );

    assert.equal(
      spanish.Shell.nav.bets,
      "Apuestas",
    );

    assert.equal(
      spanish.Shell.nav.players,
      "Jugadores",
    );

    assert.equal(
      spanish.Shell.pages.bountyBoard,
      "Tablón de Recompensas",
    );

    assert.equal(
      spanish.Shell.pages.commandInbox,
      "Bandeja de Mando",
    );
  },
);

test(
  "translator restores amber title and blue campaign line",
  () => {
    const source =
      readFileSync(
        new URL(
          "../components/i18n/UniversalTranslator.tsx",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      source,
      /t\("title"\)/,
    );

    assert.match(
      source,
      /t\("tagline"\)/,
    );

    assert.match(
      source,
      /text-amber-100\/55/,
    );

    assert.match(
      source,
      /text-slate-400/,
    );

    assert.match(
      source,
      /<Languages/,
    );

    assert.doesNotMatch(
      source,
      /t\("brand"\)/,
    );

    assert.doesNotMatch(
      source,
      /Every banner heard/,
    );

    assert.doesNotMatch(
      source,
      /Choose your tongue/,
    );

    assert.doesNotMatch(
      source,
      /<h2 className="font-serif/,
    );
  },
);

test(
  "global shell is wrapped in the intl provider",
  () => {
    const shell =
      readFileSync(
        new URL(
          "../app/AppShell.tsx",
          import.meta.url,
        ),
        "utf8",
      );

    const provider =
      readFileSync(
        new URL(
          "../components/i18n/AoE2WarIntlProvider.tsx",
          import.meta.url,
        ),
        "utf8",
      );

    assert.match(
      shell,
      /useTranslations\("Shell"\)/,
    );

    assert.match(
      shell,
      /AoE2WarIntlProvider/,
    );

    assert.match(
      shell,
      /HEADER_LINK_KEYS/,
    );

    assert.match(
      shell,
      /KINGDOM_COPY_KEYS/,
    );

    assert.match(
      provider,
      /NextIntlClientProvider/,
    );

    assert.match(
      provider,
      /selectedLanguage === "es"/,
    );

    assert.match(
      provider,
      /timeZone="UTC"/,
    );
  },
);

test(
  "next-intl is pinned without introducing a lockfile",
  () => {
    const pkg =
      readJson("../package.json") as {
        dependencies?: Record<
          string,
          string
        >;
      };

    assert.equal(
      pkg.dependencies?.["next-intl"],
      "4.13.4",
    );
  },
);
