import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

test("homepage and lobby create a new server seed per dynamic request", () => {
  for (const path of ["app/page.tsx", "app/lobby/page.tsx"]) {
    const code = read(path);
    assert.match(code, /export const dynamic = "force-dynamic"/);
    assert.match(code, /import \{ randomInt \} from "node:crypto"/);
    assert.match(code, /initialWarriorSeed=\{randomInt\(0, 0x1_0000_0000\)\}/);
    assert.match(code, /<HomePageClient/);
  }
  const home = read("app/HomePageClient.tsx");
  assert.match(home, /initialWarriorSeed: number/);
  assert.match(home, /curatedFeaturedWarriorOpening\(pool, true, openingSeed\)/);
  assert.match(home, /const random = openingSeed === undefined \? Math\.random : createOpeningWarriorRandom\(openingSeed\)/);
  assert.match(home, /shuffleFeaturedWarriors\(realAvatarPool, random\)/);
  assert.match(home, /shuffleFeaturedWarriors\(lineup, random\)/);
  assert.match(home, /openingSeed=\{initialWarriorSeed\}/);
  assert.doesNotMatch(home, /curatedFeaturedWarriorOpening\(pool, false\)/);
});

test("seeded opening selection is replayable for hydration but varies across requests", () => {
  const home = read("app/HomePageClient.tsx");
  const match = home.match(/function createOpeningWarriorRandom\(seed: number\) \{[\s\S]*?\n\}\n\nfunction shuffleFeaturedWarriors/);
  assert.ok(match, "opening PRNG must be in client source");
  const evaluator = match[0].replace("seed: number", "seed").replace(/\n\nfunction shuffleFeaturedWarriors$/, "");
  const seeded = vm.runInNewContext(evaluator + "\ncreateOpeningWarriorRandom", {});
  const take = (seed: number) => Array.from({ length: 18 }, () => seeded(seed)());
  // Independently advance the PRNGs, rather than resetting the generator each draw.
  const draws = (seed: number) => {
    const next = seeded(seed);
    return Array.from({ length: 18 }, () => next());
  };
  const first = draws(1001);
  assert.deepEqual(first, draws(1001));
  assert.notDeepEqual(first, draws(1002));
  assert.ok(first.every((n: number) => Number.isFinite(n) && n >= 0 && n < 1));
  assert.equal(take(123).length, 18);
});

test("failed featured images use versioned public paths and a safe fallback", () => {
  const home = read("app/HomePageClient.tsx");
  const avatars = read("lib/avatarAssets.ts");
  assert.match(home, /function versionFeaturedWarriorImageUrl\(src: string\)/);
  assert.match(home, /FEATURED_AVATAR_EDGE_REVISION/);
  assert.match(home, /edgev=\$\{FEATURED_AVATAR_EDGE_REVISION\}/);
  assert.doesNotMatch(home, /20261103-featured-1/);
  assert.match(home, /onError=\{\(\) => replaceFailedImage\(layer, layerSrc\)\}/);
  assert.match(home, /UNKNOWN_FEATURED_WARRIOR_IMAGE/);
  assert.match(home, /pendingSrcRef\.current = fallback/);
  assert.match(avatars, /export const FEATURED_AVATAR_EDGE_REVISION = "20261108-r25-media-access-1"/);
  assert.match(avatars, /"edgev",\s*FEATURED_AVATAR_EDGE_REVISION/);
  assert.doesNotMatch(avatars, /20261103-featured-1/);
});
