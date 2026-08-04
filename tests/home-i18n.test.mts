import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  translateHomeCopy,
  type HomeCatalog,
} from "../lib/i18n/homeCopy.ts";
import {
  HOME_DYNAMIC_SOURCE_KEYS,
  HOME_SOURCE_KEYS,
} from "../lib/i18n/homeSources.ts";

const LANGUAGE_CODES = [
  "en", "zh-CN", "fr", "de", "es", "pt-BR", "pl", "ja",
  "ko", "zh-TW", "nl", "ru", "be", "hi", "si", "ta",
] as const;

const integrationFiles = [
  "../app/HomePageClient.tsx",
  "../components/hero/HeroCarousel.tsx",
  "../components/hero/HeroScreenRenderer.tsx",
  "../components/home/Aoe2ShortsTile.tsx",
  "../components/home/HeroTakeoverSlot.tsx",
  "../components/lobby/LeaderboardLaneToggle.tsx",
  "../components/lobby/LeaderboardPanel.tsx",
  "../components/lobby/LiveTickerStrip.tsx",
  "../components/lobby/LobbyAppearanceControls.tsx",
  "../components/lobby/LobbyChat.tsx",
  "../components/lobby/LobbyHero.tsx",
  "../components/lobby/OnlinePlayersPanel.tsx",
  "../components/lobby/RecentMatchesPanel.tsx",
  "../components/lobby/TopWoloEarnersTile.tsx",
  "../components/lobby/TournamentPanel.tsx",
  "../components/lobby/WatchAndChatHero.tsx",
  "../components/lobby/WoloMarketExtremeTile.tsx",
  "../components/lobby/WoloMarketExtremeTileCurrent.tsx",
  "../components/lobby/WoloMarketTileLegacy.tsx",
  "../components/lobby/WolomaniaPromoTile.tsx",
  "../components/pwa/AoE2WarFooter.tsx",
] as const;

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function catalog(locale: string): HomeCatalog {
  return JSON.parse(
    readFileSync(
      new URL(`../messages/home/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as HomeCatalog;
}

test("all sixteen homepage catalogs are complete and aligned", () => {
  for (const locale of LANGUAGE_CODES) {
    const value = catalog(locale);
    assert.equal(value.static.length, HOME_SOURCE_KEYS.length, locale);
    assert.equal(value.dynamic.length, HOME_DYNAMIC_SOURCE_KEYS.length, locale);
    assert.ok(value.static.every((entry) => entry.trim()), locale);
    assert.ok(value.dynamic.every((entry) => entry.trim()), locale);
  }
});

test("all non-English homepage catalogs substantially translate source", () => {
  const english = catalog("en");

  for (const locale of LANGUAGE_CODES) {
    if (locale === "en") continue;
    const translated = catalog(locale);
    const changed = english.static.filter(
      (entry, index) => translated.static[index] !== entry,
    ).length;

    assert.ok(changed >= english.static.length * 0.65, locale);
    assert.notEqual(
      translateHomeCopy(translated, "Featured Warriors"),
      "Featured Warriors",
      locale,
    );
    assert.notEqual(
      translateHomeCopy(translated, "Online Players"),
      "Online Players",
      locale,
    );
  }
});

test("Spanish homepage retains reviewed production copy", () => {
  const spanish = catalog("es");
  assert.equal(
    translateHomeCopy(spanish, "Featured Warriors"),
    "Guerreros destacados",
  );
  assert.equal(
    translateHomeCopy(spanish, "Community Lobby"),
    "Lobby de la comunidad",
  );
  assert.equal(
    translateHomeCopy(spanish, "Online Players"),
    "Jugadores en línea",
  );
  assert.equal(
    translateHomeCopy(spanish, "Recent Parsed Games"),
    "Partidas analizadas recientemente",
  );
  assert.equal(
    translateHomeCopy(spanish, "WAR CHEST"),
    "COFRE DE GUERRA",
  );
});

test("dynamic phrases preserve player and chain truth", () => {
  for (const locale of LANGUAGE_CODES) {
    const translated = catalog(locale);
    const winner = translateHomeCopy(translated, "Winner Jim");
    const pot = translateHomeCopy(translated, "25 WOLO pot");
    const rank = translateHomeCopy(translated, "Rank #2380");

    assert.match(winner, /Jim/);
    assert.match(pot, /25/);
    assert.match(pot, /WOLO/);
    assert.match(rank, /2380/);

    if (locale !== "en") {
      assert.notEqual(winner, "Winner Jim", locale);
    }
  }
});

test("protected user and chain truth remains unchanged in every locale", () => {
  const values = [
    "AoE2WAR", "WOLO", "$WOLO", "WoloChain", "Wolomania",
    "ELO", "RM", "DM", "Steam", "Emaren", "Julio Alvarez",
    "[BDB]PIGMAN", "Yucatan", "wolo1abc123", "8A9F00HASH",
    "Nice! Jim shows up 🔥",
  ];

  for (const locale of LANGUAGE_CODES) {
    const translated = catalog(locale);
    for (const value of values) {
      assert.equal(translateHomeCopy(translated, value), value, `${locale}:${value}`);
    }
  }
});

test("English locale preserves source copy", () => {
  const english = catalog("en");
  assert.equal(
    translateHomeCopy(english, "Featured Warriors"),
    "Featured Warriors",
  );
  assert.equal(translateHomeCopy(english, "4 entrants"), "4 entrants");
});

test("all active homepage surfaces use the locale-aware hook", () => {
  for (const path of integrationFiles) {
    assert.match(source(path), /useHomeCopy/, path);
  }
});
