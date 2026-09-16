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
    assert.match(page, /onMouseEnter=\{\(\) => router\.prefetch\("\/leaderboard"\)\}/);
    assert.match(page, /onFocus=\{\(\) => router\.prefetch\("\/leaderboard"\)\}/);
    assert.match(page, /onPointerDown=\{\(\) => router\.prefetch\("\/leaderboard"\)\}/);
    assert.match(page, /router\.push\("\/leaderboard"\)/);
  }
});

test("the existing Player Registry prefetch contract stays intact", () => {
  const shell = source("app/AppShell.tsx");
  const menu = source("components/HeaderMenu.tsx");

  assert.match(shell, /prefetch=\{href === "\/players"\}/);
  assert.match(menu, /prefetch=\{entry\.href === "\/players"\}/);
});
