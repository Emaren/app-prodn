import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("the Betting Hall hero remains shared by all three views", async () => {
  const page = await source("app/bets/page.tsx");
  const heroIndex = page.indexOf("<BettingHallImageHero />");
  const branchIndex = page.indexOf('{betsView === "basic"');

  assert.ok(heroIndex >= 0, "shared Betting Hall hero is missing");
  assert.ok(
    branchIndex > heroIndex,
    "hero must render before the B/A/E branch",
  );
});

test("B merges the heritage surfaces, A preserves former E, and E owns the new cockpit", async () => {
  const page = await source("app/bets/page.tsx");
  const basicStart = page.indexOf('{betsView === "basic"');
  const advancedStart = page.indexOf('betsView === "advanced"', basicStart);
  const extremeStart = page.indexOf("<ExtremeCommandHeader", advancedStart);
  const basic = page.slice(basicStart, advancedStart);
  const advanced = page.slice(advancedStart, extremeStart);
  const extreme = page.slice(
    extremeStart,
    page.indexOf("<FounderBonusModal", extremeStart),
  );

  for (const surface of [
    "RecentBetsSection",
    "YourBookSection",
    "OpenBooksSection",
    "AwaitingProofSection",
    "SettledSection",
    "PayoutQueueSection",
    "ResolutionQueueSection",
    "BoardPulseSection",
    "HeatSection",
  ]) {
    assert.match(
      basic,
      new RegExp(`<${surface}\\b`),
      `Basic is missing ${surface}`,
    );
  }

  assert.match(advanced, /advanced-heritage-betting-hall/);
  assert.match(advanced, /advanced-heritage-featured-market/);
  assert.match(extreme, /extreme-next-arena/);
  assert.match(page, /extreme-next-command-header/);
  assert.match(page, /live-battle-deck/);
  assert.match(page, /useState<BetsViewMode>\("extreme"\)/);
  assert.match(page, /betsView\.v4/);
});

test("E is the reset default and the removed promotional copy stays absent", async () => {
  const page = await source("app/bets/page.tsx");

  assert.match(page, /useState<BetsViewMode>\("extreme"\)/);
  assert.match(page, /aoe2hdbets\.betsView\.v4/);
  assert.doesNotMatch(page, /See the battle\./);
  assert.doesNotMatch(page, /Take your side\./);
  assert.doesNotMatch(page, /Every live game stays visible\./);
  assert.doesNotMatch(page, /Pick\. Sign\. Watch\./);
  assert.doesNotMatch(page, /Every war\. One tap away\./);
  assert.doesNotMatch(page, /New battles rise to the front/);
});

test("WOLO suffix explicitly targets the custom stake input", async () => {
  const page = await source("app/bets/page.tsx");

  assert.match(page, /const generatedInputId = useId\(\)/);
  assert.match(page, /id=\{stakeInputId\}/);
  assert.match(page, /htmlFor=\{stakeInputId\}/);
  assert.match(page, /cursor-text select-none/);
});

test("Founder quick defaults are two per participant and one thousand to the winner", async () => {
  const page = await source("app/bets/page.tsx");

  assert.match(page, /return String\(count \* 2\)/);
  assert.match(page, /Founders Bonus · 2 each/);
  assert.match(page, /Founders Win · 1,000/);
  assert.match(page, /: "1000"/);
});

test("concurrent games sort newest-first without automatic focus replacement", async () => {
  const page = await source("app/bets/page.tsx");

  assert.match(page, /rightNumber - leftNumber/);
  assert.match(page, /setFocusedMarketId\(orderedBookMarkets\[0\]\.id\)/);
  assert.match(page, /if \(focusedMarketId !== null\) return/);
  assert.match(page, /Your current ticket stayed in focus/);
});
