import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("home layout regressions stay fixed", () => {
  const shell = source("app/AppShell.tsx");
  const home = source("app/HomePageClient.tsx");

  assert.doesNotMatch(shell, /\$\{headerSkin\.surface\} -m[lr]-2/);
  assert.match(
    shell,
    /aoe2-nav-scroll[\s\S]{0,700}<KingdomNavItem[\s\S]{0,1800}HEADER_LINKS\.map[\s\S]{0,2200}<KingdomNavItem/,
  );

  assert.match(
    home,
    /const \[rightColumnElement, setRightColumnElement\] = useState<HTMLDivElement \| null>\(null\)/,
  );
  assert.match(home, /observer\.observe\(rightColumnElement\)/);
  assert.match(home, /ref=\{setRightColumnElement\}/);
  assert.match(home, /\}, \[rightColumnElement\]\);/);
});

test("lobby leaderboard honors curated featured avatars", () => {
  const hero = source("components/lobby/LobbyHero.tsx");

  assert.match(hero, /featuredAvatarThumbUrlForUser/);
  assert.match(
    hero,
    /entry\.hasFeaturedAvatar[\s\S]{0,260}featuredAvatarThumbUrlForUser\([\s\S]{0,220}entry\.featuredAvatarRevision/,
  );
});

test("AoE2 Shorts posters are allowed through Next image optimization", () => {
  const config = source("next.config.js");

  assert.match(
    config,
    /localPatterns:[\s\S]{0,500}\{ pathname: "\/shorts\/\*\*" \}/,
  );
});

test("legacy WOLO artwork is allowed through Next image optimization", () => {
  const config = source("next.config.js");
  const staking = source("app/staking/page.tsx");

  assert.match(
    config,
    /localPatterns:[\s\S]{0,600}\{ pathname: "\/legacy\/\*\*" \}/,
  );
  assert.match(staking, /const WOLO_LOGO_SRC = "\/legacy\/wolo-logo-transparent\.webp";/);
});

test("Kingdom and Oracle hero art is allowed through Next image optimization", () => {
  const config = source("next.config.js");
  const kingdom = source("app/kingdom/KingdomHero.tsx");
  const oracle = source("components/oracle/OraclePremiumFloor.tsx");

  assert.match(
    config,
    /localPatterns:[\s\S]{0,700}\{ pathname: "\/kingdom\/\*\*" \}/,
  );
  assert.match(
    config,
    /localPatterns:[\s\S]{0,700}\{ pathname: "\/oracle\/\*\*" \}/,
  );
  assert.match(kingdom, /src="\/kingdom\/kingdom-hero-bg\.webp"/);
  assert.match(oracle, /src="\/oracle\/oracle-hero-bg\.webp"/);
});
