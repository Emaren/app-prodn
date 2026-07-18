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
  const rivalries = readFileSync(new URL("../app/rivalries/page.tsx", import.meta.url), "utf8");
  const warChest = readFileSync(new URL("../lib/warChest.ts", import.meta.url), "utf8");

  assert.doesNotMatch(home, /homepageHydrated/);
  assert.doesNotMatch(home, /image\.loading = "eager"[\s\S]{0,900}for \(const warrior of pool\)/);
  assert.match(rivalries, /const RIVALRIES_PER_PAGE = 72/);
  assert.match(warChest, /ensureMarkets: false/);
  assert.match(warChest, /settlementSurfaceMode: "fast"/);
});
