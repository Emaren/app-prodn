import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { nextHomeThemeKey } from "../lib/homeThemeCycle.ts";
import { NOVEMBER_2026_CAMPAIGN, isApprovedNovemberCampaignTransition } from "../lib/novemberThemeCampaign.ts";
import { tickerTravelSeconds } from "../lib/lobbyTickerMotion.ts";
import { nextHeroRequestedIndex } from "../lib/hero/manualNavigation.ts";
import { homeChronicleHeadline, isWatcherExplainerStory } from "../lib/hero/watcherStory.ts";
import { resolveEffectiveSiteThemeKey, type SiteThemeCampaignControl } from "../lib/siteThemeCampaign.ts";

const source = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("home logo cycles November crimson -> default blue -> October black -> November", () => {
  assert.equal(nextHomeThemeKey("crimson"), "midnight");
  assert.equal(nextHomeThemeKey("midnight"), "black");
  assert.equal(nextHomeThemeKey("black"), "crimson");
});

test("profile-only colors are not deleted and logo begins at crimson", () => {
  for (const color of ["grey", "white", "sepia", "walnut"] as const) {
    assert.equal(nextHomeThemeKey(color), "crimson");
  }
});

test("November campaign uses the existing priority rail and does not rewrite preference", () => {
  const november: SiteThemeCampaignControl = {
    campaignKey: "november-crimson-2026",
    label: "November Ember Reign 2026",
    enabled: true,
    themeKey: "crimson",
    startsAt: "2026-11-01T06:00:00.000Z",
    endsAt: "2026-12-01T07:00:00.000Z",
    active: true,
    excludedPaths: ["/academy", "/statistics", "/traffic", "/speed"],
  };
  assert.equal(resolveEffectiveSiteThemeKey({preferredThemeKey:"midnight", campaign:november, pathname:"/"}), "crimson");
  assert.equal(resolveEffectiveSiteThemeKey({preferredThemeKey:"sepia", overrideThemeKey:"midnight", campaign:november, pathname:"/"}), "midnight");
  assert.equal(resolveEffectiveSiteThemeKey({preferredThemeKey:"sepia", campaign:{...november,active:false}, pathname:"/"}), "sepia");
});

test("both header logo links retain home navigation off homepage", () => {
  const shell = source("app/AppShell.tsx");
  assert.equal((shell.match(/onClick=\{handleHomeBrandClick\}/g) || []).length, 2);
  assert.match(shell, /pathname !== "\/"/);
  assert.match(shell, /isModifiedHeaderNavClick\(event\)/);
  assert.match(shell, /event\.preventDefault\(\)/);
  assert.match(shell, /setThemeKey\(nextTheme\)/);
  assert.match(shell, /prefers-reduced-motion: reduce/);
});

test("campaign morph is controlled and honors reduced motion", () => {
  const css = source("app/globals.css");
  assert.match(css, /aoe2war-home-theme-morph::view-transition-old/);
  assert.match(css, /aoe2war-home-theme-morph::view-transition-new/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("November crimson gradient is richer without replacing other saved theme keys", () => {
  const theme = source("components/lobby/lobbyPresentation.ts");
  assert.match(theme, /November.s Ember Reign/);
  assert.match(theme, /key: "crimson"/);
  assert.match(theme, /key: "midnight"/);
  assert.match(theme, /key: "black"/);
});

test("ticker maintains constant physical pace with reasonable caps", () => {
  assert.equal(tickerTravelSeconds(0), 26);
  assert.equal(tickerTravelSeconds(500), 14);
  assert.equal(tickerTravelSeconds(2580), 30);
  assert.equal(tickerTravelSeconds(99999), 72);
});

test("ticker has two equal content copies and no outer unequal padding seam", () => {
  const ticker = source("components/lobby/LiveTickerStrip.tsx");
  assert.match(ticker, /\[0, 1\]\.map\(\(copy\)/);
  assert.match(ticker, /className="flex shrink-0 items-center gap-8 pr-8"/);
  assert.match(ticker, /translateX\(-50%\)/);
  assert.doesNotMatch(ticker, /lobby-ticker-track flex w-max items-center gap-8 pr-8/);
  assert.match(ticker, /ResizeObserver/);
});

test("manual hero cursor can skip three images rapidly before any decode completes", () => {
  let target = 0;
  for (let i = 0; i < 3; i++) target = nextHeroRequestedIndex(target, 1, 8);
  assert.equal(target, 3);
  assert.equal(nextHeroRequestedIndex(target, -1, 8), 2);
  assert.equal(nextHeroRequestedIndex(0, -1, 8), 7);
});

test("manual hero cursor gracefully handles empty and one-slide carousels", () => {
  assert.equal(nextHeroRequestedIndex(0, 1, 0), 0);
  assert.equal(nextHeroRequestedIndex(0, -1, 1), 0);
  assert.equal(nextHeroRequestedIndex(Number.NaN, 1, 4), 1);
});

test("manual hero requests supersede stale image decodes rather than locking clicks", () => {
  const carousel = source("components/hero/HeroCarousel.tsx");
  assert.match(carousel, /manual = false/);
  assert.match(carousel, /!manual && transitionLocked\.current/);
  assert.match(carousel, /requestedIndexRef\.current = nextIndex/);
  assert.match(carousel, /requestId !== requestIdRef\.current/);
  assert.match(carousel, /pendingMove\.requestId !== requestIdRef\.current/);
  assert.match(carousel, /move\(-1, true\)/);
  assert.match(carousel, /move\(1, true\)/);
});

test("Zodiac gets the only special zoom-out; all other leaderboard images keep cover", () => {
  const hero = source("components/lobby/LobbyHero.tsx");
  assert.match(hero, /featuredName\.trim\(\)\.toLowerCase\(\) === "zodiac"/);
  assert.match(hero, /xl:scale-\[0\.87\]/);
  assert.match(hero, /xl:object-cover"/);
});

test("watcher explainer heading is quieter and action-oriented", () => {
  assert.equal(homeChronicleHeadline("Why Watchers Matter"), "Run a Watcher. Track Your Stats.");
  assert.equal(homeChronicleHeadline("World Championship"), "World Championship");
  assert.ok(isWatcherExplainerStory(" WHY WATCHERS MATTER "));
  assert.equal(isWatcherExplainerStory("Breaking news"), false);
  const renderer = source("components/hero/HeroScreenRenderer.tsx");
  assert.match(renderer, /text-\[clamp\(1\.9rem,3\.1vw,3\.3rem\)\]/);
  assert.match(renderer, /displayTitle/);
});

test("November campaign has separate bounded key/window, October overrides cannot leak", () => {
  assert.equal(NOVEMBER_2026_CAMPAIGN.campaignKey, "november-crimson-2026");
  assert.equal(NOVEMBER_2026_CAMPAIGN.themeKey, "crimson");
  assert.equal(NOVEMBER_2026_CAMPAIGN.startsAt, "2026-11-01T06:00:00.000Z");
  assert.equal(NOVEMBER_2026_CAMPAIGN.endsAt, "2026-12-01T07:00:00.000Z");
  assert.ok(isApprovedNovemberCampaignTransition("october-black-2026", NOVEMBER_2026_CAMPAIGN.campaignKey));
  assert.ok(isApprovedNovemberCampaignTransition("november-crimson-2026", NOVEMBER_2026_CAMPAIGN.campaignKey));
  for (const key of ["october-black-2026", "december-blue-2026", "", null]) {
    assert.equal(isApprovedNovemberCampaignTransition("november-crimson-2026", key), false);
  }
});

test("only admin can activate new campaign, and client profile overrides stay separate", () => {
  const route = source("app/api/admin/site-theme-campaign/route.ts");
  const panel = source("components/admin/command-tower/SiteThemeCampaignPanel.tsx");
  assert.match(route, /const gate = await requireAdmin\(request\)/);
  assert.match(route, /isApprovedNovemberCampaignTransition/);
  assert.match(route, /campaignKey: November.campaignKey/);
  assert.match(route, /updatedByUserId: gate.user.id/);
  assert.match(panel, /Activate November Red/);
  assert.match(panel, /campaignKey: NOVEMBER_2026_CAMPAIGN.campaignKey/);
  assert.doesNotMatch(route, /deleteMany\(/);
});
