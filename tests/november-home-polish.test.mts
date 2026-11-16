import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { nextHomeThemeKey } from "../lib/homeThemeCycle.ts";
import { NOVEMBER_2026_CAMPAIGN, isApprovedNovemberCampaignTransition } from "../lib/novemberThemeCampaign.ts";
import { featuredWarriorHonorLabel, verifiedFeaturedHonorsFallback } from "../lib/featuredWarriorPresentation.ts";
import { nextHeroRequestedIndex } from "../lib/hero/manualNavigation.ts";
import { homeChronicleHeadline, isWatcherExplainerStory } from "../lib/hero/watcherStory.ts";
import { resolveEffectiveSiteThemeKey, loadSiteThemeCampaignViewerState, type SiteThemeCampaignControl } from "../lib/siteThemeCampaign.ts";
import { featuredWarriorVisibleHonors } from "../lib/featuredWarriorPresentation.ts";

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

test("main ticker restores the exact pre-November 34-second linear loop, without speed remeasurement", () => {
  const ticker = source("components/lobby/LiveTickerStrip.tsx");
  assert.match(ticker, /animation: lobbyTickerScroll 34s linear infinite;/);
  assert.match(ticker, /const loopItems = \[\.\.\.items, \.\.\.items\];/);
  assert.match(ticker, /translateX\(-50%\)/);
  assert.match(ticker, /lobby-ticker-track flex w-max items-center gap-8 pr-8/);
  assert.doesNotMatch(ticker, /ResizeObserver|tickerTravelSeconds|animationDuration/);
  assert.match(ticker, /animation-play-state: paused/);
  assert.match(ticker, /prefers-reduced-motion: reduce/);
});

test("authenticated campaign reader uses only reviewed C03 override columns", async () => {
  const sqlCalls: Array<{ sql: string; values: unknown[] }> = [];
  const fakeDb = {
    siteThemeCampaign: {
      findUnique: async () => ({
        campaignKey: "november-crimson-2026", label: "November Ember Reign 2026",
        enabled: true, themeKey: "crimson",
        startsAt: new Date("2026-11-01T06:00:00Z"),
        endsAt: new Date("2026-12-01T07:00:00Z"),
      }),
    },
    userThemeCampaignOverride: {
      findUnique: () => { throw new Error("DENIED_UNSCOPED_PRISMA_FIND_UNIQUE"); },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push({ sql: strings.join("?"), values });
      return [] as Array<{ theme_key: string }>;
    },
  };
  const db = fakeDb as unknown as Parameters<typeof loadSiteThemeCampaignViewerState>[0];
  const now = new Date("2026-11-16T19:00:00Z");
  const result = await loadSiteThemeCampaignViewerState(db, 23, now);
  assert.equal(result.campaign?.active, true);
  assert.equal(result.campaign?.themeKey, "crimson");
  assert.equal(result.overrideThemeKey, null);
  assert.equal(sqlCalls.length, 1);
  assert.match(sqlCalls[0]!.sql, /SELECT theme_key\s+FROM public\.user_theme_campaign_overrides/);
  assert.match(sqlCalls[0]!.sql, /WHERE campaign_key = \? AND user_id = \?/);
  assert.doesNotMatch(sqlCalls[0]!.sql, /SELECT \*|JOIN|UPDATE|DELETE|INSERT/i);
  assert.deepEqual(sqlCalls[0]!.values, ["november-crimson-2026", 23]);
  fakeDb.$queryRaw = async () => [{ theme_key: "midnight" }];
  const optedOut = await loadSiteThemeCampaignViewerState(db, 23, now);
  assert.equal(optedOut.overrideThemeKey, "midnight");
});

test("French/American champions are correctly labeled and verified fallbacks expire", () => {
  assert.equal(featuredWarriorHonorLabel("france_champion_belt", "France Champion"), "French Champion");
  assert.equal(featuredWarriorHonorLabel("usa_champion_belt", "USA Champion"), "American Champion");
  const jim = verifiedFeaturedHonorsFallback(
    "u_0df73bdbb64646c19e4a9bfd225b3285", "Jim",
    new Date("2026-11-16T19:00:00Z"));
  const tekki = verifiedFeaturedHonorsFallback(
    "u_3379d1d2360d4c05ac88796ba7eda15c", "Tekki",
    new Date("2026-11-16T19:00:00Z"));
  assert.deepEqual(jim, [
    "American Champion", "Chaos Champion", "DM Veteran Championship", "RM Rising Championship",
  ]);
  assert.deepEqual(tekki, ["French Champion", "RM Challenger Championship"]);
  assert.deepEqual(verifiedFeaturedHonorsFallback("bad", "Jim", new Date("2026-11-16T19:00:00Z")), []);
  assert.deepEqual(verifiedFeaturedHonorsFallback("u_3379d1d2360d4c05ac88796ba7eda15c", "Jim", new Date("2026-11-16T19:00:00Z")), []);
  assert.deepEqual(verifiedFeaturedHonorsFallback("u_3379d1d2360d4c05ac88796ba7eda15c", "Tekki", new Date("2026-11-24T00:00:00Z")), []);
  assert.deepEqual(featuredWarriorVisibleHonors(["a", "b", "c", "d", "e"]), {
    visible: ["a", "b", "c", "d", "e"], remaining: 0,
  });
  assert.deepEqual(featuredWarriorVisibleHonors(["a", "b", "c", "d", "e", "f"]), {
    visible: ["a", "b", "c", "d"], remaining: 2,
  });
  const main = source("app/HomePageClient.tsx");
  assert.match(main, /featuredWarriorVisibleHonors\(honorTitles\)/);
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

test("Zodiac is a close full-height cover portrait, only six percent smaller than RM", () => {
  const hero = source("components/lobby/LobbyHero.tsx");
  assert.match(hero, /featuredName\.trim\(\)\.toLowerCase\(\) === "zodiac"/);
  assert.match(hero, /object-cover object-center opacity-100/);
  assert.match(hero, /xl:scale-\[0\.94\]/);
  assert.doesNotMatch(hero, /xl:scale-\[0\.87\]/);
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
  assert.match(route, /body.campaignKey === NOVEMBER_2026_CAMPAIGN.campaignKey/);
  assert.match(route, /callAppearanceWriter\("admin", signedSession, action\)/);
  assert.match(route, /validateAppearanceWriteOrigin\(request\)/);
  const core = source("lib/appearanceWriterCore.mjs");
  assert.match(core, /APPEARANCE_CAMPAIGN.previousKey/);
  assert.match(core, /WHERE slot = 1 AND campaign_key = \$7/);
  assert.match(core, /is_admin FROM public.users WHERE uid = \$1/);
  assert.doesNotMatch(route, /\.siteThemeCampaign\.update\(/);
  assert.match(panel, /Activate November Red/);
  assert.match(panel, /campaignKey: NOVEMBER_2026_CAMPAIGN.campaignKey/);
  assert.doesNotMatch(route, /deleteMany\(/);
});
