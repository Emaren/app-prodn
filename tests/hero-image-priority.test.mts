import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Academy preloads the exact default lossless hero background", () => {
  const academy = source("app/academy/AcademyHero.tsx");

  assert.match(
    academy,
    /ACADEMY_HERO_E_BG_IMAGE\s*=\s*[\s\S]*academy-hero-e-f2b3eaff-lossless\.webp/,
  );
  assert.match(
    academy,
    /preload\(ACADEMY_HERO_E_BG_IMAGE,\s*\{[\s\S]*?as: "image",[\s\S]*?fetchPriority: "high"/,
  );
});

test("managed page heroes reserve the critical lane for the first image", () => {
  const rotator = source("components/page-heroes/PageHeroRotator.tsx");

  assert.match(
    rotator,
    /preload\(firstImageUrl, \{ as: "image", fetchPriority: "high" \}\)/,
  );
  assert.match(rotator, /loading=\{itemIndex === 0 \? "eager" : "lazy"\}/);
  assert.match(rotator, /fetchPriority=\{itemIndex === 0 \? "high" : "low"\}/);
  assert.match(rotator, /image\.fetchPriority = "low"/);
});

test("Wolomania preloads and prioritizes the unchanged official poster", () => {
  const wolomania = source("app/wolomania/WolomaniaPageClient.tsx");

  assert.match(
    wolomania,
    /OFFICIAL_POSTER = "\/uploads\/managed-assets\/wolomania\/wolomania\.webp"/,
  );
  assert.match(
    wolomania,
    /preload\(OFFICIAL_POSTER, \{ as: "image", fetchPriority: "high" \}\)/,
  );
  assert.match(
    wolomania,
    /src=\{OFFICIAL_POSTER\}[\s\S]*?loading="eager"[\s\S]*?fetchPriority="high"/,
  );
});

test("Lobby reserves the critical image lane for the actual hero", () => {
  const home = source("app/HomePageClient.tsx");
  const lobbyHero = source("components/lobby/LobbyHero.tsx");
  const carousel = source("components/hero/HeroCarousel.tsx");
  const renderer = source("components/hero/HeroScreenRenderer.tsx");
  const eventHero = source("components/lobby/WolomaniaPromoTile.tsx");

  assert.equal((home.match(/loading="eager"/g) || []).length >= 2, true);
  assert.equal((home.match(/priority=\{index < 2\}/g) || []).length, 0);
  assert.equal((home.match(/fetchPriority="low"/g) || []).length >= 2, true);
  assert.equal((home.match(/unoptimized/g) || []).length >= 2, true);
  assert.match(
    lobbyHero,
    /src=\{avatarUrlForUser\([\s\S]*?quality=\{95\}[\s\S]*?loading="lazy"[\s\S]*?fetchPriority="low"/,
  );
  assert.match(carousel, /preload\(currentHeroImageUrl, \{ as: "image", fetchPriority: "high" \}\)/);
  assert.match(renderer, /Pure-image takeovers already emit the exact responsive preload/);
  assert.match(renderer, /quality=\{95\}/);
  assert.match(eventHero, /quality=\{95\}/);
  assert.match(eventHero, /fetchPriority=\{priority \? "high" : "low"\}/);
});
