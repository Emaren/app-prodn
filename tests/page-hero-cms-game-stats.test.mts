import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const media = read("lib/managedMediaAssets.ts");
const pageHeroes = read("lib/pageHeroes.ts");
const api = read("app/api/admin/page-heroes/route.ts");
const admin = read("app/admin/page-heroes/page.tsx");
const gameStats = read("app/game-stats/page.tsx");
const rotator = read("components/page-heroes/PageHeroRotator.tsx");
const heroService = read("lib/hero/service.ts");

test("Media Armory has a first-class Hero Images kind", () => {
  assert.match(media, /"avatar", "crest", "hero", "belt"/);
});

test("page hero chains reuse existing Hero persistence", () => {
  assert.match(pageHeroes, /page-hero-/);
  assert.match(pageHeroes, /heroPlaylist\.upsert/);
  assert.match(pageHeroes, /heroPlaylistItem\.create/);
  assert.match(pageHeroes, /heroScreen\.create/);
});

test("Page Hero Studio can assign, reorder, tune and remove Hero Images", () => {
  assert.match(api, /action === "assign"/);
  assert.match(api, /action === "settings"/);
  assert.match(api, /action === "update_item"/);
  assert.match(api, /action === "reorder"/);
  assert.match(api, /action === "remove"/);
  assert.match(admin, /Drag to reorder · tune each image/);
  assert.match(admin, /Media Armory owns the files/);
});

test("Parser Observatory has B A E views and a managed hero", () => {
  assert.match(gameStats, /normalizePageHeroView/);
  assert.match(gameStats, /loadPageHeroChain\("game-stats", view\)/);
  assert.match(gameStats, /data-game-stats-view=\{view\}/);
  assert.match(gameStats, /<GameStatsHero/);
  assert.match(gameStats, /view === "extreme"/);
  assert.match(gameStats, /view !== "basic"/);
});

test("managed hero is a passive crossfade with reduced-motion support", () => {
  assert.match(rotator, /transitionDurationMs/);
  assert.match(rotator, /prefers-reduced-motion/);
  assert.match(rotator, /new Image\(\)/);
  assert.doesNotMatch(rotator, /ArrowLeft|ArrowRight|showDots|showProgress/);
});

test("home Hero Studio does not ingest page-specific hero screens", () => {
  assert.match(heroService, /page-hero-/);
  assert.match(heroService, /startsWith/);
});
