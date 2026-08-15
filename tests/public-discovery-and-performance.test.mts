import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import robots from "../app/robots.ts";
import sitemap from "../app/sitemap.ts";

test("the public sitemap is canonical, unique, and excludes private surfaces", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  assert.equal(entries.length, 35);
  assert.equal(new Set(urls).size, entries.length);
  assert.ok(urls.every((url) => url.startsWith("https://aoe2war.com")));
  assert.ok(urls.includes("https://aoe2war.com"));
  assert.ok(urls.includes("https://aoe2war.com/rivalries"));
  assert.ok(!urls.some((url) => /\/(?:admin|api|profile|settings|wallet)(?:\/|$)/.test(url)));
});

test("robots advertises the sitemap and keeps private rails out of search", () => {
  const policy = robots();
  const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
  const disallowed = rules.flatMap((rule) =>
    Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : []
  );

  assert.equal(policy.sitemap, "https://aoe2war.com/sitemap.xml");
  assert.ok(disallowed.includes("/admin/"));
  assert.ok(disallowed.includes("/api/"));
  assert.ok(disallowed.includes("/wallet"));
});

test("critical performance safeguards stay wired into the public surfaces", () => {
  const home = readFileSync(new URL("../app/HomePageClient.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  const rivalries = readFileSync(new URL("../app/rivalries/page.tsx", import.meta.url), "utf8");
  const earners = readFileSync(
    new URL("../components/lobby/TopWoloEarnersTile.tsx", import.meta.url),
    "utf8"
  );
  const playerFeed = readFileSync(
    new URL("../components/players/PlayerMatchFeedClient.tsx", import.meta.url),
    "utf8"
  );
  const playerAi = readFileSync(
    new URL("../components/players/PlayerAiFeature.tsx", import.meta.url),
    "utf8"
  );
  const ogBoard = readFileSync(
    new URL("../components/leaderboard/OgBoardPage.tsx", import.meta.url),
    "utf8"
  );
  const modernLeaderboard = readFileSync(
    new URL("../components/leaderboard/ModernLeaderboardPage.tsx", import.meta.url),
    "utf8"
  );
  const nextConfig = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
  const warChest = readFileSync(new URL("../lib/warChest.ts", import.meta.url), "utf8");

  assert.doesNotMatch(home, /homepageHydrated/);
  assert.doesNotMatch(home, /image\.loading = "eager"[\s\S]{0,900}for \(const warrior of pool\)/);
  assert.match(shell, /fetch\("\/api\/header-summary"/);
  assert.doesNotMatch(shell, /fetch\("\/api\/(?:live-games|requests|workshop)\?summary=1"/);
  assert.match(rivalries, /const RIVALRIES_PER_PAGE = 72/);
  assert.match(earners, /\$\{Math\.max\(totalParticipants, entries\.length\)\} earners/);
  assert.doesNotMatch(earners, /\$\{[^}]+\}\s*\/\s*\$\{[^}]+\}\s*earners/);
  assert.match(playerFeed, /distanceFromBottom < 1600/);
  assert.match(playerFeed, /rootMargin: "1600px 0px"/);
  assert.match(playerFeed, /\[content-visibility:auto\]/);
  assert.match(ogBoard, /rootMargin: "1800px 0px"/);
  assert.ok(modernLeaderboard.includes("const RESET_PAGE_SIZE = 50;"));
  assert.ok(modernLeaderboard.includes("const SCROLL_PAGE_SIZE = 150;"));
  assert.match(
    modernLeaderboard,
    /const requestedLimit =[\s\S]*limitOverride \?\?[\s\S]*RESET_PAGE_SIZE[\s\S]*SCROLL_PAGE_SIZE/,
  );
  assert.match(
    modernLeaderboard,
    /Math\.min\(\s*600,/,
  );
  assert.ok(
    modernLeaderboard.includes(
      "limit: String(requestedLimit),"
    )
  );
  assert.ok(modernLeaderboard.includes('rootMargin: "8000px 0px"'));
  assert.doesNotMatch(playerAi, /setInterval\(markHeroSurfaces/);
  assert.match(nextConfig, /\$\{directory\}\/:path\*\.:ext\(\$\{publicMediaExtensions\}\)/);
  assert.doesNotMatch(nextConfig, /\$\{directory\}\/:path\+/);
  assert.match(nextConfig, /explicitPublicMediaSources/);
  assert.match(nextConfig, /\/watch\/:collection\(previews\|recordings\)/);
  assert.match(warChest, /ensureMarkets: false/);
  assert.match(warChest, /settlementSurfaceMode: "fast"/);
});
