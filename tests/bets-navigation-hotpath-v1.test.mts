import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Bets private board warm is one-shot, no-store, and shorter than poll cadence", () => {
  const helper = source("lib/betsNavigationWarmup.ts");

  assert.match(helper, /BETS_BOARD_WARM_MAX_AGE_MS = 4_500/);
  assert.match(helper, /fetch\("\/api\/bets", \{[\s\S]*cache: "no-store"[\s\S]*credentials: "same-origin"/);
  assert.match(helper, /warmBoardRecord\.authKey === authKey/);
  assert.match(helper, /const record = warmBoardRecord;[\s\S]*warmBoardRecord = null;/);
  assert.match(helper, /!record \|\| record\.authKey !== authKey/);
  assert.match(helper, /Date\.now\(\) - record\.resolvedAt > BETS_BOARD_WARM_MAX_AGE_MS/);
});

test("Bets is warmed on bounded idle and direct navigation intent", () => {
  const shell = source("app/AppShell.tsx");

  assert.match(shell, /betsIdleWarmRef = React\.useRef\(false\)/);
  assert.match(shell, /pathname === "\/bets"[\s\S]*connection\?\.saveData[\s\S]*\/\(\^\|-\)2g\$\//);
  assert.match(shell, /href === "\/bets"[\s\S]*warmBetsBoard\(uid\)/);
  assert.match(shell, /betsIdleWarmRef\.current = false;[\s\S]*\}, \[uid\]\)/);
  assert.match(shell, /router\.prefetch\("\/players"\);[\s\S]*queueMicrotask\(warmBetsNavigation\)/);
  const idleWarmBody = shell.match(/const warmBetsNavigation = \(\) => \{([\s\S]*?)\n    \};/)?.[1] ?? "";
  assert.match(idleWarmBody, /warmBetsBoard\(uid\)/);
  assert.match(idleWarmBody, /setTimeout\(\(\) => \{[\s\S]*router\.prefetch\("\/bets"\);[\s\S]*\}, 500\)/);
  assert.doesNotMatch(idleWarmBody, /warmBetsClient/);
});


test("Bets client code warms through one cached dynamic import", () => {
  const helper = source("lib/betsClientWarmup.ts");
  const shell = source("app/AppShell.tsx");

  assert.match(helper, /betsClientWarmPromise \?\?= import\("@\/app\/bets\/page"\)/);
  const intentWarmMatches = shell.match(/warmBetsClient\(\)\.catch\(\(\) => undefined\)/g) ?? [];
  assert.ok(intentWarmMatches.length >= 3);
});

test("Bets consumes warmed board only on the first board load", () => {
  const page = source("app/bets/page.tsx");

  assert.match(page, /initialBoardLoadRef = useRef\(true\)/);
  assert.match(page, /isInitialBoardLoad = initialBoardLoadRef\.current;[\s\S]*initialBoardLoadRef\.current = false;/);
  assert.match(page, /consumeWarmBetsBoard\(uid\)[\s\S]*return warmedBoard as BetBoardSnapshot/);
  assert.match(page, /fetch\("\/api\/bets", \{[\s\S]*cache: "no-store"/);
  assert.match(page, /setInterval\([\s\S]*BETS_POLL_INTERVAL_MS/);
});

test("Player Registry remains the only automatic header-pill route prefetch", () => {
  const shell = source("app/AppShell.tsx");
  assert.match(shell, /prefetch=\{href === "\/players"\}/);
  assert.doesNotMatch(shell, /prefetch=\{href === "\/bets"/);
});
