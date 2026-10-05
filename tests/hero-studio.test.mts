import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HERO_SCREEN_TYPES,
  HERO_TRANSITION_STYLES,
  isSafeHeroHref,
  normalizeHeroScreenConfig,
} from "../lib/hero/types.ts";
import {
  heroStudioPreviewKey,
  prependHeroItems,
  reorderHeroItem,
} from "../lib/hero/studioClient.ts";
import {
  arrangeHeroItemsForLanguage,
  filterHeroItemsByVisibility,
  heroScreenLanguageGroup,
  normalizeHeroHiddenLanguageByGroup,
} from "../lib/hero/languageVariants.ts";

test("Hero Studio exposes the initial trusted screen and transition registry", () => {
  assert.deepEqual(HERO_SCREEN_TYPES, [
    "featured_event",
    "chronicle_cover",
    "warrior_quote",
    "media_takeover",
  ]);
  assert.deepEqual(HERO_TRANSITION_STYLES, [
    "crossfade",
    "banner_wipe",
    "siege_push",
    "ember_dissolve",
    "cut",
  ]);
});

test("Hero links allow internal routes and safe HTTPS destinations only", () => {
  assert.equal(isSafeHeroHref("/forum/thread/dispatch"), true);
  assert.equal(isSafeHeroHref("https://aoe2war.com/forum"), true);
  assert.equal(isSafeHeroHref("//host.example/path"), false);
  assert.equal(isSafeHeroHref("javascript:alert(1)"), false);
  assert.equal(isSafeHeroHref("https://user:pass@example.com/private"), false);
});

test("Warrior Quote config clamps media opacity and fills the house defaults", () => {
  assert.deepEqual(
    normalizeHeroScreenConfig("warrior_quote", {
      quote: "  Hold the line.  ",
      overlayOpacity: 7,
      motionPreset: "embers",
    }),
    {
      eyebrow: "WARRIOR QUOTE OF THE DAY",
      quote: "Hold the line.",
      attribution: "AoE2WAR House Maxim",
      subline: "Hold the line. Read the map. Choose the moment.",
      motionPreset: "embers",
      theme: "stoic",
      backgroundImageUrl: "",
      mobileBackgroundImageUrl: "",
      videoUrl: "",
      posterUrl: "",
      overlayOpacity: 1,
      imageFit: "cover",
      pureImage: false,
      languageCode: "en",
      languageGroupKey: "",
    }
  );
});

test("Hero config rejects unsafe media paths", () => {
  assert.throws(
    () =>
      normalizeHeroScreenConfig("media_takeover", {
        videoUrl: "javascript:alert(1)",
      }),
    /Hero media must use/
  );
});

test("new Hero uploads prepend in file order and normalize every position", () => {
  const current = [
    { position: 0, screen: { id: 10 } },
    { position: 1, screen: { id: 20 } },
  ];
  const incoming = [
    { position: 99, screen: { id: 30 } },
    { position: 99, screen: { id: 40 } },
    { position: 99, screen: { id: 10 } },
  ];

  assert.deepEqual(
    prependHeroItems(current, incoming).map((item) => [
      item.screen.id,
      item.position,
    ]),
    [
      [30, 0],
      [40, 1],
      [10, 2],
      [20, 3],
    ]
  );
});

test("drag reorder follows stable screen identity instead of a stale index", () => {
  const items = [
    { position: 0, screen: { id: 10 } },
    { position: 1, screen: { id: 20 } },
    { position: 2, screen: { id: 30 } },
  ];

  assert.deepEqual(
    reorderHeroItem(items, 10, 2).map((item) => [
      item.screen.id,
      item.position,
    ]),
    [
      [20, 0],
      [30, 1],
      [10, 2],
    ]
  );
});

test("Hero arrow ordering wraps top and bottom instead of disabling the edge", () => {
  const items = [
    { position: 0, screen: { id: 10 } },
    { position: 1, screen: { id: 20 } },
    { position: 2, screen: { id: 30 } },
  ];

  assert.deepEqual(
    reorderHeroItem(items, 30, 3).map((item) => item.screen.id),
    [30, 10, 20]
  );
  assert.deepEqual(
    reorderHeroItem(items, 10, -1).map((item) => item.screen.id),
    [20, 30, 10]
  );
});

test("preview identity changes with fit, viewport, and media treatment", () => {
  const draft = {
    id: 42,
    type: "media_takeover" as const,
    mediaAssetId: 7,
    config: {
      backgroundImageUrl: "/hero.png",
      imageFit: "cover" as const,
      overlayOpacity: 0,
      pureImage: true,
    },
  };
  const coverDesktop = heroStudioPreviewKey(draft, "desktop");

  assert.notEqual(
    coverDesktop,
    heroStudioPreviewKey(
      { ...draft, config: { ...draft.config, imageFit: "contain" } },
      "desktop"
    )
  );
  assert.notEqual(coverDesktop, heroStudioPreviewKey(draft, "mobile"));
  assert.notEqual(
    coverDesktop,
    heroStudioPreviewKey(
      { ...draft, config: { ...draft.config, overlayOpacity: 0.45 } },
      "desktop"
    )
  );
  assert.notEqual(
    coverDesktop,
    heroStudioPreviewKey(
      {
        ...draft,
        config: { ...draft.config, backgroundImageUrl: "/hero-v2.png" },
      },
      "desktop"
    )
  );
});

test("explicit French and Spanish Hero variants follow English for that viewer only", () => {
  const item = (
    id: number,
    key: string,
    languageCode: "en" | "fr" | "es",
    languageGroupKey = ""
  ) =>
    ({
      id,
      position: id,
      enabled: true,
      startsAt: null,
      endsAt: null,
      durationMs: null,
      hrefOverride: "",
      href: "/",
      screen: {
        id,
        key,
        name: key,
        type: "media_takeover" as const,
        status: "published" as const,
        defaultHref: "/",
        ariaLabel: key,
        eventTileId: null,
        forumThreadId: null,
        mediaAssetId: null,
        config: { languageCode, languageGroupKey },
        createdAt: "",
        updatedAt: "",
        eventTile: null,
        forumThread: null,
        mediaAsset: null,
      },
    });

  const english = item(1, "chronicle-138", "en");
  const french = item(2, "chronicle-138-fr", "fr", "chronicle-138");
  const spanish = item(3, "chronicle-138-es", "es", "chronicle-138");
  const nextEnglish = item(4, "next-hero", "en");
  const chain = [french, nextEnglish, spanish, english];

  assert.deepEqual(
    arrangeHeroItemsForLanguage(chain, null).map((entry) => entry.screen.id),
    [4, 1]
  );
  assert.deepEqual(
    arrangeHeroItemsForLanguage(chain, "fr").map((entry) => entry.screen.id),
    [4, 1, 2]
  );
  assert.deepEqual(
    arrangeHeroItemsForLanguage(chain, "es").map((entry) => entry.screen.id),
    [4, 1, 3]
  );
  assert.equal(heroScreenLanguageGroup(french), "chronicle-138");
});

test("viewer can hide one language in a Hero pair and restore it persistently", () => {
  const raw = {
    version: 1,
    hiddenByGroup: {
      "chronicle-138": "en",
      "bad language": "xx",
    },
  };
  const normalized = normalizeHeroHiddenLanguageByGroup(raw);
  assert.deepEqual(normalized, { "chronicle-138": "en" });

  const pair = [
    {
      id: 1,
      position: 0,
      enabled: true,
      startsAt: null,
      endsAt: null,
      durationMs: null,
      hrefOverride: "",
      href: "/",
      screen: {
        id: 1,
        key: "chronicle-138",
        name: "English",
        type: "media_takeover" as const,
        status: "published" as const,
        defaultHref: "/",
        ariaLabel: "English",
        eventTileId: null,
        forumThreadId: null,
        mediaAssetId: null,
        config: { languageCode: "en" as const },
        createdAt: "",
        updatedAt: "",
        eventTile: null,
        forumThread: null,
        mediaAsset: null,
      },
    },
    {
      id: 2,
      position: 1,
      enabled: true,
      startsAt: null,
      endsAt: null,
      durationMs: null,
      hrefOverride: "",
      href: "/",
      screen: {
        id: 2,
        key: "chronicle-138-fr",
        name: "French",
        type: "media_takeover" as const,
        status: "published" as const,
        defaultHref: "/",
        ariaLabel: "French",
        eventTileId: null,
        forumThreadId: null,
        mediaAssetId: null,
        config: {
          languageCode: "fr" as const,
          languageGroupKey: "chronicle-138",
        },
        createdAt: "",
        updatedAt: "",
        eventTile: null,
        forumThread: null,
        mediaAsset: null,
      },
    },
  ];
  assert.deepEqual(
    filterHeroItemsByVisibility(pair, normalized).map((entry) => entry.screen.id),
    [2]
  );
});

test("Hero Studio preserves operator-selected transition timing", () => {
  const studio = readFileSync(
    new URL("../components/admin/hero/HeroStudio.tsx", import.meta.url),
    "utf8"
  );

  const pureSettingsStart = studio.indexOf("function purePlaylistSettings");
  const pureSettingsEnd = studio.indexOf("\n}\n", pureSettingsStart) + 2;
  const pureSettings = studio.slice(pureSettingsStart, pureSettingsEnd);

  assert.match(pureSettings, /\.\.\.settings/);
  assert.doesNotMatch(pureSettings, /transitionDurationMs:/);
  assert.doesNotMatch(pureSettings, /transitionStyle:/);
  assert.doesNotMatch(pureSettings, /2900/);
  assert.doesNotMatch(pureSettings, /1600/);
});

test("Hero Studio exposes explicit reorder and reactive preview contracts", () => {
  const studio = readFileSync(
    new URL("../components/admin/hero/HeroStudio.tsx", import.meta.url),
    "utf8"
  );

  assert.match(studio, /key=\{previewKey\}/);
  assert.match(studio, /key: target/);
  assert.match(studio, /prependHeroItems\(items, newItems\)/);
  assert.match(studio, /Click, hold, and drag to reorder/);
  assert.match(studio, /dataTransfer\.setData\([\s\S]*"text\/plain"/);
  assert.match(studio, /New uploads land at #1/);
  assert.match(studio, /bottom wraps to top/);
  assert.match(studio, /create_language_variant/);
  assert.match(studio, /Hero language/);
  assert.match(
    studio,
    /if \(selectedInChain\) \{[\s\S]*await saveScreen\(\)[\s\S]*await saveChain\(\)/
  );
});


test("Featured Event follows the single live EventTile without a manual Hero binding", () => {
  const service = readFileSync(
    new URL("../lib/hero/service.ts", import.meta.url),
    "utf8"
  );
  const actions = readFileSync(
    new URL("../lib/hero/actions.ts", import.meta.url),
    "utf8"
  );
  const studio = readFileSync(
    new URL("../components/admin/hero/HeroStudio.tsx", import.meta.url),
    "utf8"
  );

  assert.match(service, /isPublished: true/);
  assert.match(service, /isActive: true/);
  assert.match(service, /item\.screen\.type === "featured_event" \? activeEventTile : null/);
  assert.match(service, /item\.screen\.type === "featured_event"[\s\S]*eventTile\?\.ctaUrl \|\| "\/lobby"/);
  assert.doesNotMatch(actions, /Featured Event screens must reference an Event Studio tile/);
  assert.doesNotMatch(studio, /Event Studio tile/);
  assert.match(studio, /Automatic from Event Foundry/);
});
