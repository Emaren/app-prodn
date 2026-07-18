import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HERO_SCREEN_TYPES,
  HERO_TRANSITION_STYLES,
  isSafeHeroHref,
  normalizeHeroScreenConfig,
} from "../lib/hero/types.ts";

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
