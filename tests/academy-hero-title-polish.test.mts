import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/academy/AcademyHero.tsx", "utf8");

test("Basic Academy title uses the restrained Marketplace title language", () => {
  assert.doesNotMatch(source, /Cinzel_Decorative/);
  assert.doesNotMatch(source, /academyWarTitleFont/);
  assert.match(source, /data-academy-basic-title/);
  assert.match(
    source,
    /market-display-title market-display-gold market-hero-title/,
  );
  assert.match(source, /AoE2WAR · The War College/);
});

test("Advanced and Extreme title art is reduced by ten percent", () => {
  assert.match(
    source,
    /h-\[7\.15rem\] w-\[min\(91%,27\.4rem\)\]/,
  );
  assert.match(source, /sm:h-\[8\.9rem\] sm:w-\[31\.4rem\]/);
  assert.match(source, /lg:h-\[9\.7rem\] lg:w-\[33rem\]/);
  assert.match(
    source,
    /sizes="\(max-width: 640px\) 84vw, \(max-width: 1024px\) 32rem, 34rem"/,
  );
});

test("Academy BAE behavior remains intact", () => {
  assert.match(source, /type AcademyHeroVariant = "a" \| "b" \| "e"/);
  assert.match(source, /const CYCLE_ORDER: AcademyHeroVariant\[\] = \["e", "b", "a"\]/);
  assert.match(source, /className="clan-bae-toggle"/);
  assert.match(source, /persistHeroVariant\(variant\.key, "toggle"\)/);
});
