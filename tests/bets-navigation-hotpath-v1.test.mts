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

test("Bets warms only on direct navigation intent, never unrelated page mount", () => {
  const shell = source("app/AppShell.tsx");

  assert.doesNotMatch(shell, /betsIdleWarmRef/);
  assert.doesNotMatch(shell, /warmBetsNavigation/);
  assert.doesNotMatch(shell, /router\.prefetch\("\/bets"\)/);
  assert.doesNotMatch(shell, /betsRouteTimer/);
  // Three deliberate interactions with the Bets link; none on generic app load.
  const intentWarmMatches = shell.match(/void warmBetsBoard\(uid\);/g) ?? [];
  assert.equal(intentWarmMatches.length, 3);
  for (const intent of ["onMouseEnter", "onFocus", "onPointerDown"]) {
    const from = shell.indexOf(intent + "={() => {");
    assert.ok(from >= 0, intent + " handler exists");
    const guard = shell.indexOf('if (href === "/bets")', from);
    const warm = shell.indexOf("void warmBetsBoard(uid);", guard);
    assert.ok(guard > from && guard - from < 200, intent + " is guarded by href");
    assert.ok(warm > guard && warm - guard < 240, intent + " owns warmup");
  }
  // Players retains independent prefetch; the user-initiated Bets link remains usable.
  assert.match(shell, /prefetch=\{href === "\/players"\}/);
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
