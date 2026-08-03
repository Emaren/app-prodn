import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HOME_SPANISH_COPY,
  homeCopy,
} from "../lib/i18n/homeCopy.ts";

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

function source(relativePath: string) {
  return readFileSync(
    new URL(relativePath, import.meta.url),
    "utf8",
  );
}

test("Spanish homepage copy translates core visible surfaces", () => {
  assert.equal(
    homeCopy("es", "Featured Warriors"),
    "Guerreros destacados",
  );
  assert.equal(
    homeCopy("es", "Community Lobby"),
    "Lobby de la comunidad",
  );
  assert.equal(
    homeCopy("es", "Online Players"),
    "Jugadores en línea",
  );
  assert.equal(
    homeCopy("es", "Recent Parsed Games"),
    "Partidas analizadas recientemente",
  );
  assert.equal(
    homeCopy("es", "WAR CHEST"),
    "COFRE DE GUERRA",
  );
  assert.equal(
    homeCopy("es", "Message the lobby..."),
    "Escribe al lobby...",
  );
  assert.equal(
    homeCopy("es", "Watch & Chat"),
    "Ver y chatear",
  );
  assert.equal(
    homeCopy("es", "WOLO Market"),
    "Mercado WOLO",
  );
});

test("Spanish homepage copy translates generated phrases around protected truth", () => {
  assert.equal(
    homeCopy("es", "4 entrants"),
    "4 participantes",
  );
  assert.equal(
    homeCopy("es", "Winner Jim"),
    "Ganador: Jim",
  );
  assert.equal(
    homeCopy("es", "Jim is typing…"),
    "Jim está escribiendo…",
  );
  assert.equal(
    homeCopy("es", "25 WOLO pot"),
    "Pozo de 25 WOLO",
  );
  assert.equal(
    homeCopy("es", "3 HD lobbies · 8 seats"),
    "3 lobbies HD · 8 plazas",
  );
  assert.equal(
    homeCopy("es", "Rank #2380"),
    "Rango #2380",
  );
  assert.equal(
    homeCopy("es", "12W · 4L · 1U"),
    "12V · 4D · 1I",
  );
});

test("protected AoE2WAR names and user content remain unchanged", () => {
  for (const protectedValue of [
    "AoE2WAR",
    "WOLO",
    "$WOLO",
    "WoloChain",
    "Wolomania",
    "ELO",
    "RM",
    "DM",
    "Steam",
    "Emaren",
    "Julio Alvarez",
    "[BDB]PIGMAN",
    "Yucatan",
    "wolo1abc123",
    "8A9F00HASH",
    "Nice! Jim shows up 🔥",
  ]) {
    assert.equal(
      homeCopy("es", protectedValue),
      protectedValue,
    );
  }
});

test("English locale preserves source copy", () => {
  assert.equal(
    homeCopy("en", "Featured Warriors"),
    "Featured Warriors",
  );
  assert.equal(
    homeCopy("en", "4 entrants"),
    "4 entrants",
  );
});

test("all active homepage surfaces use the homepage locale hook", () => {
  for (const relativePath of integrationFiles) {
    assert.match(
      source(relativePath),
      /useHomeCopy/,
      `${relativePath} must use homepage translation copy`,
    );
  }
});

test("reviewed screenshot English is not rendered as raw JSX", () => {
  const combined = integrationFiles
    .map((relativePath) => source(relativePath))
    .join("\n");

  for (const retiredRawJsx of [
    "Featured Warriors",
    "Elite competitors. Legendary rivalries.",
    "View all warriors",
    "Community Lobby",
    "Online Players",
    "Recent Parsed Games",
    "WAR CHEST",
    "Join Queue",
    "Bracket Preview",
    "Live Comments",
    "WOLO Market",
    "Aim small. Miss small. ⚔️",
  ]) {
    const escaped = retiredRawJsx.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    assert.doesNotMatch(
      combined,
      new RegExp(`>\\s*${escaped}\\s*<`),
      `${retiredRawJsx} must render through homeCopy`,
    );
  }
});

test("Spanish catalog is substantial and retains sacred terms", () => {
  assert.ok(
    Object.keys(HOME_SPANISH_COPY).length >= 200,
    "homepage Spanish catalog should cover the complete active surface",
  );

  assert.equal(
    homeCopy("es", "Settled on WoloChain"),
    "Liquidado en WoloChain",
  );
  assert.equal(
    homeCopy("es", "WOLO depth"),
    "Profundidad WOLO",
  );
});
