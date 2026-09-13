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

test("Hero Studio exposes explicit reorder and reactive preview contracts", () => {
  const studio = readFileSync(
    new URL("../components/admin/hero/HeroStudio.tsx", import.meta.url),
    "utf8"
  );

  assert.match(studio, /key=\{previewKey\}/);
  assert.match(studio, /key: target/);
  assert.match(studio, /prependHeroItems\(current, newItems\)/);
  assert.match(studio, /title="Drag to reorder"/);
  assert.match(studio, /dataTransfer\.setData\([\s\S]*"text\/plain"/);
  assert.match(studio, /New uploads land at #1/);
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
