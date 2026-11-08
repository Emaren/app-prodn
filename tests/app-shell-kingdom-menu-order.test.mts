import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("app/AppShell.tsx", "utf8");

test("General Inspections sits immediately above Speed and Speed closes the Kingdom menu", () => {
  const inspections = shell.indexOf('{ href: "/general-inspections", label: "General Inspections"');
  const speed = shell.indexOf('{ href: "/speed", label: "Speed"');
  const close = shell.indexOf("] as const;", speed);

  assert.ok(inspections >= 0);
  assert.ok(speed > inspections);
  assert.ok(close > speed);
  const nextHref = shell.indexOf('{ href:', speed + 1);
  assert.equal(shell.slice(inspections, speed).includes('href: "/speed"'), false);
  assert.ok(nextHref < 0 || nextHref >= close);
});


test("Kingdom dropdown preserves full historical catalog, source order and mobile parity", () => {
  const catalog = shell.match(/const KINGDOM_LINKS = \[([\s\S]*?)\] as const;/)?.[1];
  assert.ok(catalog, "Canonical Kingdom catalog missing");
  const hrefs = [...catalog.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length >= 35, "Kingdom navigation was accidentally shortened");
  assert.equal(new Set(hrefs).size, hrefs.length, "Duplicate destination in Kingdom dropdown");
  assert.deepEqual(hrefs.slice(0, 5),
    ["/kingdom", "/oracle", "/leaderboard", "/champions", "/kingdom-bettors"]);
  assert.deepEqual(hrefs.slice(-3),
    ["/statistics", "/general-inspections", "/speed"]);
  assert.match(shell, /\{KINGDOM_LINKS\.map\(\(item\) => \{/,
    "Render every destination in authoritative order without a collapsed filter");
  assert.doesNotMatch(shell, /KINGDOM_PRIMARY_HREFS|showMoreKingdom|Explore all Kingdom chambers/);
  assert.equal((shell.match(/<KingdomMenuPanel/g) ?? []).length, 2,
    "Both desktop and mobile must reuse the same complete panel");
});
