import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("opening the Kingdom menu primes the Leaderboard before click", () => {
  const shell = source("app/AppShell.tsx");

  assert.match(shell, /const router = useRouter\(\);[\s\S]*const openMenu = React\.useCallback\(\(\) => \{[\s\S]*router\.prefetch\("\/leaderboard"\);[\s\S]*setOpen\(true\);/);
  assert.match(shell, /prefetch=\{item\.href === "\/leaderboard"\}/);
  assert.match(shell, /onMouseEnter=\{\(\) => router\.prefetch\(item\.href\)\}/);
});

test("home Leaderboard surfaces prime navigation on user intent", () => {
  for (const path of [
    "components/lobby/LobbyHero.tsx",
    "components/lobby/LeaderboardPanel.tsx",
  ]) {
    const page = source(path);
    assert.match(page, /onMouseEnter=\{\(\) => \{[\s\S]*router\.prefetch\("\/leaderboard"\);[\s\S]*warmLeaderboardClient\(\);[\s\S]*\}\}/);
    assert.match(page, /onFocus=\{\(\) => \{[\s\S]*router\.prefetch\("\/leaderboard"\);[\s\S]*warmLeaderboardClient\(\);[\s\S]*\}\}/);
    assert.match(page, /onPointerDown=\{\(\) => \{[\s\S]*router\.prefetch\("\/leaderboard"\);[\s\S]*warmLeaderboardClient\(\);[\s\S]*\}\}/);
    assert.match(page, /router\.push\("\/leaderboard"\)/);
  }
});

test("Leaderboard client code is warmed through one cached dynamic import", () => {
  const helper = source("lib/leaderboardNavigationWarmup.ts");
  const shell = source("app/AppShell.tsx");

  assert.match(helper, /leaderboardClientWarmPromise \?\?= import\(/);
  assert.match(helper, /ModernLeaderboardPage/);
  const page = source("app/leaderboard/page.tsx");
  assert.match(page, /import \{ ModernLeaderboardPage \}/);
  assert.match(shell, /router\.prefetch\("\/leaderboard"\);[\s\S]*warmLeaderboardClient\(\);[\s\S]*setOpen\(true\);/);
});

test("server-initialized Leaderboard truth survives preference hydration without a duplicate first-page reload", () => {
  const page = source("components/leaderboard/ModernLeaderboardPage.tsx");

  assert.match(page, /previousPreferencesReadyRef = useRef\(livingPreferencesReady\)/);
  assert.match(page, /preferencesJustBecameReady[\s\S]*initialLeaderboard[\s\S]*lane === initialLeaderboard\.lane[\s\S]*scope === initialLeaderboard\.scope[\s\S]*!query[\s\S]*!sortRef\.current\.key[\s\S]*return;/);
});

test("Leaderboard gets one bandwidth-aware idle warm before Kingdom intent", () => {
  const shell = source("app/AppShell.tsx");

  assert.match(shell, /leaderboardIdleWarmRef = React\.useRef\(false\)/);
  assert.match(shell, /connection\?\.saveData[\s\S]*\/\(\^\|-\)2g\$\/[\s\S]*router\.prefetch\("\/leaderboard"\);[\s\S]*warmLeaderboardClient\(\)/);
  assert.match(shell, /setTimeout\(\(\) => \{[\s\S]*requestIdleCallback\([\s\S]*warmLeaderboardNavigation[\s\S]*timeout: 500[\s\S]*\}, 1_400\)/);
});

test("the existing Player Registry prefetch contract stays intact", () => {
  const shell = source("app/AppShell.tsx");
  const menu = source("components/HeaderMenu.tsx");

  assert.match(shell, /prefetch=\{href === "\/players"\}/);
  assert.match(menu, /prefetch=\{entry\.href === "\/players"\}/);
});
