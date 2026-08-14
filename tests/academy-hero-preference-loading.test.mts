import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../app/academy/AcademyHero.tsx", import.meta.url),
  "utf8",
);

const pageSource = fs.readFileSync(
  new URL("../app/academy/page.tsx", import.meta.url),
  "utf8",
);

test(
  "Academy keeps the default hero in the critical discovery lane",
  () => {
    assert.match(
      source,
      /preload\(ACADEMY_HERO_E_BG_IMAGE,\s*\{[\s\S]*?fetchPriority:\s*"high"/,
    );
  },
);

test(
  "Academy warms the actually selected A or B artwork before revealing it",
  () => {
    assert.match(
      source,
      /function academyHeroBackgroundImage/,
    );

    assert.match(
      source,
      /variant === "e"[\s\S]*ACADEMY_HERO_E_BG_IMAGE[\s\S]*ACADEMY_HERO_BG_IMAGE/,
    );

    assert.match(
      source,
      /image\.fetchPriority = "high"/,
    );

    assert.match(
      source,
      /localStorage\.getItem\(\s*ACADEMY_HERO_STORAGE_KEY/,
    );

    assert.match(
      source,
      /warmAcademyHeroBackground\(nextVariant\)\.then\([\s\S]*setHeroVariant\(nextVariant\)/,
    );
  },
);

test(
  "Academy no longer switches account preference directly onto an unloaded background",
  () => {
    assert.doesNotMatch(
      source,
      /setHeroVariant\(TILE_VIEW_TO_ACADEMY_HERO\[accountView\]\)/,
    );
  },
);

test(
  "Academy hero streams without waiting for the lower-page advisor profile",
  () => {
    assert.match(
      pageSource,
      /import \{ Suspense \} from "react"/,
    );

    assert.match(
      pageSource,
      /async function AcademyAdvisors\(\)[\s\S]*await loadZodiacCard\(\)/,
    );

    assert.match(
      pageSource,
      /<Suspense fallback=\{<AcademyAdvisorsFallback \/>\}>/,
    );

    assert.match(
      pageSource,
      /export default function AcademyPage\(\)/,
    );

    assert.doesNotMatch(
      pageSource,
      /export default async function AcademyPage/,
    );
  },
);
